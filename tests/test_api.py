import os
import unittest
from datetime import date, timedelta

from fastapi.testclient import TestClient

from referral_tracker import security
from referral_tracker.api import create_app
from referral_tracker.service import Service
from tests.pgutil import drop_schema, new_schema, open_db, test_url

security._ITERATIONS = 1000  # fast hashing for tests only
iso = lambda d: d.isoformat()


class ApiBase(unittest.TestCase):
    def setUp(self):
        self.schema = new_schema()
        self.db = lambda: open_db(self.schema)
        conn = open_db(self.schema, init=True)
        svc = Service(conn)
        svc.create_user(None, "admin", "adminpass1", "ADMIN")
        admin = svc.authenticate("admin", "adminpass1")
        svc.create_user(admin, "nurse", "nursepass1", "HEALTH_WORKER")
        svc.create_user(admin, "viewer", "viewpass12", "VIEWER")
        conn.close()
        self.app = create_app(test_url(), schema=self.schema)

    def tearDown(self):
        self.app.state.pool.close()
        drop_schema(self.schema)

    def client(self, user=None, password=None):
        c = TestClient(self.app)
        if user:
            r = c.post("/api/auth/login", json={"username": user, "password": password})
            self.assertEqual(r.status_code, 200, r.text)
        return c

    def admin(self):
        return self.client("admin", "adminpass1")

    def nurse(self):
        return self.client("nurse", "nursepass1")

    def viewer(self):
        return self.client("viewer", "viewpass12")

    def make_facility(self):
        return self.admin().post("/api/facilities", json={"name": "City Hospital", "location": "Town",
                                                          "phone": "0712345678"}).json()["id"]

    def make_referral(self, c=None, fac=None, **over):
        fac = fac or self.make_facility()
        body = {"patient": {"full_name": "Jane Doe", "date_of_birth": "1990-05-01", "phone": "0700111222"},
                "facility_id": fac, "reason": "Suspected fracture", "urgency": "URGENT", **over}
        r = (c or self.nurse()).post("/api/referrals", json=body)
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()["id"]


class TestAuth(ApiBase):
    def test_requires_login(self):
        for path in ("/api/referrals", "/api/stats", "/api/facilities", "/api/notifications"):
            self.assertEqual(TestClient(self.app).get(path).status_code, 401, path)

    def test_login_logout_cycle(self):
        c = self.nurse()
        me = c.get("/api/auth/me").json()
        self.assertEqual(me["role"], "HEALTH_WORKER")
        self.assertIn("write_referral", me["permissions"])
        self.assertNotIn("manage_users", me["permissions"])
        self.assertEqual(c.post("/api/auth/logout").status_code, 200)
        self.assertEqual(c.get("/api/auth/me").status_code, 401)

    def test_cookie_is_httponly_samesite(self):
        r = TestClient(self.app).post("/api/auth/login", json={"username": "admin", "password": "adminpass1"})
        header = r.headers["set-cookie"].lower()
        self.assertIn("httponly", header)
        self.assertIn("samesite=strict", header)

    def test_bad_login_and_lockout(self):
        c = TestClient(self.app)
        for _ in range(5):
            r = c.post("/api/auth/login", json={"username": "nurse", "password": "nope"})
            self.assertEqual(r.status_code, 401)
        r = c.post("/api/auth/login", json={"username": "nurse", "password": "nursepass1"})
        self.assertEqual(r.status_code, 429)  # even the right password is blocked while locked

    def test_deactivated_user_session_revoked(self):
        n = self.nurse()
        uid = n.get("/api/auth/me").json()["id"]
        self.assertEqual(self.admin().patch(f"/api/users/{uid}", json={"active": False}).status_code, 200)
        self.assertEqual(n.get("/api/auth/me").status_code, 401)

    def test_no_public_registration(self):
        self.assertEqual(TestClient(self.app).post(
            "/api/users", json={"username": "evil1", "password": "password1", "role": "ADMIN"}).status_code, 401)
        self.assertEqual(self.nurse().post(
            "/api/users", json={"username": "evil1", "password": "password1", "role": "ADMIN"}).status_code, 403)


