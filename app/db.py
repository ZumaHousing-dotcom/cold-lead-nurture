"""SQLite storage. One short-lived connection per call (safe across threads)."""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    email         TEXT PRIMARY KEY,
    first_name    TEXT,
    room_interest TEXT,
    step          TEXT,
    source        TEXT NOT NULL DEFAULT 'netlify_form',
    status        TEXT NOT NULL DEFAULT 'started',   -- started | completed
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    completed_at  TEXT,
    abandoned_at  TEXT,                              -- set once form-abandoned tag is applied
    nudge_line    TEXT,
    version       INTEGER NOT NULL DEFAULT 1,        -- bumped on every change
    synced_version INTEGER NOT NULL DEFAULT 0        -- last version pushed to Mailchimp
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, abandoned_at, updated_at);
"""


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Database:
    def __init__(self, path: str):
        self.path = path
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with self._conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            yield conn
            conn.commit()
        finally:
            conn.close()

    def get(self, email: str) -> Optional[sqlite3.Row]:
        with self._conn() as c:
            return c.execute("SELECT * FROM leads WHERE email=?", (email,)).fetchone()

    def upsert_lead(self, *, email: str, first_name: str, room_interest: str, step: str,
                    completed: bool, source: str, now: Optional[datetime] = None) -> sqlite3.Row:
        """Insert/update a lead. A completed lead is never moved back to 'started'."""
        ts = iso(now or utcnow())
        with self._conn() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT * FROM leads WHERE email=?", (email,)).fetchone()
            if row is None:
                c.execute(
                    """INSERT INTO leads (email, first_name, room_interest, step, source, status,
                       created_at, updated_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?)""",
                    (email, first_name or None, room_interest or None, step or None, source,
                     "completed" if completed else "started", ts, ts, ts if completed else None),
                )
            else:
                already_done = row["status"] == "completed"
                new_status = "completed" if (completed or already_done) else "started"
                # Late "started" pings (e.g. racing the completion) change nothing.
                if already_done and not completed:
                    return row
                c.execute(
                    """UPDATE leads SET
                         first_name    = COALESCE(NULLIF(?, ''), first_name),
                         room_interest = COALESCE(NULLIF(?, ''), room_interest),
                         step          = COALESCE(NULLIF(?, ''), step),
                         status        = ?,
                         completed_at  = CASE WHEN ?='completed' AND completed_at IS NULL THEN ? ELSE completed_at END,
                         updated_at    = ?,
                         version       = version + 1
                       WHERE email=?""",
                    (first_name, room_interest, step, new_status, new_status, ts, ts, email),
                )
            return c.execute("SELECT * FROM leads WHERE email=?", (email,)).fetchone()

    def mark_synced(self, email: str, version: int) -> None:
        with self._conn() as c:
            c.execute("UPDATE leads SET synced_version=? WHERE email=? AND synced_version<?",
                      (version, email, version))

    def unsynced(self, limit: int = 100) -> list[sqlite3.Row]:
        with self._conn() as c:
            return c.execute(
                "SELECT * FROM leads WHERE synced_version < version ORDER BY updated_at LIMIT ?",
                (limit,)).fetchall()

    def abandoned_candidates(self, abandon_after_min: int, now: Optional[datetime] = None,
                             limit: int = 100) -> list[sqlite3.Row]:
        """Started, not yet tagged abandoned, idle for more than abandon_after_min."""
        cutoff = iso((now or utcnow()) - timedelta(minutes=abandon_after_min))
        with self._conn() as c:
            return c.execute(
                """SELECT * FROM leads
                   WHERE status='started' AND abandoned_at IS NULL AND updated_at < ?
                   ORDER BY updated_at LIMIT ?""", (cutoff, limit)).fetchall()

    def save_nudge_line(self, email: str, line: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE leads SET nudge_line=? WHERE email=?", (line, email))

    def mark_abandoned(self, email: str, now: Optional[datetime] = None) -> None:
        with self._conn() as c:
            # Only if still 'started' - a lead that completed meanwhile must not be tagged.
            c.execute("UPDATE leads SET abandoned_at=? WHERE email=? AND status='started'",
                      (iso(now or utcnow()), email))
