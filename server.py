from typing import Dict, List, Optional

from fastapi import FastAPI

app = FastAPI()

# set of raw machine IDs (strings reported by clients)
checked_in_clients: set = set()
# tasks per raw machine_id
tasks_store: Dict[str, List[dict]] = {}
# mapping short numeric IDs (string) -> machine_id
machines_map: Dict[str, str] = {}


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
        return {"status": "checked out", "machine_id": machine_id}
    return {"status": "not found", "machine_id": machine_id}


@app.get("/machines")
def list_machines():
    """Return list of raw machine IDs currently checked in."""
    return {"machines": list(checked_in_clients)}


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
    else:
        t["script"] = script or ""
    tasks_store.setdefault(target, []).append(t)
    return {"status": "task added", "task": t}


@app.get("/tasks")
def get_tasks(machine_id: Optional[str] = None, short_id: Optional[str] = None):
    """Return pending tasks for a machine (by raw machine_id or short_id)."""
    target = _resolve_target(machine_id, short_id)
    if not target:
        return {"tasks": []}
    return {"tasks": tasks_store.get(target, [])}


@app.post("/submittask")
def submit_task(task_id: str, result: str, machine_id: Optional[str] = None, short_id: Optional[str] = None):
    """Accept a finished task result and remove the task from the queue if present."""
    target = _resolve_target(machine_id, short_id)
    if not target:
        return {"status": "target_not_found", "task_id": task_id}
    removed = False
    tasks = tasks_store.get(target, [])
    for t in list(tasks):
        if t.get("task_id") == task_id:
            tasks.remove(t)
            removed = True
    if removed:
        return {"status": "task submitted and removed", "task_id": task_id, "result": result}
    return {"status": "task submitted (was not in queue)", "task_id": task_id, "result": result}