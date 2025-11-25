#!/usr/bin/env python3
"""Simple controller CLI to upload tasks to the server for specific machines.

Usage examples:
  # Add a CMD task
  python controller.py add --machine-id MACHINE_ID --task-id 1 --type CMD --command "whoami"

  # Add a SCRIPT task from a file
  python controller.py add --machine-id MACHINE_ID --task-id 2 --type SCRIPT --script-file ./myscript.ps1

  # List pending tasks for a machine
  python controller.py list --machine-id MACHINE_ID

The controller talks to the local server at http://127.0.0.1:8000 by default.
"""
import argparse
import requests
import sys
import json
import time
from pathlib import Path
from typing import List, Tuple

try:
    # optional improved UI
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.prompt import Prompt
    from rich.align import Align
except Exception:  # pragma: no cover - graceful fallback
    Console = None

SERVER_URL = "http://127.0.0.1:8000"


def add_task(machine_id: str, task_id: str, task_type: str, command: str = None, script: str = None):
    params = {
        "task_id": task_id,
        "task_type": task_type,
    }
    if task_type.upper() == "CMD":
        params["command"] = command or ""
    else:
        params["script"] = script or ""

    # machine_id may be a short numeric id (send as short_id) or a raw machine id
    if machine_id is not None:
        # if machine_id looks numeric use short_id param
        if str(machine_id).isdigit():
            params["short_id"] = str(machine_id)
        else:
            params["machine_id"] = machine_id

    try:
        resp = requests.post(f"{SERVER_URL}/addtask", params=params, timeout=5)
        print(resp.status_code, resp.text)
    except Exception as e:
        print(f"Error adding task: {e}")


