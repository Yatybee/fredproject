# Referral Tracking and Follow-Up System

A system for a community health center to track patients it refers to hospitals
and specialist facilities. It is not a full hospital management system.

- **Backend:** Python 3.12, FastAPI, PostgreSQL (hosted on Neon). The business logic is a plain Python service
  layer (`referral_tracker/service.py`) that has no web dependency.
- **Frontend:** React (Vite) + Tailwind CSS, in `frontend/`.
- **Also included:** the original command-line interface, which uses the same service layer
  and the same database (see "Command-line interface" below).

```
frontend/ (React, Tailwind)  --HTTP/JSON, HttpOnly cookie-->  referral_tracker/api/ (FastAPI)
                                                                      |
                                              referral_tracker/service.py  (rules, permissions, validation)
                                                                      |
                                                              db.py -> Neon PostgreSQL
```

## Running the web application

Requirements: Python 3.12+, Node.js 20+.

```
pip install -r requirements.txt
cd frontend && npm install && cd ..
```

**0. Point the app at your Neon database.** In the Neon dashboard choose *Connect* and copy
the connection string, then set it (see [.env.example](.env.example)):

```
set DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require
```

The tables are created automatically the first time the app starts. To bring over data from
an old `referrals.db` file, run once: `python -m referral_tracker.migrate_sqlite referrals.db`
(into an empty Neon database).

**1. Create the first administrator** (once; there is no public sign-up, by design):

```
python -m referral_tracker init-admin admin        # prompts for a password (min. 8 characters)
```

**2a. Single-port mode (like production):**

```
cd frontend && npm run build && cd ..
python -m uvicorn referral_tracker.api.main:app --port 8000
```
Open http://localhost:8000. FastAPI serves both the API and the built React app.

**2b. Development mode (hot reload):** use two terminals.

```
python -m uvicorn referral_tracker.api.main:app --reload --port 8000     # terminal 1
cd frontend && npm run dev                                               # terminal 2
```
Open http://localhost:5173. Vite proxies `/api` to port 8000, so the cookie stays same-origin.

Then sign in as the admin and create staff accounts (**Staff accounts**). Receiving facilities
can be added from **Facilities**, or directly from the New referral form if the one you need
is missing (the half-completed form is kept).

Upgrading an existing database is automatic: the new columns (patient address, referring
facility, notes) are added the first time the server starts.

Settings (environment variables): `DATABASE_URL` (Neon connection string, required),
`REFERRAL_LOG` (default `referral_tracker.log`), `REFERRAL_NOTIFY_INTERVAL` (default 3600), `REFERRAL_COOKIE_SECURE=1` (set this when
serving over HTTPS). Interactive API documentation is at http://localhost:8000/api/docs.

Alerts for overdue referrals and due follow-ups are generated automatically when the server
starts and then every hour (`REFERRAL_NOTIFY_INTERVAL` seconds; `0` disables it). They can also
be generated on demand with **Check for new alerts** or the `notify` command.

### Roles

| Role | Can do |
|---|---|
| ADMIN | everything, including editing/deleting facilities and staff accounts |
| HEALTH_WORKER | register patients, create/update referrals, confirm attendance, follow-ups, notifications, reports, **add** facilities |
| VIEWER | read-only: referrals, patients, follow-ups, facilities, reports |

Permissions are enforced by the server (`security.PERMISSIONS`); the UI only hides buttons
the user could not use anyway.

### Pages

Navigation (collapsible sidebar, icon rail with tooltips when collapsed; menu button on mobile):
**Main** (Dashboard, Referrals, Patients, Facilities) · **Follow-up** (Follow-up schedule,
Notifications) · **Management** (Reports & analytics, plus User management for administrators).
New referral is the button at the top of the Dashboard and Referrals pages.

- **Dashboard:** greeting and activity summary, outstanding-referral indicator, KPI cards (total,
  completed, pending, requiring follow-up), an **Insights and recommendations** panel (outstanding
  referrals with a suggested contact action, follow-up reminders, completion rate, busiest
  facility, trend over 7/30/90 days), charts (status donut, referral trend, referrals by facility)
  and a recent-referrals table. Insights are computed from the stored records; with too little
  data an empty state is shown instead.
- **New referral:** a dedicated form. Patient information (existing patient found by name, phone
  or patient ID, or a new patient with an automatically assigned unique ID `PT-00001`, phone and
  address), referral date, urgency, referring facility, receiving facility (chosen from the
  registered facilities, with an inline "Add a new facility" pop-up), reason, notes and the
  responsible health worker. Saved with the status **Pending**.
- **Patients:** register, view and search patients; each patient page lists their referrals.
- **Facilities:** add, view, edit and delete receiving hospitals (separate from referrals).
- **All referrals / Referral details:** search and filter, full information, status history,
  attendance confirmation, status updates, follow-ups.
