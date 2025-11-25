# VisciousKitty

VisciousKitty is a small command-and-control (C2) style toolkit for experimenting with distributed task execution: a Python FastAPI server, lightweight Python clients, persistent result storage using TinyDB, and a modern React web UI for operators.

This repository is intended for local development, learning, and small-scale experimentation. It is NOT intended for any malicious use. Use responsibly and only in environments you control.

**Contents**
- `server.py` — FastAPI backend that manages clients, queues tasks, stores payloads, and persists results with TinyDB.
- `client.py` — Example client that polls the server for tasks, executes commands / Python payloads, and posts results.
- `payloads/` — Directory used by the server to store uploaded Python payload files.
- `data/db.json` — TinyDB database file (created automatically) storing results and payload metadata.
- `webui/` — React-based operator UI (located under `webui/`): `src/App.js`, `src/App.css` are the main files.

**High-level architecture**
- Controller (server.py): exposes REST endpoints for check-in, status updates, adding tasks, uploading payloads, fetching results, and lightweight stats.
- Worker (client.py): polls `/tasks`, executes task types (`CMD`, `PAYLOAD`, `SCRIPT`), and posts execution results to `/submittask`.
- Operator UI (webui): shows clients, tasks, payloads, results; supports sending commands and payloads to individual machines, editing payloads in-browser, and browsing/purging results.

**Key features**
- Short numeric machine IDs: server assigns small numeric IDs to machines for convenience.
- Payload system: upload Python files via `/upload_payload`; clients request and execute payloads.
- Persistent results: results are stored in TinyDB and viewable in the web UI.
- Operator web UI: dark, animated UI with a per-machine control panel (terminal-like input), payload editor, centralized payload list, and a results browser with search/filters and bulk delete.
- Client-suggested backoff: `/tasks` returns a `recommended_sleep` value so clients can back off when idle.
- Reduced polling: the UI polls aggregated endpoints (`/tasks_count`, `/clients_status`) and keeps a per-second tick for live countdowns locally.

**Server endpoints (summary)**
- `POST /checkin?machine_id=...` — register a machine.
- `POST /checkout?machine_id=...` — unregister a machine.
- `POST /status_update?machine_id=...&sleeping_for=...` — heartbeat and upcoming sleep window.
- `GET /clients_status` — mapping of machine_id -> last_seen, sleeping_until, has_task.
- `POST /addtask` — add a task for a machine. Query parameters currently used: `task_id`, `task_type`, `machine_id`/`short_id`, `command`/`script`.
- `POST /upload_payload` — upload a Python payload (JSON body with `file_name` and `content`).
- `GET /payloads` — list payload records.
- `GET /payload?file_name=...` — fetch payload content.
- `GET /tasks?machine_id=...|short_id=...` — get pending tasks and `recommended_sleep`.
- `GET /tasks_count` — lightweight total of pending tasks.
- `POST /submittask` — client posts result JSON body `{task_id, result, machine_id?, short_id?}`.
- `GET /results?machine_id=...|short_id=...` — list results for a machine.
- `GET /result?id=...` — fetch a single stored result.
- `GET /results_all` — return all results (used by web UI results browser).
- `DELETE /result?id=...` — delete a stored result by id.

Data persistence
- TinyDB is used for `results` and `payloads` tables (file: `data/db.json`).
- Payload files are stored in the `payloads/` directory on disk; TinyDB stores simple metadata including a `timestamp` and a UUID `id`.

Running locally (quick start)
1. Install Python requirements (from repository root):
   ```powershell
   pip install fastapi uvicorn tinydb pydantic
   ```
2. Start the backend server:
   ```powershell
   python -m uvicorn server:app --reload
   ```
   The API defaults to `http://127.0.0.1:8000`.
3. Run a sample client (in a separate terminal) to connect to the server and poll for tasks:
   ```powershell
   python client.py
   ```
4. Run the React web UI (from `webui/`):
   ```powershell
   cd webui
   npm install
   npm start
   ```
   The UI runs at `http://localhost:3000` and uses the server API at `http://127.0.0.1:8000` by default.

Operator workflow (common tasks)
- Upload a payload: open `Payloads` in the web UI, click *Browse* and upload a `.py` file. It becomes available in the payload list.
- Edit a payload: click a payload in the `Payloads` table to open the inline editor, edit, and click `Save` to update the server copy.
- Send a payload: from the payload editor or machine actions, choose a target machine and `Send` to enqueue a `PAYLOAD` task.
- Run a one-off command: click a machine row to open its MachinePanel, type a command into the terminal input and press Enter or click `Run` — output appears in the terminal window when the client posts the result.
- Browse results: open `Results` to see a full, searchable list of stored results, use checkboxes to bulk-delete, and view any result in full.

Development notes & decisions
- Web UI: The front-end is a single-page React app. The main files you’ll work with are `webui/src/App.js` (UI logic & components) and `webui/src/App.css` (styles + animations).
- Result visibility: The `ResultsPanel` was replaced with a results browser that fetches `/results_all` and provides client-side filtering, select-all, and bulk delete features.
- Client backoff: `/tasks` returns `recommended_sleep` to reduce client polling; the client respects that with jitter.
- Live UI countdowns: the UI uses a centralized one-second tick to compute and animate `sleeping_in(s)` countdowns.
- Security: the repo is for local testing. Running arbitrary uploaded Python payloads on remote hosts is inherently dangerous; ensure clients run in isolated test VMs or containers.

Possible next improvements
- Replace polling with server push using WebSockets or Server-Sent Events (SSE) for instant updates.
- Add server-side search and pagination for results to scale beyond in-memory or TinyDB sizes.
- Replace `confirm()` prompts with a small in-app modal component for better UX and testability.
- Integrate a richer in-browser editor (Monaco or CodeMirror) for payload editing and syntax highlighting.
- Add permissions / authentication on the API for multi-user setups.

Contributing
- Pull requests welcome. Please keep changes focused and update the README with any new endpoints or behavior.

License & disclaimers
- This project is provided as-is for learning and experimentation. No license file is included by default; add an appropriate license if you plan to publish this code.
- Do not use this project for unauthorized access or any harmful activities.

---
If you want, I can also:
- Add a `README.md` inside `webui/` with instructions specific to the React app.
- Add example `docker-compose` to run the server + web UI quickly.
- Add tests or a simple CI workflow for basic linting and type checks.

Contact / author
- Repository: VisciousKitty (local workspace)
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