class TestPermissions(ApiBase):
    def test_viewer_read_only(self):
        fac = self.make_facility()
        v = self.viewer()
        self.assertEqual(v.get("/api/referrals").status_code, 200)
        r = v.post("/api/referrals", json={"patient_id": 1, "facility_id": fac, "reason": "Some reason"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(v.post("/api/facilities", json={"name": "X Clinic"}).status_code, 403)
        self.assertEqual(v.post("/api/notifications/generate").status_code, 403)

    def test_worker_can_add_but_not_edit_or_delete_facilities(self):
        n = self.nurse()
        r = n.post("/api/facilities", json={"name": "Inline Clinic"})
        self.assertEqual(r.status_code, 201)
        fid = r.json()["id"]
        self.assertEqual(n.put(f"/api/facilities/{fid}", json={"name": "Renamed"}).status_code, 403)
        self.assertEqual(n.delete(f"/api/facilities/{fid}").status_code, 403)


class TestReferralFlow(ApiBase):
    def test_full_lifecycle_persisted_in_postgres(self):
        n = self.nurse()
        rid = self.make_referral(n)
        d = n.get(f"/api/referrals/{rid}").json()
        self.assertEqual(d["status"], "PENDING")
        self.assertEqual(d["patient_name"], "Jane Doe")
        self.assertEqual(d["allowed_transitions"], ["ATTENDED", "CANCELLED", "NO_SHOW"])
        self.assertEqual(n.post(f"/api/referrals/{rid}/attendance").status_code, 200)
        fu = n.post(f"/api/referrals/{rid}/followups",
                    json={"scheduled_for": iso(date.today() + timedelta(7)), "notes": "Review cast"})
        self.assertEqual(fu.status_code, 201)
        self.assertEqual(n.post(f"/api/referrals/{rid}/status",
                                json={"status": "COMPLETED", "outcome": "Treated"}).status_code, 200)
        d = n.get(f"/api/referrals/{rid}").json()
        self.assertEqual(d["status"], "COMPLETED")
        self.assertEqual([h["to_status"] for h in d["history"]], ["PENDING", "ATTENDED", "COMPLETED"])
        self.assertEqual(d["followups"][0]["notes"], "Review cast")
        # data really is in the database, not memory
        row = self.db().execute("SELECT status, outcome FROM referrals WHERE id=?", (rid,)).fetchone()
        self.assertEqual((row["status"], row["outcome"]), ("COMPLETED", "Treated"))

    def test_invalid_transition_409(self):
        n = self.nurse()
        rid = self.make_referral(n)
        r = n.post(f"/api/referrals/{rid}/status", json={"status": "COMPLETED", "outcome": "Done"})
        self.assertEqual(r.status_code, 409)

    def test_validation_errors_422_and_no_orphan_patient(self):
        fac = self.make_facility()
        n = self.nurse()
        bad = {"patient": {"full_name": "Bob Smith", "date_of_birth": "1990-01-01", "phone": "0700111222"},
               "facility_id": fac, "reason": "ok reason", "urgency": "WHENEVER"}
        r = n.post("/api/referrals", json=bad)
        self.assertEqual(r.status_code, 422)
        self.assertIn("Urgency", r.json()["detail"])
        self.assertEqual(n.get("/api/patients?q=Bob").json(), [])  # patient not left behind

    def test_shape_errors_readable(self):
        r = self.nurse().post("/api/referrals", json={"facility_id": "abc", "reason": "x"})
        self.assertEqual(r.status_code, 422)
        self.assertIsInstance(r.json()["detail"], str)

    def test_extra_fields_rejected(self):
        r = self.admin().post("/api/facilities", json={"name": "Clinic Z", "role": "ADMIN"})
        self.assertEqual(r.status_code, 422)

    def test_needs_exactly_one_patient_source(self):
        fac = self.make_facility()
        r = self.nurse().post("/api/referrals", json={"facility_id": fac, "reason": "Some reason"})
        self.assertEqual(r.status_code, 422)

    def test_missing_referral_404(self):
        self.assertEqual(self.nurse().get("/api/referrals/999").status_code, 404)

    def test_search_and_filters(self):
        n = self.nurse()
        a = self.make_referral(n)
        self.make_referral(n, fac=1, reason="Chest pain", urgency="EMERGENCY",
                           patient={"full_name": "John Moyo", "date_of_birth": "1980-02-02", "phone": "0711222333"})
        self.assertEqual(len(n.get("/api/referrals").json()), 2)
        self.assertEqual(len(n.get("/api/referrals?q=moyo").json()), 1)
        self.assertEqual(len(n.get("/api/referrals?urgency=EMERGENCY").json()), 1)
        self.assertEqual(len(n.get("/api/referrals?status=PENDING&facility_id=1").json()), 2)
        self.assertEqual(len(n.get(f"/api/referrals?q=%23{a}").json()), 1)
        self.assertEqual(n.get("/api/referrals?status=BOGUS").status_code, 422)

    def test_sql_injection_in_search_is_inert(self):
        n = self.nurse()
        self.make_referral(n)
        r = n.get("/api/referrals", params={"q": "' OR 1=1; DROP TABLE referrals;--"})
        self.assertEqual((r.status_code, r.json()), (200, []))
        self.assertEqual(len(n.get("/api/referrals").json()), 1)


class TestFacilities(ApiBase):
    def test_crud_and_delete_guard(self):
        a = self.admin()
        fid = a.post("/api/facilities", json={"name": "Alpha Hospital"}).json()["id"]
        self.assertEqual(a.put(f"/api/facilities/{fid}",
                               json={"name": "Alpha Referral", "location": "North"}).status_code, 200)
        self.assertEqual(a.get("/api/facilities").json()[0]["name"], "Alpha Referral")
        self.assertEqual(a.post("/api/facilities", json={"name": "Alpha Referral"}).status_code, 422)
        self.make_referral(fac=fid)
        r = a.delete(f"/api/facilities/{fid}")
        self.assertEqual(r.status_code, 422)
        self.assertIn("cannot be deleted", r.json()["detail"])
        fid2 = a.post("/api/facilities", json={"name": "Beta Clinic"}).json()["id"]
        self.assertEqual(a.delete(f"/api/facilities/{fid2}").status_code, 200)


class TestNotificationsStats(ApiBase):
    def test_outstanding_notifications_and_stats(self):
        n = self.nurse()
        rid = self.make_referral(n, expected_by=iso(date.today() + timedelta(1)))
        # make it overdue directly in the DB (the API refuses past dates by design)
        conn = self.db()
        conn.execute("UPDATE referrals SET expected_by=? WHERE id=?", (iso(date.today() - timedelta(3)), rid))
        conn.commit()
        conn.close()
        out = n.get("/api/referrals/outstanding").json()
        self.assertEqual([o["id"] for o in out], [rid])
        self.assertEqual(n.post("/api/notifications/generate").json(), {"created": 1})
        self.assertEqual(n.post("/api/notifications/generate").json(), {"created": 0})
        notes = n.get("/api/notifications").json()
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]["kind"], "OVERDUE_REFERRAL")
        self.assertEqual(self.admin().get("/api/notifications").json(), [])  # only the owner is alerted
        n.post(f"/api/notifications/{notes[0]['id']}/read")
        self.assertEqual(n.get("/api/notifications").json(), [])
        self.assertEqual(len(n.get("/api/notifications?include_read=true").json()), 1)
        s = n.get("/api/stats").json()
        self.assertEqual((s["total"], s["overdue"], s["by_status"]), (1, 1, {"PENDING": 1}))
        self.assertEqual(s["by_facility"], [["City Hospital", 1]])
        self.assertEqual(len(s["by_month"]), 1)

    def test_followup_complete(self):
        n = self.nurse()
        rid = self.make_referral(n)
        fid = n.post(f"/api/referrals/{rid}/followups",
                     json={"scheduled_for": iso(date.today() + timedelta(2))}).json()["id"]
        self.assertEqual(len(n.get("/api/followups").json()), 1)
        n.post(f"/api/followups/{fid}/complete")
        self.assertEqual(n.get("/api/followups").json(), [])
        self.assertEqual(len(n.get("/api/followups?state=done").json()), 1)
        past = n.post(f"/api/referrals/{rid}/followups", json={"scheduled_for": "2020-01-01"})
        self.assertEqual(past.status_code, 422)

    def test_empty_stats(self):
        s = self.nurse().get("/api/stats").json()
        self.assertEqual((s["total"], s["attendance_rate"], s["by_month"]), (0, None, []))


