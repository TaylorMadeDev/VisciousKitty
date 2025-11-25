# TUI Controller

A small terminal UI that talks to the local server (default http://127.0.0.1:8000) and shows a colorful status line with counts and simple interactive commands.

Features:

- Live-like header showing clients online and tasks pending
- Commands to list clients, view mapping, inspect tasks, and add new tasks interactively
- Quick shorthand to add command tasks: `cmd <target> <command...>`

Server/client status updates
 - The client reports its upcoming sleep interval to the server, and the server exposes `/clients_status`.
 - The TUI / `controller.py` will display per-client status including last_seen, sleeping seconds remaining, and whether there are pending tasks.

Results storage
 - Clients POST task results in the request body (the client was updated to send JSON bodies). The server stores results in memory and exposes a `/results` endpoint for retrieval.
 - Use the TUI or REPL command `results <target>` to view stored task results (preview is shown in the UI).
 - Use the TUI or REPL command `results <target>` to view stored task results (preview is shown in the UI).
 - To inspect the full stored result body use the `view <result_id>` command (the `id` column is shown in the results list table).
 - Database commands (new):
	 - `db stats` — show DB stats (record count and DB file path)
	 - `db list`  — list all stored results across all clients (shows `id`, `machine_id`, `task_id`, `timestamp`)
	 - `db del <id>` — delete a specific result record by id

	Payloads
	 - You can upload Python payload files from your controller/TUI and instruct clients to run them as tasks.
	 - Commands:
		 - `upload <path>` — upload a local .py file to the server (controller/TUI)
		 - `payloads` — list uploaded payloads
		 - `addpayload <target> <task_id> <payload_name>` — add a task of type PAYLOAD referencing an uploaded payload by name (e.g. mytask.py)

	The client will fetch the payload content from `/payload?file_name=<name>` and run it as a Python script using the same interpreter.

Requirements:

- Python 3.8+
- See `requirements.txt` (requests, rich)

Quick start (Windows PowerShell):

```powershell
python -m pip install -r requirements.txt
python controller.py        # uses the TUI if rich is installed
python tui_controller.py   # standalone TUI
```

Quick shorthand example:

 - Add a command task to short-id 1 that runs `tree` in PowerShell:

 ```powershell
 cmd 1 tree
 ```

This is supported both in the rich TUI and in the plain fallback REPL.
