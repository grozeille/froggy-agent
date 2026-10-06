#!/usr/bin/env python3
"""Read froggy-agent chat sessions from VS Code globalState (dev helper).

Sessions live in <user-data-dir>/User/globalStorage/state.vscdb under the
extension's globalState key. The DB is copied before reading so a running
VS Code never blocks us (and we never touch the live file).

Usage:
    python scripts/read-sessions.py [--list] [--session <id>] [--user-data-dir <dir>]

Defaults to dumping the main chat transcript (id "main").
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
import tempfile

STORAGE_KEY = "froggy.sessions.v1"
MAIN_SESSION_ID = "main"


def default_user_data_dir() -> str:
    if os.name == "nt":
        return os.path.join(os.environ.get("APPDATA", ""), "Code", "User")
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/Code/User")
    return os.path.expanduser("~/.config/Code/User")


def load_sessions(user_data_dir: str) -> list:
    db = os.path.join(user_data_dir, "globalStorage", "state.vscdb")
    if not os.path.isfile(db):
        raise SystemExit(f"state.vscdb not found: {db}")
    with tempfile.NamedTemporaryFile(suffix=".vscdb", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        shutil.copyfile(db, tmp_path)
        conn = sqlite3.connect(tmp_path)
        try:
            rows = conn.execute("SELECT key, value FROM ItemTable").fetchall()
        finally:
            conn.close()
    finally:
        os.unlink(tmp_path)
    for _key, value in rows:
        if isinstance(value, bytes):
            try:
                value = value.decode("utf-8")
            except UnicodeDecodeError:
                continue
        if isinstance(value, str) and STORAGE_KEY in value:
            try:
                data = json.loads(value)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and isinstance(data.get(STORAGE_KEY), list):
                return data[STORAGE_KEY]
    raise SystemExit(f"No {STORAGE_KEY} data found in {db}")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Dump froggy-agent chat sessions.")
    parser.add_argument("--list", action="store_true", help="List sessions only.")
    parser.add_argument("--session", default=MAIN_SESSION_ID, help="Session id to dump.")
    parser.add_argument("--user-data-dir", default=default_user_data_dir())
    args = parser.parse_args()

    sessions = load_sessions(args.user_data_dir)
    if args.list:
        for s in sessions:
            print(
                f"{s.get('id')}  {s.get('title')}  "
                f"({len(s.get('messages', []))} messages)"
            )
        return
    session = next((s for s in sessions if s.get("id") == args.session), None)
    if session is None:
        raise SystemExit(f"Session {args.session!r} not found.")
    print(f"=== {session.get('title')} ({session.get('id')}) ===")
    for msg in session.get("messages", []):
        role = msg.get("role", "?").upper()
        print(f"\n--- {role} ---")
        print(msg.get("text", ""))


if __name__ == "__main__":
    main()