- **Notifications:** attendance-not-confirmed referrals, overdue and upcoming follow-ups, pending
  referrals, and stored alerts for the responsible health worker.
- **Dashboard / Reports:** total, pending, completed and needing-follow-up counts, attendance
  rate, charts. All figures come from the database; a fresh installation shows empty states.

### API overview (all under `/api`; everything except `login` requires a session)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Referrals | `GET/POST /referrals`, `GET /referrals/{id}` (with history + follow-ups), `GET /referrals/outstanding`, `POST /referrals/{id}/status`, `POST /referrals/{id}/attendance` |
| Follow-ups | `GET /followups`, `POST /referrals/{id}/followups`, `POST /followups/{id}/complete` |
| Notifications | `POST /notifications/generate`, `GET /notifications`, `POST /notifications/read`, `POST /notifications/{id}/read` |
| Statistics | `GET /stats` |
| Facilities | `GET/POST /facilities`, `PUT/DELETE /facilities/{id}` |
| Patients | `GET/POST /patients`, `GET /patients/{id}` (with referral history); `GET /staff` (responsible-worker choices) |
| Staff (admin) | `GET/POST /users`, `PATCH /users/{id}` |

Errors are JSON `{"detail": "message"}` with a meaningful status: 401 not signed in /
bad credentials, 403 role not allowed, 404 not found, 409 invalid status change, 422
validation failed, 429 too many failed logins.

### Security notes for the web layer

- Sessions are random 256-bit tokens in an `HttpOnly`, `SameSite=Strict` cookie, so page
  scripts cannot read them and other sites cannot send authenticated requests. Only a SHA-256
  hash of each token is stored, and sessions expire after 8 hours. Logout deletes the
  session, and deactivating a user revokes their sessions immediately.
- Five failed logins for a username block further attempts for five minutes (kept in memory;
  it resets when the server restarts).
- Request bodies reject unknown fields. All validation and permission checks are the same
  code the command line uses, so the two cannot disagree.
- Serve over HTTPS and set `REFERRAL_COOKIE_SECURE=1` for anything beyond a local machine.

### Testing

```
python -m unittest discover -s tests -t .         # 61 tests: service layer, every API endpoint, form fields, DB upgrade
```

Browser end-to-end test (drives the real UI in Chrome against a running server; it needs a
**fresh** database containing only the admin `admin` / `adminpass1`):

```
set DATABASE_URL=<a scratch Neon branch> && set REFERRAL_PASSWORD=adminpass1
python -m referral_tracker init-admin admin
python -m uvicorn referral_tracker.api.main:app --port 8000          # keep running
cd tests\e2e && npm install && node run.mjs                         # 59 checks
```

## Command-line interface

The original CLI still works and shares the same database. Its documentation follows.

Written in **Python 3.12** with **PostgreSQL** (Neon) through `psycopg`.

## Requirements covered

| Requirement | Command | Code |
|---|---|---|
| Create referrals | `refer` | `Service.create_referral` |
| Reason for referral | `refer ... "reason"` (3-500 chars, required) | `referrals.reason` |
| Receiving facility | `add-facility`, `refer <patient> <facility>` | `facilities` table, foreign key |
| Track referral status | `referrals --status`, `show` | PENDING → ATTENDED → COMPLETED, plus NO_SHOW / CANCELLED |
| Confirm attendance | `confirm <id> [--date]` | records date and who confirmed it |
| Schedule follow-up | `follow-up <id> <date>`, `follow-ups --due`, `done-follow-up` | `followups` table |
| Notify workers of outstanding referrals | `outstanding`, `notify`, `inbox` | `generate_notifications` |
| Referral statistics | `stats` | totals, by status/urgency/facility, attendance and completion rate, average days to attendance, overdue count |

## Quick start

```
python -m referral_tracker init-admin admin
python -m referral_tracker -u admin add-user nurse1 HEALTH_WORKER
python -m referral_tracker -u admin add-facility "City Hospital" --location Town --phone 0712345678
python -m referral_tracker -u nurse1 add-patient "Jane Doe" 1990-05-01 0700111222
python -m referral_tracker -u nurse1 refer 1 1 "Suspected fracture" --urgency urgent
python -m referral_tracker -u nurse1 confirm 1
python -m referral_tracker -u nurse1 follow-up 1 2026-12-01 --notes "Review cast"
python -m referral_tracker -u nurse1 notify      # run daily (Task Scheduler / cron)
python -m referral_tracker -u nurse1 inbox
python -m referral_tracker -u nurse1 stats
```

Passwords are prompted for (hidden). `REFERRAL_USER`, `REFERRAL_PASSWORD` and `DATABASE_URL`
can be set for scripted runs. Run the tests with `python -m unittest discover -s tests -t .` after setting
`TEST_DATABASE_URL` to a scratch database or Neon branch (each test works in its own schema).