def list_tasks(machine_id: str = None, short_id: str = None):
    try:
        params = {}
        if short_id is not None:
            params["short_id"] = short_id
        elif machine_id is not None:
            params["machine_id"] = machine_id
        resp = requests.get(f"{SERVER_URL}/tasks", params=params, timeout=5)
        if resp.status_code == 200:
            try:
                data = resp.json()
            except Exception:
                print(resp.text)
                return
            tasks = data.get("tasks", [])
            if not tasks:
                print("No tasks found for machine_id", machine_id)
                return
            print(json.dumps(tasks, indent=2))
        else:
            print(f"Failed to get tasks: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"Error listing tasks: {e}")


def parse_args(argv):
    p = argparse.ArgumentParser(prog="controller.py", description="Controller to add/list tasks for machines")
    sub = p.add_subparsers(dest="cmd")

    add = sub.add_parser("add", help="Add a task")
    add.add_argument("--machine-id", help="Raw machine_id or numeric short id (digits)")
    add.add_argument("--task-id", required=True)
    add.add_argument("--type", required=True, choices=["CMD", "SCRIPT"], help="Task type")
    add.add_argument("--command", help="Command for CMD tasks (run in PowerShell)")
    add.add_argument("--script-file", help="Path to .ps1 file for SCRIPT tasks")
    ls = sub.add_parser("list", help="List tasks for a machine or short id")
    ls.add_argument("--machine-id", help="Raw machine id")
    ls.add_argument("--short-id", help="Short numeric id assigned to a machine")

    sub.add_parser("machines", help="List currently checked-in raw machine IDs")
    sub.add_parser("mapped", help="List short-id -> machine_id mapping")

    assign = sub.add_parser("assign", help="Assign a short numeric id to a machine")
    assign.add_argument("--machine-id", required=True, help="Raw machine id to map")
    assign.add_argument("--short-id", help="Optional short id to assign (auto if omitted)")

    return p.parse_args(argv)


def main(argv=None):
    # If no CLI args provided, start interactive REPL
    if not (argv or sys.argv[1:]):
        return run_repl()

    args = parse_args(argv or sys.argv[1:])
    if args.cmd == "add":
        if args.type == "CMD":
            if not args.command:
                print("--command is required for CMD tasks")
                return 1
            add_task(args.machine_id, args.task_id, args.type, command=args.command)
            return 0
        else:
            if not args.script_file:
                print("--script-file is required for SCRIPT tasks")
                return 1
            p = Path(args.script_file)
            if not p.exists():
                print("script file not found:", args.script_file)
                return 1
            script_text = p.read_text(encoding="utf-8")
            add_task(args.machine_id, args.task_id, args.type, script=script_text)
            return 0
    elif args.cmd == "list":
        list_tasks(args.machine_id, args.short_id)
        return 0
    elif args.cmd == "machines":
        try:
            resp = requests.get(f"{SERVER_URL}/machines", timeout=5)
            print(resp.status_code, resp.text)
        except Exception as e:
            print(f"Error listing machines: {e}")
        return 0
    elif args.cmd == "mapped":
        try:
            resp = requests.get(f"{SERVER_URL}/mapped", timeout=5)
            print(resp.status_code, resp.text)
        except Exception as e:
            print(f"Error listing mapping: {e}")
        return 0
    elif args.cmd == "assign":
        try:
            params = {"machine_id": args.machine_id}
            if args.short_id:
                params["short_id"] = args.short_id
            resp = requests.post(f"{SERVER_URL}/assign_id", params=params, timeout=5)
            print(resp.status_code, resp.text)
        except Exception as e:
            print(f"Error assigning id: {e}")
        return 0
    else:
        print("No command provided. Use `add` or `list`.")
        return 1


def _print_repl_help():
    print("Available commands:")
    print("  clientlist               - list raw checked-in machine IDs")
    print("  mapped                   - list short-id -> machine_id mapping")
    print("  assign <machine> [id]    - assign a short id to a machine (auto if omitted)")
    print("  addtask <target> <task_id> CMD <command...>")
    print("  addtask <target> <task_id> SCRIPT <script-file>")
    print("       <target> may be a raw machine_id or a numeric short id")
    print("  listtasks <target>       - list pending tasks for a machine or short id")
    print("  results <target>         - list stored results for a machine or short id")
    print("  view <result_id>         - view full stored result by id")
    print("  upload <path>            - upload a .py payload to server")
    print("  payloads                 - list available payloads on server")
    print("  addpayload <target> <task_id> <payload_name> - add PAYLOAD task referencing uploaded payload")
    print("  db stats                 - show DB stats (count & file)")
    print("  db list                  - list all results in DB")
    print("  db del <id>              - delete result by id")
    print("  cmd <target> <command...> - quick add CMD task (shorthand)")
    print("  help                     - show this help")
    print("  exit | quit              - exit the controller")


def run_repl() -> int:
    """Run an interactive REPL for controlling machines/tasks.

    If `rich` is available this function presents a nicer, colored TUI with
    a header showing counts and simple commands. If rich is not installed we
    fall back to the existing plain-text REPL.
    """
    if Console:
        return run_tui()

    print("Controller interactive mode. Type 'help' for commands.")
    while True:
        try:
            line = input("controller> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        parts = line.split()
        cmd = parts[0].lower()
        if cmd in ("exit", "quit", "q"):
            break
        if cmd in ("help", "h", "?"):
            _print_repl_help()
            continue
        if cmd in ("clientlist", "clients", "machines"):
            try:
                # prefer clients_status endpoint if available
                resp = requests.get(f"{SERVER_URL}/clients_status", timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    # pretty-print mapping
                    mapping = data.get("clients_status", {})
                    print(json.dumps(mapping, indent=2))
                else:
                    # fallback to old /machines endpoint
                    resp2 = requests.get(f"{SERVER_URL}/machines", timeout=5)
                    print(resp2.status_code, resp2.text)
            except Exception as e:
                print("Error:", e)
            continue
        if cmd in ("mapped", "map"):
            try:
                resp = requests.get(f"{SERVER_URL}/mapped", timeout=5)
                print(resp.status_code, resp.text)
            except Exception as e:
                print("Error:", e)
            continue
        if cmd == "assign":
            if len(parts) < 2:
                print("Usage: assign <machine_id> [short_id]")
                continue
            machine = parts[1]
            short = parts[2] if len(parts) >= 3 else None
            try:
                params = {"machine_id": machine}
                if short:
                    params["short_id"] = short
                resp = requests.post(f"{SERVER_URL}/assign_id", params=params, timeout=5)
                print(resp.status_code, resp.text)
            except Exception as e:
                print("Error:", e)
            continue
        if cmd == "addtask":
            # addtask <target> <task_id> CMD <command...>
            # addtask <target> <task_id> SCRIPT <script-file>
            if len(parts) < 4:
                print("Usage: addtask <target> <task_id> CMD <command...> | SCRIPT <script-file>")
                continue
            target = parts[1]
            task_id = parts[2]
            ttype = parts[3].upper()
            if ttype == "CMD":
                # command is remainder of the line after the first four tokens
                # find index of fourth token in original line
                try:
                    idx = line.lower().index(parts[3].lower())
                    # + len(parts[3]) + 1 to get past the token and a space
                    cmd_text = line[idx + len(parts[3]) :].strip()
                except Exception:
                    cmd_text = ""
                if not cmd_text:
                    print("No command provided for CMD task")
                    continue
                add_task(target, task_id, "CMD", command=cmd_text)
            elif ttype == "SCRIPT":
                if len(parts) < 5:
                    print("Usage: addtask <target> <task_id> SCRIPT <script-file>")
                    continue
                script_file = parts[4]
                p = Path(script_file)
                if not p.exists():
                    print("script file not found:", script_file)
                    continue
                script_text = p.read_text(encoding="utf-8")
                add_task(target, task_id, "SCRIPT", script=script_text)
            else:
                print("Unknown task type. Use CMD or SCRIPT")
            continue
        # Quick shorthand: cmd <target> <command...>
        if cmd == "cmd":
            if len(parts) < 3:
                print("Usage: cmd <target> <command...>")
                continue
            target = parts[1]
            # command is remainder of the input after the second token
            try:
                idx = line.lower().index(parts[1].lower())
                # + len(parts[1]) + 1 moves past target and a space
                cmd_text = line[idx + len(parts[1]) :].strip()
            except Exception:
                cmd_text = ""
            if not cmd_text:
                print("No command provided for CMD task")
                continue
            # generate a simple task id
            import uuid as _uuid
            task_id = str(_uuid.uuid4())
            add_task(target, task_id, "CMD", command=cmd_text)
            continue
        if cmd == "listtasks":
            if len(parts) < 2:
                print("Usage: listtasks <target>")
                continue
            target = parts[1]
            if target.isdigit():
                list_tasks(None, target)
            else:
                list_tasks(target, None)
            continue
        if cmd == "results":
            if len(parts) < 2:
                print("Usage: results <target>")
                continue
            target = parts[1]
            try:
                if target.isdigit():
                    r = requests.get(f"{SERVER_URL}/results", params={"short_id": target}, timeout=5)
                else:
                    r = requests.get(f"{SERVER_URL}/results", params={"machine_id": target}, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    print(json.dumps(data.get("results", []), indent=2))
                else:
                    print(r.status_code, r.text)
            except Exception as e:
                print("Error getting results:", e)
            continue
        if cmd == "upload":
            if len(parts) < 2:
                print("Usage: upload <file_path>")
                continue
            fp = parts[1]
            p = Path(fp)
            if not p.exists():
                print("file not found:", fp)
                continue
            try:
                content = p.read_text(encoding="utf-8")
                resp = requests.post(f"{SERVER_URL}/upload_payload", json={"file_name": p.name, "content": content}, timeout=5)
                print(resp.status_code, resp.text)
            except Exception as e:
                print("Error uploading payload:", e)
            continue
        if cmd == "payloads":
            try:
                r = requests.get(f"{SERVER_URL}/payloads", timeout=5)
                if r.status_code == 200:
                    print(json.dumps(r.json().get("payloads", []), indent=2))
                else:
                    print(r.status_code, r.text)
            except Exception as e:
                print("Error listing payloads:", e)
            continue
        if cmd == "addpayload":
            # addpayload <target> <task_id> <payload_name>
            if len(parts) < 4:
                print("Usage: addpayload <target> <task_id> <payload_name>")
                continue
            target = parts[1]
            task_id = parts[2]
            payload_name = parts[3]
            add_task(target, task_id, "PAYLOAD", command=payload_name)
            continue
        if cmd == "db":
            if len(parts) < 2:
                print("Usage: db stats|list|del <id>")
                continue
            sub = parts[1]
            if sub == "stats":
                try:
                    r = requests.get(f"{SERVER_URL}/db_stats", timeout=5)
                    print(r.status_code, r.text)
                except Exception as e:
                    print("Error getting db stats:", e)
                continue
            if sub in ("list", "all"):
                try:
                    r = requests.get(f"{SERVER_URL}/results_all", timeout=5)
                    if r.status_code == 200:
                        print(json.dumps(r.json().get("results", []), indent=2))
                    else:
                        print(r.status_code, r.text)
                except Exception as e:
                    print("Error getting results:", e)
                continue
            if sub in ("del", "delete"):
                if len(parts) < 3:
                    print("Usage: db del <id>")
                    continue
                rid = parts[2]
                try:
                    r = requests.delete(f"{SERVER_URL}/result", params={"id": rid}, timeout=5)
                    print(r.status_code, r.text)
                except Exception as e:
                    print("Error deleting result:", e)
                continue
        if cmd == "view":
            if len(parts) < 2:
                print("Usage: view <result_id>")
                continue
            rid = parts[1]
            try:
                r = requests.get(f"{SERVER_URL}/result", params={"id": rid}, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    print(json.dumps(data.get("result"), indent=2))
                else:
                    print(r.status_code, r.text)
            except Exception as e:
                print("Error fetching result:", e)
            continue
        print("Unknown command. Type 'help' to see available commands.")
    return 0


def _get_counts(server_url: str) -> Tuple[int, int]:
    """Return tuple (#clients, #tasks_total) by querying the server."""
    try:
        resp = requests.get(f"{SERVER_URL}/machines", timeout=3)
        machines = []
        if resp.status_code == 200:
            machines = resp.json().get("machines", [])
    except Exception:
        machines = []

    total_tasks = 0
    for mid in machines:
        try:
            r = requests.get(f"{SERVER_URL}/tasks", params={"machine_id": mid}, timeout=2)
            if r.status_code == 200:
                total_tasks += len(r.json().get("tasks", []))
        except Exception:
            continue

    return len(machines), total_tasks


def run_tui() -> int:
    """Run a small TUI powered by `rich` that shows colored counts and offers commands."""
    console = Console()
    console.clear()
    console.print(Panel(Align.center("Controller - TUI mode"), style="bold blue"))

    try:
        while True:
            clients, tasks = _get_counts(SERVER_URL)
            header = f"[bold green]{clients} clients online[/]  |  [bold yellow]{tasks} tasks pending[/]"
            console.print(Panel(header, subtitle=f"server={SERVER_URL}", style="cyan"))

            # show short help
            console.print("Commands: [b]l[/] list clients  [b]m[/] mapping  [b]t <target>[/] tasks  [b]a[/] add task  [b]q[/] quit", style="dim")

            raw = Prompt.ask("Command (q to quit)")
            if not raw:
                continue
            cmd = raw.strip()
            if cmd.lower() in ("q", "quit", "exit"):
                break
            if cmd.lower() in ("l", "clients"):
                try:
                    r = requests.get(f"{SERVER_URL}/clients_status", timeout=3)
                    if r.status_code == 200:
                        mapping = r.json().get("clients_status", {})
                    else:
                        r2 = requests.get(f"{SERVER_URL}/machines", timeout=3)
                        mapping = {m: {} for m in (r2.json().get("machines", []) if r2.status_code == 200 else [])}
                except Exception as e:
                    mapping = {"error": str(e)}

                t = Table(show_header=True, header_style="bold magenta")
                t.add_column("#")
                t.add_column("machine_id")
                t.add_column("last_seen")
                t.add_column("sleeping_in(s)")
                t.add_column("has_task")
                now = time.time()
                for i, (m, s) in enumerate(mapping.items(), start=1):
                    if isinstance(s, dict):
                        last_seen = s.get("last_seen")
                        ago = "-"
                        if last_seen:
                            ago = f"{int(now - float(last_seen))}s ago"
                        secs_until = s.get("secs_until")
                        secs_until = str(secs_until) if secs_until is not None else "-"
                        has_task = str(s.get("has_task", False))
                    else:
                        ago = "-"
                        secs_until = "-"
                        has_task = "-"
                    t.add_row(str(i), m, ago, secs_until, has_task)
                console.print(t)
                Prompt.ask("Press Enter to continue")
                console.clear()
                continue

            if cmd.lower() in ("m", "map", "mapped"):
                try:
                    r = requests.get(f"{SERVER_URL}/mapped", timeout=3)
                    mapping = r.json().get("mapping", {}) if r.status_code == 200 else {}
                except Exception as e:
                    mapping = {"error": str(e)}

                t = Table(show_header=True, header_style="bold magenta")
                t.add_column("short_id")
                t.add_column("machine_id")
                for sid, mid in mapping.items():
                    t.add_row(str(sid), mid)
                console.print(t)
                Prompt.ask("Press Enter to continue")
                console.clear()
                continue

            if cmd.lower().startswith("t "):
                target = cmd.split(None, 1)[1]
                try:
                    params = {"short_id": target} if target.isdigit() else {"machine_id": target}
                    r = requests.get(f"{SERVER_URL}/tasks", params=params, timeout=3)
                    tasks_list = r.json().get("tasks", []) if r.status_code == 200 else []
                except Exception as e:
                    tasks_list = [{"error": str(e)}]

                t = Table(show_header=True, header_style="bold magenta")
                t.add_column("task_id")
                t.add_column("type")
                t.add_column("payload")
                for tk in tasks_list:
                    tid = tk.get("task_id") or tk.get("id") or "unknown"
                    typ = tk.get("type")
                    payload = tk.get("command") or tk.get("script") or ""
                    if len(payload) > 120:
                        payload = payload[:120] + "..."
                    t.add_row(str(tid), str(typ), payload)
                console.print(t)
                Prompt.ask("Press Enter to continue")
                console.clear()
                continue

            if cmd.lower().startswith("results ") or cmd.lower() == "results":
                # show stored results for a target
                parts = cmd.split()
                if len(parts) >= 2:
                    target = parts[1]
                else:
                    target = Prompt.ask("Target (short id or machine_id)")
                try:
                    params = {"short_id": target} if str(target).isdigit() else {"machine_id": target}
                    r = requests.get(f"{SERVER_URL}/results", params=params, timeout=5)
                    results = r.json().get("results", []) if r.status_code == 200 else []
                except Exception as e:
                    results = [{"error": str(e)}]

                t = Table(show_header=True, header_style="bold magenta")
                t.add_column("id")
                t.add_column("task_id")
                t.add_column("timestamp")
                t.add_column("result_preview")
                for res in results:
                    tid = res.get("task_id")
                    ts = res.get("timestamp")
                    body = res.get("result", "")
                    preview = (body[:120] + "...") if isinstance(body, str) and len(body) > 120 else str(body)
                    t.add_row(str(tid), str(ts), preview)
                console.print(t)
                Prompt.ask("Press Enter to continue")
                console.clear()
                continue

            if cmd.lower().startswith("view ") or cmd.lower() == "view":
                parts = cmd.split()
                if len(parts) >= 2:
                    rid = parts[1]
                else:
                    rid = Prompt.ask("Result id to view")
                try:
                    r = requests.get(f"{SERVER_URL}/result", params={"id": rid}, timeout=5)
                    if r.status_code == 200:
                        data = r.json()
                        if Console:
                            console.print(Panel(json.dumps(data.get("result"), indent=2), title=f"Result {rid}", style="green"))
                        else:
                            print(json.dumps(data.get("result"), indent=2))
                    else:
                        if Console:
                            console.print(f"Error fetching result: {r.status_code}", style="bold red")
                        else:
                            print(r.status_code, r.text)
                except Exception as e:
                    if Console:
                        console.print(f"Error fetching result: {e}", style="bold red")
                    else:
                        print("Error fetching result:", e)
                Prompt.ask("Press Enter to continue")
                console.clear()
                continue

            # quick shorthand: cmd <target> <command...>
            if cmd.lower().startswith("cmd ") or cmd.lower() == "cmd":
                # handle either 'cmd <target> <command...>' or 'cmd' (prompt)
                parts = cmd.split()
                if len(parts) >= 3:
                    target = parts[1]
                    # command is remainder after the first two tokens
                    cmd_text = cmd.split(None, 2)[2]
                else:
                    # interactive: ask for values
                    target = Prompt.ask("Target (short id or machine_id)")
                    cmd_text = Prompt.ask("Command to run in PowerShell")

                if not target or not cmd_text:
                    console.print("Missing target or command", style="bold red")
                    Prompt.ask("Press Enter to continue")
                    console.clear()
                    continue

                # generate a simple unique task id
                import uuid as _uuid
                task_id = str(_uuid.uuid4())
                params = {"task_id": task_id, "task_type": "CMD", "command": cmd_text}
                if target.isdigit():
                    params["short_id"] = str(target)
                else:
                    params["machine_id"] = target

                try:
                    resp = requests.post(f"{SERVER_URL}/addtask", params=params, timeout=5)
                    console.print_json(data=resp.json())
                except Exception as e:
                    console.print(f"Error adding task: {e}", style="bold red")

                Prompt.ask("Press Enter to continue")
                console.clear()
                continue

            if cmd.lower().startswith("a"):
                target = Prompt.ask("Target (short id or machine_id)")
                task_id = Prompt.ask("Task id")
                ttype = Prompt.ask("Type", choices=["CMD", "SCRIPT"], default="CMD")
                if ttype.upper() == "CMD":
                    command = Prompt.ask("Command")
                    params = {"task_id": task_id, "task_type": "CMD", "command": command}
                else:
                    console.print("Enter script (end with a single line containing only EOF)")
                    lines: List[str] = []
                    while True:
                        ln = Prompt.ask(":")
                        if ln.strip() == "EOF":
                            break
                        lines.append(ln)
                    script = "\n".join(lines)
                    params = {"task_id": task_id, "task_type": "SCRIPT", "script": script}

                if target.isdigit():
                    params["short_id"] = str(target)
                else:
                    params["machine_id"] = target

                try:
                    resp = requests.post(f"{SERVER_URL}/addtask", params=params, timeout=5)
                    console.print_json(data=resp.json())
                except Exception as e:
                    console.print(f"Error adding task: {e}", style="bold red")

                Prompt.ask("Press Enter to continue")
                console.clear()
                continue

            console.print("Unknown command", style="bold red")

    except KeyboardInterrupt:
        pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
