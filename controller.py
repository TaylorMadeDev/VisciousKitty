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
from pathlib import Path

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
    print("  help                     - show this help")
    print("  exit | quit              - exit the controller")


def run_repl() -> int:
    """Run an interactive REPL for controlling machines/tasks."""
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
                resp = requests.get(f"{SERVER_URL}/machines", timeout=5)
                print(resp.status_code, resp.text)
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
        print("Unknown command. Type 'help' to see available commands.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
