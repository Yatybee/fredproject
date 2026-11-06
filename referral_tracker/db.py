"""SQLite connection and schema."""
import sqlite3
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN','HEALTH_WORKER','VIEWER')),
    active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS facilities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    facility_id INTEGER NOT NULL REFERENCES facilities(id),
    referred_by INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    referring_facility TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    urgency TEXT NOT NULL CHECK (urgency IN ('ROUTINE','URGENT','EMERGENCY')),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','ATTENDED','COMPLETED','NO_SHOW','CANCELLED')),
    referral_date TEXT NOT NULL,
    expected_by TEXT NOT NULL,
    attended_on TEXT,
    confirmed_by INTEGER REFERENCES users(id),
    outcome TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_referrals_status ON referrals(status);
CREATE TABLE IF NOT EXISTS followups (
    id INTEGER PRIMARY KEY,
    referral_id INTEGER NOT NULL REFERENCES referrals(id),
    scheduled_for TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    referral_id INTEGER NOT NULL REFERENCES referrals(id),
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    created_on TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, referral_id, kind, created_on)
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    user_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS referral_history (
    id INTEGER PRIMARY KEY,
    referral_id INTEGER NOT NULL REFERENCES referrals(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    at TEXT NOT NULL DEFAULT (datetime('now')),
    note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_history_referral ON referral_history(referral_id);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
);
"""


# Columns added after the first release; applied to databases created earlier.
MIGRATIONS = [
    ("patients", "address", "TEXT NOT NULL DEFAULT ''"),
    ("referrals", "referring_facility", "TEXT NOT NULL DEFAULT ''"),
    ("referrals", "notes", "TEXT NOT NULL DEFAULT ''"),
]


def _migrate(conn):
    for table, column, ddl in MIGRATIONS:
        have = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if column not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
    conn.commit()


def connect(path, init=True):
    """init=False skips the (idempotent) schema script, for per-request connections."""
    conn = sqlite3.connect(path, timeout=10, check_same_thread=False)  # one request = one conn
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if init:
        conn.execute("PRAGMA journal_mode = WAL")  # readers don't block the writer
        conn.executescript(SCHEMA)
        _migrate(conn)
    return conn


@contextmanager
def transaction(conn):
    """Commit on success, roll back on any error, so a failure never leaves half-written data."""
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
