"""Business logic. All SQL uses bound parameters (no string-built queries)."""
import hashlib
import os
import secrets
from datetime import date, datetime, timedelta

from . import security, validation as v
from .db import IntegrityError, transaction
from .errors import AuthError, InvalidTransition, NotFound, ValidationError

# Referral workflow: current status -> statuses it may move to.
TRANSITIONS = {
    "PENDING": {"ATTENDED", "NO_SHOW", "CANCELLED"},
    "ATTENDED": {"COMPLETED"},
    "NO_SHOW": {"ATTENDED", "CANCELLED"},  # patient turns up late, or we give up
    "COMPLETED": set(),
    "CANCELLED": set(),
}
OUTSTANDING = ("PENDING", "NO_SHOW")
# Name used as the referring facility when the form leaves it blank.
DEFAULT_CENTRE = os.environ.get("REFERRAL_CENTRE_NAME", "Community Health Centre")
DEFAULT_EXPECTED_DAYS = {"EMERGENCY": 1, "URGENT": 3, "ROUTINE": 14}


class Service:
    def __init__(self, conn):
        self.conn = conn

    # ---------- helpers ----------
    def _audit(self, user, action, detail=""):
        self.conn.execute(
            "INSERT INTO audit_log (user_id, action, detail) VALUES (?,?,?)",
            (user["id"] if user else None, action, detail),
        )

    def _history(self, referral_id, from_status, to_status, user_id, note=""):
        self.conn.execute(
            "INSERT INTO referral_history (referral_id, from_status, to_status, changed_by, note)"
            " VALUES (?,?,?,?,?)", (referral_id, from_status, to_status, user_id, note))

    def _insert(self, sql, params):
        """Run an INSERT and return the new row's id."""
        return self.conn.execute(sql + " RETURNING id", params).fetchone()[0]

    def _one(self, sql, params, what):
        row = self.conn.execute(sql, params).fetchone()
        if row is None:
            raise NotFound(f"{what} not found.")
        return row

    # ---------- users & auth ----------
    def create_user(self, actor, username, password, role):
        """actor=None is allowed only to bootstrap the very first admin."""
        if actor is None:
            if self.conn.execute("SELECT 1 FROM users").fetchone():
                raise AuthError("Users already exist; log in as an admin.")
        else:
            security.require(actor, "manage_users")
        username = v.username(username)
        password = v.password(password)
        role = v.choice(role, "Role", v.ROLES)
        if actor is None:
            role = "ADMIN"
        salt, digest = security.hash_password(password)
        try:
            with transaction(self.conn):
                new_id = self._insert(
                    "INSERT INTO users (username, salt, password_hash, role) VALUES (?,?,?,?)",
                    (username, salt, digest, role),
                )
                self._audit(actor, "create_user", f"{username} as {role}")
        except IntegrityError:
            raise ValidationError(f"Username '{username}' is already taken.")
        return new_id

    def authenticate(self, username, password):
        row = self.conn.execute(
            "SELECT * FROM users WHERE username = ? AND active = 1", (username or "",)
        ).fetchone()
        # Same error for unknown user and wrong password: don't reveal which usernames exist.
        if row is None or not security.verify_password(password or "", row["salt"], row["password_hash"]):
            raise AuthError("Invalid username or password.")
        return row

    SESSION_HOURS = 8

    def create_session(self, user):
        """Returns an opaque token; only its SHA-256 is stored, so a DB leak can't be replayed."""
        token = secrets.token_urlsafe(32)
        now = datetime.now().isoformat(timespec="seconds")
        expires = (datetime.now() + timedelta(hours=self.SESSION_HOURS)).isoformat(timespec="seconds")
        with transaction(self.conn):
            self.conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            self.conn.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
                              (_h(token), user["id"], expires))
            self._audit(user, "login")
        return token

    def user_for_token(self, token):
        row = self.conn.execute(
            """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1""",
            (_h(token or ""), datetime.now().isoformat(timespec="seconds"))).fetchone()
        if row is None:
            raise AuthError("Session expired. Please sign in again.")
        return row

    def end_session(self, token):
        with transaction(self.conn):
            self.conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_h(token or ""),))

    def list_users(self, actor):
        security.require(actor, "manage_users")
        return self.conn.execute(
            "SELECT id, username, role, active FROM users ORDER BY username").fetchall()

    def list_staff(self, actor):
        """Active staff who can be made responsible for a referral (readable by any signed-in user)."""
        security.require(actor, "read")
        return self.conn.execute(
            "SELECT id, username, role FROM users WHERE active=1 AND role IN ('ADMIN','HEALTH_WORKER')"
            " ORDER BY username").fetchall()

    def set_user_active(self, actor, user_id, active):
        security.require(actor, "manage_users")
        if user_id == actor["id"]:
            raise ValidationError("You cannot deactivate your own account.")
        self._one("SELECT id FROM users WHERE id=?", (user_id,), "User")
        with transaction(self.conn):
            self.conn.execute("UPDATE users SET active=? WHERE id=?", (1 if active else 0, user_id))
            if not active:
                self.conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
            self._audit(actor, "set_user_active", f"id={user_id} active={bool(active)}")

    # ---------- facilities & patients ----------
    def add_facility(self, actor, name, location="", phone=""):
        security.require(actor, "add_facility")
        name = v.text(name, "Facility name")
        location = v.optional_text(location, "Location")
        phone = v.phone(phone) if phone else ""
        try:
            with transaction(self.conn):
                new_id = self._insert(
                    "INSERT INTO facilities (name, location, phone) VALUES (?,?,?)",
                    (name, location, phone),
                )
                self._audit(actor, "add_facility", name)
        except IntegrityError:
            raise ValidationError(f"Facility '{name}' already exists.")
        return new_id

    def list_facilities(self, actor):
        security.require(actor, "read")
        return self.conn.execute(
            """SELECT f.*, (SELECT COUNT(*) FROM referrals r WHERE r.facility_id = f.id) AS referral_count
               FROM facilities f ORDER BY f.name""").fetchall()

    def update_facility(self, actor, facility_id, name, location="", phone=""):
        security.require(actor, "manage_facilities")
        name = v.text(name, "Facility name")
        location = v.optional_text(location, "Location")
        phone = v.phone(phone) if phone else ""
        self._one("SELECT id FROM facilities WHERE id=?", (facility_id,), "Facility")
        try:
            with transaction(self.conn):
                self.conn.execute("UPDATE facilities SET name=?, location=?, phone=? WHERE id=?",
                                  (name, location, phone, facility_id))
                self._audit(actor, "update_facility", f"id={facility_id}")
        except IntegrityError:
            raise ValidationError(f"Facility '{name}' already exists.")

    def delete_facility(self, actor, facility_id):
        security.require(actor, "manage_facilities")
        self._one("SELECT id FROM facilities WHERE id=?", (facility_id,), "Facility")
        used = self.conn.execute("SELECT COUNT(*) FROM referrals WHERE facility_id=?",
                                 (facility_id,)).fetchone()[0]
        if used:
            raise ValidationError(f"Facility has {used} referral(s) and cannot be deleted.")
        with transaction(self.conn):
            self.conn.execute("DELETE FROM facilities WHERE id=?", (facility_id,))
            self._audit(actor, "delete_facility", f"id={facility_id}")

    def list_patients(self, actor, q="", limit=50):
        """Search by name, phone or patient ID (e.g. PT-00012)."""
        security.require(actor, "read")
        q = (q or "").strip()
        like = f"%{q}%"
        return self.conn.execute(
            f"""SELECT {_PATIENT_COLS},
                      (SELECT COUNT(*) FROM referrals r WHERE r.patient_id = p.id) AS referral_count,
                      (SELECT MAX(referral_date) FROM referrals r WHERE r.patient_id = p.id) AS last_referral
               FROM patients p
               WHERE p.full_name ILIKE ? OR p.phone ILIKE ? OR {_PATIENT_NO} ILIKE ?
               ORDER BY p.full_name LIMIT ?""",
            (like, like, like, int(limit))).fetchall()

    def get_patient(self, actor, patient_id):
        security.require(actor, "read")
        patient = self._one(f"SELECT {_PATIENT_COLS} FROM patients p WHERE p.id = ?", (patient_id,), "Patient")
        referrals = self.conn.execute(
            _REFERRAL_SELECT + " WHERE r.patient_id = ? ORDER BY r.referral_date DESC, r.id DESC",
            (patient_id,)).fetchall()
        return patient, referrals

    @staticmethod
    def _clean_patient(full_name, date_of_birth, phone, address=""):
        name = v.text(full_name, "Patient name", 2, 100)
        dob = v.iso_date(date_of_birth, "Date of birth")
        if dob > date.today().isoformat():
            raise ValidationError("Date of birth cannot be in the future.")
        return name, dob, v.phone(phone), v.optional_text(address, "Address", 200)

    def _insert_patient(self, actor, name, dob, phone, address=""):
        new_id = self._insert(
            "INSERT INTO patients (full_name, date_of_birth, phone, address) VALUES (?,?,?,?)",
            (name, dob, phone, address),
        )
        self._audit(actor, "add_patient", f"id={new_id}")  # no PII in the log
        return new_id

    def add_patient(self, actor, full_name, date_of_birth, phone, address=""):
        security.require(actor, "write_referral")
        clean = self._clean_patient(full_name, date_of_birth, phone, address)
        with transaction(self.conn):
            return self._insert_patient(actor, *clean)

    # ---------- referrals ----------
    def _clean_referral(self, actor, facility_id, reason, urgency, expected_by, referral_date=None,
                        referring_facility="", notes="", responsible_id=None):
        facility_id = v.positive_int(facility_id, "Receiving facility")
        reason = v.text(reason, "Reason for referral", 3, 500)
        urgency = v.choice(urgency, "Urgency", v.URGENCIES)
        if referral_date:
            referral_date = v.iso_date(referral_date, "Referral date")
            if referral_date > date.today().isoformat():
                raise ValidationError("Referral date cannot be in the future.")
        else:
            referral_date = date.today().isoformat()
        if expected_by:
            expected_by = v.iso_date(expected_by, "Expected-by date", allow_past=False)
            if expected_by < referral_date:
                raise ValidationError("Expected-by date cannot be before the referral date.")
        else:
            expected_by = (date.fromisoformat(referral_date)
                           + timedelta(days=DEFAULT_EXPECTED_DAYS[urgency])).isoformat()
        referring = (referring_facility or "").strip()
        referring = v.text(referring, "Referring facility", 2, 200) if referring else DEFAULT_CENTRE
        notes = v.optional_text(notes, "Notes", 1000)
        self._one("SELECT id FROM facilities WHERE id=?", (facility_id,), "Receiving facility")
        if responsible_id in (None, ""):
            responsible_id = actor["id"]
        else:
            responsible_id = v.positive_int(responsible_id, "Responsible health worker")
            self._one("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('ADMIN','HEALTH_WORKER')",
                      (responsible_id,), "Responsible health worker")
        return facility_id, reason, urgency, expected_by, referral_date, referring, notes, responsible_id

    def _insert_referral(self, actor, patient_id, facility_id, reason, urgency, expected_by,
                         referral_date, referring, notes, responsible_id):
        new_id = self._insert(
            """INSERT INTO referrals
               (patient_id, facility_id, referred_by, reason, urgency, referral_date, expected_by,
                referring_facility, notes)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (patient_id, facility_id, responsible_id, reason, urgency, referral_date, expected_by,
             referring, notes),
        )  # status defaults to PENDING
        self._history(new_id, None, "PENDING", actor["id"], "Referral created")
        self._audit(actor, "create_referral", f"id={new_id}")
        return new_id

    def create_referral(self, actor, patient_id, facility_id, reason, urgency="ROUTINE",
                        expected_by=None, *, referral_date=None, referring_facility="", notes="",
                        responsible_id=None):
        security.require(actor, "write_referral")
        patient_id = v.positive_int(patient_id, "Patient id")
        clean = self._clean_referral(actor, facility_id, reason, urgency, expected_by, referral_date,
                                     referring_facility, notes, responsible_id)
        self._one("SELECT id FROM patients WHERE id=?", (patient_id,), "Patient")
        with transaction(self.conn):
            return self._insert_referral(actor, patient_id, *clean)

    def register_and_refer(self, actor, full_name, date_of_birth, phone, facility_id, reason,
                           urgency="ROUTINE", expected_by=None, *, address="", referral_date=None,
                           referring_facility="", notes="", responsible_id=None):
        """New patient + referral in one transaction: no orphan patient if the referral is invalid."""
        security.require(actor, "write_referral")
        patient = self._clean_patient(full_name, date_of_birth, phone, address)
        clean = self._clean_referral(actor, facility_id, reason, urgency, expected_by, referral_date,
                                     referring_facility, notes, responsible_id)
        with transaction(self.conn):
            pid = self._insert_patient(actor, *patient)
            return pid, self._insert_referral(actor, pid, *clean)

    def get_referral(self, actor, referral_id):
        security.require(actor, "read")
        return self._one(_REFERRAL_SELECT + " WHERE r.id = ?", (referral_id,), "Referral")

    def list_referrals(self, actor, status=None, q="", urgency=None, facility_id=None):
        security.require(actor, "read")
        where, params = [], []
        if status:
            where.append("r.status = ?")
            params.append(v.choice(status, "Status", tuple(TRANSITIONS)))
        if urgency:
            where.append("r.urgency = ?")
            params.append(v.choice(urgency, "Urgency", v.URGENCIES))
        if facility_id:
            where.append("r.facility_id = ?")
            params.append(v.positive_int(facility_id, "Facility id"))
        if q and q.strip():
            where.append("(p.full_name ILIKE ? OR p.phone ILIKE ? OR r.reason ILIKE ? OR CAST(r.id AS TEXT) = ?)")
            like = f"%{q.strip()}%"
            params += [like, like, like, q.strip().lstrip("#")]
        sql = _REFERRAL_SELECT + (" WHERE " + " AND ".join(where) if where else "")
        return self.conn.execute(sql + " ORDER BY r.created_at DESC, r.id DESC", params).fetchall()

    def referral_history(self, actor, referral_id):
        security.require(actor, "read")
        self._one("SELECT id FROM referrals WHERE id=?", (referral_id,), "Referral")
        return self.conn.execute(
            """SELECT h.*, u.username AS changed_by_name FROM referral_history h
               JOIN users u ON u.id = h.changed_by
               WHERE h.referral_id = ? ORDER BY h.id""", (referral_id,)).fetchall()

    def _change_status(self, actor, referral_id, new_status, **fields):
        security.require(actor, "write_referral")
        ref = self._one("SELECT * FROM referrals WHERE id=?", (referral_id,), "Referral")
        if new_status not in TRANSITIONS[ref["status"]]:
            raise InvalidTransition(f"Cannot change referral from {ref['status']} to {new_status}.")
        sets = ", ".join(f"{k} = ?" for k in ("status", *fields))  # keys are code constants, not user input
        with transaction(self.conn):
            self.conn.execute(
                f"UPDATE referrals SET {sets} WHERE id = ?",
                (new_status, *fields.values(), referral_id),
            )
            note = fields.get("outcome") or (
                f"Attended on {fields['attended_on']}" if "attended_on" in fields else "")
            self._history(referral_id, ref["status"], new_status, actor["id"], note)
            self._audit(actor, "status_change", f"id={referral_id} {ref['status']}->{new_status}")

    def confirm_attendance(self, actor, referral_id, attended_on=None):
        attended_on = v.iso_date(attended_on, "Attendance date") if attended_on else date.today().isoformat()
        ref = self._one("SELECT referral_date FROM referrals WHERE id=?", (referral_id,), "Referral")
        if attended_on < ref["referral_date"]:
            raise ValidationError("Attendance cannot be before the referral date.")
        if attended_on > date.today().isoformat():
            raise ValidationError("Attendance date cannot be in the future.")
        self._change_status(actor, referral_id, "ATTENDED",
                            attended_on=attended_on, confirmed_by=actor["id"])

    def complete_referral(self, actor, referral_id, outcome):
        outcome = v.text(outcome, "Outcome", 3, 500)
        self._change_status(actor, referral_id, "COMPLETED", outcome=outcome)

    def mark_no_show(self, actor, referral_id):
        self._change_status(actor, referral_id, "NO_SHOW")

    def cancel_referral(self, actor, referral_id, reason):
        self._change_status(actor, referral_id, "CANCELLED", outcome=v.text(reason, "Reason", 3, 500))

    # ---------- follow-ups ----------
    def schedule_followup(self, actor, referral_id, scheduled_for, notes=""):
        security.require(actor, "write_referral")
        scheduled_for = v.iso_date(scheduled_for, "Follow-up date", allow_past=False)
        notes = v.optional_text(notes, "Notes")
        ref = self._one("SELECT status FROM referrals WHERE id=?", (referral_id,), "Referral")
        if ref["status"] == "CANCELLED":
            raise InvalidTransition("Cannot schedule follow-up for a cancelled referral.")
        with transaction(self.conn):
            new_id = self._insert(
                "INSERT INTO followups (referral_id, scheduled_for, notes, created_by) VALUES (?,?,?,?)",
                (referral_id, scheduled_for, notes, actor["id"]),
            )
            self._audit(actor, "schedule_followup", f"referral={referral_id}")
        return new_id

    def complete_followup(self, actor, followup_id):
        security.require(actor, "write_referral")
        self._one("SELECT id FROM followups WHERE id=?", (followup_id,), "Follow-up")
        with transaction(self.conn):
            self.conn.execute("UPDATE followups SET done=1 WHERE id=?", (followup_id,))
            self._audit(actor, "complete_followup", f"id={followup_id}")

    def list_followups(self, actor, due_only=False, state="pending", referral_id=None):
        """state: 'pending' | 'done' | 'all'."""
        security.require(actor, "read")
        if state not in ("pending", "done", "all"):
            raise ValidationError("state must be pending, done or all.")
        sql = """SELECT f.*, p.full_name, r.status AS referral_status, fa.name AS facility_name
                 FROM followups f
                 JOIN referrals r ON r.id = f.referral_id
                 JOIN patients p ON p.id = r.patient_id
                 JOIN facilities fa ON fa.id = r.facility_id
                 WHERE 1=1"""
        params = []
        if state != "all":
            sql += " AND f.done = ?"
            params.append(1 if state == "done" else 0)
        if due_only:
            sql += " AND f.scheduled_for <= ?"
            params.append(date.today().isoformat())
        if referral_id:
            sql += " AND f.referral_id = ?"
            params.append(referral_id)
        return self.conn.execute(sql + " ORDER BY f.scheduled_for, f.id", params).fetchall()

    # ---------- notifications ----------
    def outstanding_referrals(self, actor, today=None):
        """Referrals past their expected-by date with no confirmed attendance."""
        security.require(actor, "read")
        today = today or date.today().isoformat()
        marks = ",".join("?" * len(OUTSTANDING))
        return self.conn.execute(
            _REFERRAL_SELECT + f" WHERE r.status IN ({marks}) AND r.expected_by < ? ORDER BY r.expected_by",
            (*OUTSTANDING, today),
        ).fetchall()

    def generate_notifications(self, actor, today=None):
        """Create one alert per overdue referral / due follow-up per day, for the responsible worker.

        Falls back to all admins if the referring worker is no longer active. Safe to run
        repeatedly: a UNIQUE constraint stops duplicate alerts on the same day.
        Returns the number of new alerts.
        """
        security.require(actor, "notify")
        today = today or date.today().isoformat()
        admins = [r["id"] for r in self.conn.execute(
            "SELECT id FROM users WHERE role='ADMIN' AND active=1")]
        created = 0

        def recipients(user_id):
            row = self.conn.execute(
                "SELECT id FROM users WHERE id=? AND active=1 AND role IN ('ADMIN','HEALTH_WORKER')",
                (user_id,)).fetchone()
            return [row["id"]] if row else admins

        alerts = []
        for r in self.outstanding_referrals(actor, today):
            what = ("did not attend" if r["status"] == "NO_SHOW"
                    else "has not been confirmed as attended")
            alerts.append((r["referred_by"], r["id"], "OVERDUE_REFERRAL",
                           f"Referral #{r['id']}: {r['patient_name']} {what} at {r['facility_name']} "
                           f"(expected by {r['expected_by']})."))
        due = self.conn.execute(
            """SELECT f.id, f.scheduled_for, f.referral_id, r.referred_by, p.full_name
               FROM followups f JOIN referrals r ON r.id=f.referral_id
               JOIN patients p ON p.id=r.patient_id
               WHERE f.done=0 AND f.scheduled_for <= ?""", (today,)).fetchall()
        for f in due:
            when = "is due today" if f["scheduled_for"] == today else f"was due {f['scheduled_for']}"
            alerts.append((f["referred_by"], f["referral_id"], "FOLLOWUP_DUE",
                           f"Follow-up for {f['full_name']} (referral #{f['referral_id']}) {when}."))
        with transaction(self.conn):
            for owner, ref_id, kind, msg in alerts:
                for uid in recipients(owner):
                    cur = self.conn.execute(
                        "INSERT INTO notifications "
                        "(user_id, referral_id, kind, message, created_on) VALUES (?,?,?,?,?) "
                        "ON CONFLICT DO NOTHING",
                        (uid, ref_id, kind, msg, today))
                    created += cur.rowcount
        return created

    def my_notifications(self, actor, include_read=False):
        security.require(actor, "notify")
        sql = "SELECT * FROM notifications WHERE user_id = ?"
        if not include_read:
            sql += " AND read = 0"
        return self.conn.execute(sql + " ORDER BY created_on DESC, id DESC", (actor["id"],)).fetchall()

    def mark_notification_read(self, actor, notification_id):
        security.require(actor, "notify")
        with transaction(self.conn):
            self.conn.execute("UPDATE notifications SET read=1 WHERE id=? AND user_id=?",
                              (notification_id, actor["id"]))

    def mark_notifications_read(self, actor):
        security.require(actor, "notify")
        with transaction(self.conn):
            self.conn.execute("UPDATE notifications SET read=1 WHERE user_id=?", (actor["id"],))

    # ---------- statistics ----------
    def statistics(self, actor, today=None):
        security.require(actor, "read")
        today = today or date.today().isoformat()
        c = self.conn
        total = c.execute("SELECT COUNT(*) FROM referrals").fetchone()[0]
        by_status = {r[0]: r[1] for r in c.execute(
            "SELECT status, COUNT(*) FROM referrals GROUP BY status")}
        by_facility = [tuple(r) for r in c.execute(
            """SELECT f.name, COUNT(*) FROM referrals r JOIN facilities f ON f.id=r.facility_id
               GROUP BY f.name ORDER BY 2 DESC, 1""")]
        by_urgency = {r[0]: r[1] for r in c.execute(
            "SELECT urgency, COUNT(*) FROM referrals GROUP BY urgency")}
        avg_days = c.execute(
            "SELECT AVG(attended_on::date - referral_date::date) FROM referrals "
            "WHERE attended_on IS NOT NULL").fetchone()[0]
        closed = by_status.get("ATTENDED", 0) + by_status.get("COMPLETED", 0)
        decided = total - by_status.get("PENDING", 0) - by_status.get("CANCELLED", 0)
        by_month = [tuple(r) for r in c.execute(
            """SELECT substr(referral_date,1,7) AS month, COUNT(*) FROM referrals
               GROUP BY month ORDER BY month DESC LIMIT 6""")][::-1]
        return {
            "by_month": by_month,
            "total": total,
            "by_status": by_status,
            "by_urgency": by_urgency,
            "by_facility": by_facility,
            "attendance_rate": round(100 * closed / decided, 1) if decided else None,
            "completion_rate": round(100 * by_status.get("COMPLETED", 0) / total, 1) if total else None,
            "avg_days_to_attendance": round(float(avg_days), 1) if avg_days is not None else None,
            "overdue": len(self.outstanding_referrals(actor, today)),
            "followups_pending": c.execute("SELECT COUNT(*) FROM followups WHERE done=0").fetchone()[0],
            "followups_overdue": c.execute(
                "SELECT COUNT(*) FROM followups WHERE done=0 AND scheduled_for < ?", (today,)).fetchone()[0],
            # referrals that have at least one follow-up still to be carried out
            "needing_followup": c.execute(
                "SELECT COUNT(DISTINCT referral_id) FROM followups WHERE done=0").fetchone()[0],
        }


def _h(token):
    return hashlib.sha256(token.encode()).hexdigest()


_PATIENT_NO = "('PT-' || lpad(p.id::text, 5, '0'))"
_PATIENT_COLS = f"p.*, {_PATIENT_NO} AS patient_no"

_REFERRAL_SELECT = """
SELECT r.*, p.full_name AS patient_name, p.phone AS patient_phone, p.address AS patient_address,
       p.date_of_birth AS patient_dob, 'PT-' || lpad(p.id::text, 5, '0') AS patient_no,
       f.name AS facility_name, u.username AS referred_by_name
FROM referrals r
JOIN patients p ON p.id = r.patient_id
JOIN facilities f ON f.id = r.facility_id
JOIN users u ON u.id = r.referred_by"""