if __name__ == "__main__":
    unittest.main()


class AutoNotifyTests(unittest.TestCase):
    def test_overdue_alert_created_at_startup_without_any_request(self):
        schema = new_schema()
        try:
            conn = open_db(schema, init=True)
            svc = Service(conn)
            svc.create_user(None, "admin", "adminpass1", "ADMIN")
            admin = svc.authenticate("admin", "adminpass1")
            fac = svc.add_facility(admin, "General Hospital", "Town")
            pid = svc.add_patient(admin, "Jane Doe", "1990-05-01", "0700111222")
            long_ago = iso(date.today() - timedelta(days=20))
            rid = svc.create_referral(admin, pid, fac, "X-ray")
            conn.execute("UPDATE referrals SET expected_by=?, referral_date=? WHERE id=?",
                         (iso(date.today() - timedelta(days=5)), long_ago, rid if isinstance(rid, int) else rid["id"]))
            conn.commit()
            before = len(svc.my_notifications(admin))
            conn.close()
            os.environ["REFERRAL_NOTIFY_INTERVAL"] = "3600"
            with TestClient(create_app(test_url(), schema=schema)):  # entering the context runs start-up
                import time
                time.sleep(1.0)
            conn = open_db(schema)
            after = len(Service(conn).my_notifications(admin))
            conn.close()
            self.assertEqual(before, 0)
            self.assertGreaterEqual(after, 1)
        finally:
            os.environ.pop("REFERRAL_NOTIFY_INTERVAL", None)
            drop_schema(schema)
