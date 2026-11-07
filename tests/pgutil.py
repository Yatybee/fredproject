"""Test helpers: every test gets its own Postgres schema inside the TEST_DATABASE_URL database,
so tests are isolated and never touch real tables. Use a scratch Neon branch, not production."""
import os
import uuid

import psycopg
from psycopg import sql

from referral_tracker.db import connect


def test_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise RuntimeError("Set TEST_DATABASE_URL to a scratch Postgres/Neon database to run the tests.")
    return url


def new_schema():
    return "t_" + uuid.uuid4().hex[:12]


def open_db(schema, init=False):
    return connect(test_url(), init=init, schema=schema)


def drop_schema(schema):
    with psycopg.connect(test_url(), autocommit=True) as c:
        c.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
