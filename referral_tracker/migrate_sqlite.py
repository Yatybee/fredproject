"""One-off copy of an existing SQLite file into the Postgres (Neon) database.

    set DATABASE_URL=postgresql://...      (the Neon connection string)
    python -m referral_tracker.migrate_sqlite referrals.db

The target tables must be empty (a fresh Neon database is). Ids are preserved, and the identity
counters are moved past the largest copied id so new rows do not collide.
"""
import sqlite3
import sys

from .db import connect

# Parents before children, so foreign keys hold while copying.
TABLES = ["users", "facilities", "patients", "referrals", "followups",
          "notifications", "audit_log", "referral_history", "sessions"]


def main(path):
    src = sqlite3.connect(path)
    src.row_factory = sqlite3.Row
    dst = connect()
    try:
        for t in TABLES:
            if dst.execute(f"SELECT 1 FROM {t} LIMIT 1").fetchone():
                sys.exit(f"Target table '{t}' is not empty; migrate into a fresh database.")
        for t in TABLES:
            rows = src.execute(f"SELECT * FROM {t}").fetchall()
            if not rows:
                continue
            cols = rows[0].keys()
            names = ", ".join(f'"{c}"' for c in cols)
            marks = ",".join("?" * len(cols))
            for r in rows:
                dst.execute(f"INSERT INTO {t} ({names}) VALUES ({marks})", tuple(r))
            if "id" in cols:
                dst.execute(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), (SELECT MAX(id) FROM {t}))")
            print(f"{t}: {len(rows)} row(s)")
        dst.commit()
    except Exception:
        dst.rollback()
        raise
    finally:
        dst.close()
        src.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m referral_tracker.migrate_sqlite <sqlite file>")
    main(sys.argv[1])
