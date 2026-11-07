import unittest
from datetime import date, timedelta

from referral_tracker import security
from tests.pgutil import drop_schema, new_schema, open_db
from referral_tracker.errors import (AuthError, InvalidTransition, PermissionDenied,
                                     ValidationError)
from referral_tracker.service import Service

security._ITERATIONS = 1000  # fast hashing for tests only
TODAY = date.today()
iso = lambda d: d.isoformat()


class Base(unittest.TestCase):
    def setUp(self):
        self.schema = new_schema()
        self.addCleanup(drop_schema, self.schema)
        self.svc = Service(open_db(self.schema, init=True))
        self.addCleanup(self.svc.conn.close)
        self.svc.create_user(None, "admin", "adminpass1", "ADMIN")
        self.admin = self.svc.authenticate("admin", "adminpass1")
        self.svc.create_user(self.admin, "nurse", "nursepass1", "HEALTH_WORKER")
        self.svc.create_user(self.admin, "viewer", "viewpass12", "VIEWER")
        self.nurse = self.svc.authenticate("nurse", "nursepass1")
        self.viewer = self.svc.authenticate("viewer", "viewpass12")
        self.fac = self.svc.add_facility(self.admin, "City Hospital", "Town", "0712345678")
        self.pat = self.svc.add_patient(self.nurse, "Jane Doe", "1990-05-01", "0700111222")

    def refer(self, **kw):
        kw.setdefault("reason", "Suspected fracture")
        return self.svc.create_referral(self.nurse, self.pat, self.fac, **kw)


class TestSecurity(Base):
    def test_bad_password(self):
        with self.assertRaises(AuthError):
            self.svc.authenticate("nurse", "wrong")

    def test_unknown_user_same_error(self):
        with self.assertRaises(AuthError):
            self.svc.authenticate("ghost", "x")

    def test_bootstrap_only_once(self):
        with self.assertRaises(AuthError):
            self.svc.create_user(None, "evil", "password1", "ADMIN")

    def test_password_not_stored_plain(self):
        row = self.svc.conn.execute("SELECT * FROM users WHERE username='nurse'").fetchone()
        self.assertNotIn("nursepass1", tuple(row))

    def test_viewer_cannot_write(self):
        with self.assertRaises(PermissionDenied):
            self.svc.create_referral(self.viewer, self.pat, self.fac, "Some reason")

    def test_worker_cannot_add_user(self):
        with self.assertRaises(PermissionDenied):
            self.svc.create_user(self.nurse, "x1234", "password1", "ADMIN")

    def test_sql_injection_is_inert(self):
        self.svc.add_patient(self.nurse, "Robert'); DROP TABLE patients;--", "2000-01-01", "0700111222")
        self.assertEqual(self.svc.conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0], 2)


class TestValidation(Base):
    def test_bad_phone(self):
        with self.assertRaises(ValidationError):
            self.svc.add_patient(self.nurse, "Bob Smith", "1990-01-01", "abc")

    def test_future_dob(self):
        with self.assertRaises(ValidationError):
            self.svc.add_patient(self.nurse, "Bob Smith", iso(TODAY + timedelta(1)), "0700111222")

    def test_bad_date_format(self):
        with self.assertRaises(ValidationError):
            self.refer(expected_by="01/02/2030")

    def test_bad_urgency(self):
        with self.assertRaises(ValidationError):
            self.refer(urgency="WHENEVER")

    def test_unknown_facility(self):
        with self.assertRaises(Exception):
            self.svc.create_referral(self.nurse, self.pat, 999, "Some reason")

    def test_short_password(self):
        with self.assertRaises(ValidationError):
            self.svc.create_user(self.admin, "newuser", "short", "VIEWER")

    def test_duplicate_username(self):
        with self.assertRaises(ValidationError):
            self.svc.create_user(self.admin, "nurse", "password123", "VIEWER")


class TestWorkflow(Base):
    def test_happy_path(self):
        r = self.refer()
        self.svc.confirm_attendance(self.nurse, r)
        self.svc.complete_referral(self.nurse, r, "Treated and discharged")
        row = self.svc.get_referral(self.nurse, r)
        self.assertEqual(row["status"], "COMPLETED")
        self.assertEqual(row["confirmed_by"], self.nurse["id"])

    def test_cannot_complete_without_attending(self):
        r = self.refer()
        with self.assertRaises(InvalidTransition):
            self.svc.complete_referral(self.nurse, r, "Done")

    def test_no_show_then_late_attendance(self):
        r = self.refer()
        self.svc.mark_no_show(self.nurse, r)
        self.svc.confirm_attendance(self.nurse, r)
        self.assertEqual(self.svc.get_referral(self.nurse, r)["status"], "ATTENDED")

    def test_cannot_reopen_cancelled(self):
        r = self.refer()
        self.svc.cancel_referral(self.nurse, r, "Patient moved")
        with self.assertRaises(InvalidTransition):
            self.svc.confirm_attendance(self.nurse, r)

    def test_followup_past_date_rejected(self):
        r = self.refer()
        with self.assertRaises(ValidationError):
            self.svc.schedule_followup(self.nurse, r, iso(TODAY - timedelta(1)))

    def test_default_expected_date_by_urgency(self):
        r = self.svc.get_referral(self.nurse, self.refer(urgency="emergency"))
        self.assertEqual(r["expected_by"], iso(TODAY + timedelta(1)))


class TestNotificationsAndStats(Base):
    def test_overdue_alerts_idempotent_and_targeted(self):
        r = self.refer()
        later = iso(TODAY + timedelta(30))
        self.assertEqual(len(self.svc.outstanding_referrals(self.nurse, later)), 1)
        self.assertEqual(self.svc.generate_notifications(self.nurse, later), 1)
        self.assertEqual(self.svc.generate_notifications(self.nurse, later), 0)  # no duplicates
        self.assertEqual(len(self.svc.my_notifications(self.nurse)), 1)
        self.assertEqual(len(self.svc.my_notifications(self.admin)), 0)

    def test_attended_not_outstanding(self):
        r = self.refer()
        self.svc.confirm_attendance(self.nurse, r)
        self.assertEqual(self.svc.outstanding_referrals(self.nurse, iso(TODAY + timedelta(30))), [])

    def test_viewer_cannot_generate_notifications(self):
        with self.assertRaises(PermissionDenied):
            self.svc.generate_notifications(self.viewer)

    def test_followup_due_alert(self):
        r = self.refer()
        self.svc.schedule_followup(self.nurse, r, iso(TODAY + timedelta(5)))
        self.svc.confirm_attendance(self.nurse, r)
        self.assertEqual(self.svc.generate_notifications(self.nurse, iso(TODAY + timedelta(6))), 1)

    def test_stats(self):
        a, b, c = self.refer(), self.refer(), self.refer()
        self.svc.confirm_attendance(self.nurse, a)
        self.svc.complete_referral(self.nurse, a, "Treated")
        self.svc.mark_no_show(self.nurse, b)
        s = self.svc.statistics(self.nurse)
        self.assertEqual(s["total"], 3)
        self.assertEqual(s["by_status"], {"COMPLETED": 1, "NO_SHOW": 1, "PENDING": 1})
        self.assertEqual(s["attendance_rate"], 50.0)
        self.assertEqual(s["by_facility"], [("City Hospital", 3)])
        self.assertEqual(s["avg_days_to_attendance"], 0.0)

    def test_empty_stats(self):
        s = self.svc.statistics(self.nurse)
        self.assertEqual((s["total"], s["attendance_rate"]), (0, None))


if __name__ == "__main__":
    unittest.main()