**How notification works.** `notify` is meant to run once a day. A referral is *outstanding*
when it is still PENDING or NO_SHOW after its expected-by date (default 1/3/14 days for
EMERGENCY/URGENT/ROUTINE). Each outstanding referral, and each follow-up that is due,
produces one alert for the health worker who made the referral (or for the admins if that
worker is no longer active). Running it twice in a day creates no duplicates. Alerts are
stored in the database and read with `inbox`. Sending SMS or email is not built in; it
would be added by reading the `notifications` table.

## How Python supports the five challenge areas

### 1. Data validation
- Python is dynamically typed, so nothing is checked for free. The system checks every input
  explicitly in one place, [validation.py](referral_tracker/validation.py), before any
  business logic runs. It checks phone format with regular expressions, dates with
  `datetime.strptime` (which also rejects impossible dates such as 2026-02-30), lengths,
  control characters, and allowed values for urgency and role.
- Business rules sit in the service layer. Date of birth cannot be in the future, follow-ups
  cannot be in the past, attendance cannot be before the referral date, and status changes
  must follow the `TRANSITIONS` table, so a referral cannot be COMPLETED without first being ATTENDED.
- The database is a second line of defence: `CHECK` constraints on status, urgency and
  role, `NOT NULL`, `UNIQUE`, and foreign keys (`PRAGMA foreign_keys=ON`).

### 2. Security
- Passwords are hashed with PBKDF2-HMAC-SHA256 (`hashlib`, 200,000 iterations) and a random
  16-byte salt from `os.urandom`. They are compared with `hmac.compare_digest`, which takes
  the same time whether the password is close or not. Plain passwords are never stored or logged.
- Login failures give the same message for an unknown user and a wrong password, so
  usernames cannot be discovered.
- Role-based access control (`ADMIN`, `HEALTH_WORKER`, `VIEWER`) is enforced in the service
  layer by `security.require`, so it applies to any interface added later, not just the CLI.
  The first admin can only be created while the user table is empty.
- All SQL uses `?` bound parameters. The one dynamic `UPDATE` builds its column names from
  constants in the code, never from user input. A test confirms that an injection string
  is stored as plain text.
- The audit log records who did what, using record ids rather than patient names.
- Python's standard library has no secure-by-default web layer, so this is a local CLI. If
  it were turned into a web app, HTTPS, session handling and CSRF protection would have to
  be added (for example with Flask or Django), and the database would need
  encryption at rest and backups (Neon provides both).

### 3. Database interaction
- The app uses Neon, a hosted PostgreSQL service, through the `psycopg` driver, so several
  health workers can write at once and the data is backed up by the provider. The schema is normalized into users, facilities, patients, referrals,
  follow-ups, notifications and the audit log, with an index on referral status.
- The `transaction()` context manager in [db.py](referral_tracker/db.py) commits on success
  and rolls back on any exception, so a failure never leaves a referral saved without its
  audit entry.
- A small `Row` type in [db.py](referral_tracker/db.py) gives column access by name. Joins and `GROUP BY` queries produce the
  statistics directly in SQL, which is faster than aggregating rows in Python.
- Neon scales to zero when idle, so the first request after a quiet period can take a second
  longer while the database wakes up.

### 4. Error handling
- Expected problems have their own exception classes (`ValidationError`, `AuthError`,
  `PermissionDenied`, `NotFound`, `InvalidTransition`) under one base class, `ReferralError`,
  defined in [errors.py](referral_tracker/errors.py).
- The CLI entry point `main()` separates the two kinds of failure. A `ReferralError` prints a
  clear message and exits with code 1. Any other exception is a bug: the full traceback goes
  to `referral_tracker.log`, the user sees only a generic message (exit code 2), and no
  internals are leaked.
- Low-level errors are translated. `psycopg.IntegrityError` on a duplicate username becomes
  "Username already taken."

### 5. Maintainability
- Layers: `cli.py` (input and output) → `service.py` (rules) → `db.py` (storage), with
  `validation.py`, `security.py` and `errors.py` shared. Swapping the CLI for a web front
  end would not touch the rules.
- The workflow is data (the `TRANSITIONS` and `PERMISSIONS` dictionaries), so adding a status
  or role is a one-line change rather than edits to `if/else` chains.
- Python is readable and has a large standard library, so a graduate or volunteer
  maintainer can follow the code. There are no third-party dependencies to keep updated.
- 26 automated tests (`tests/test_service.py`) cover validation, security, the workflow,
  notifications and statistics, and run in under a second. Their weaknesses: Python's lack of
  compile-time type checking means mistakes show up at runtime, so the tests matter more.
  Type hints with `mypy` would be a sensible next step.

## Limitations
- Command-line only. A web or mobile front end would suit non-technical staff better.
- Notifications are in-app alerts; there is no SMS/email delivery yet.
- Patients have no unique national id, so duplicate patient records are possible.
