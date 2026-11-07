"""Tests for the referral form fields, patient management, dashboard statistics and DB migration."""
import unittest
from datetime import date, timedelta

from tests.pgutil import drop_schema, new_schema, open_db
from tests.test_api import ApiBase, iso


class TestReferralFormFields(ApiBase):
    def body(self, fac, **over):
        return {"patient": {"full_name": "Amina Yusuf", "date_of_birth": "1985-03-12",
                            "phone": "0700999888", "address": "12 Market Road"},
                "facility_id": fac, "reason": "Suspected appendicitis", "urgency": "EMERGENCY",
                "referral_date": iso(date.today() - timedelta(1)),
                "referring_facility": "Northside Health Post",
                "notes": "Fever for 3 days, pain lower right abdomen", **over}

    def test_all_form_fields_saved_with_pending_status(self):
        fac = self.make_facility()
        n = self.nurse()
        admin_id = self.admin().get("/api/auth/me").json()["id"]  # responsible worker != creator
        r = n.post("/api/referrals", json=self.body(fac, responsible_id=admin_id))
        self.assertEqual(r.status_code, 201, r.text)
        d = n.get(f"/api/referrals/{r.json()['id']}").json()
        self.assertEqual(d["status"], "PENDING")
        self.assertEqual(d["referring_facility"], "Northside Health Post")
        self.assertEqual(d["notes"], "Fever for 3 days, pain lower right abdomen")
        self.assertEqual(d["referral_date"], iso(date.today() - timedelta(1)))
        self.assertEqual(d["patient_address"], "12 Market Road")
        self.assertEqual(d["referred_by_name"], "admin")
        self.assertRegex(d["patient_no"], r"^PT-\d{5}$")
        self.assertEqual(d["history"][0]["changed_by_name"], "nurse")  # audit trail: who really created it
        row = self.db().execute("SELECT notes, referring_facility FROM referrals").fetchone()
        self.assertEqual(row["notes"], "Fever for 3 days, pain lower right abdomen")

    def test_defaults_for_responsible_and_referring_facility(self):
        d = self.nurse().get(f"/api/referrals/{self.make_referral()}").json()
        self.assertEqual(d["referred_by_name"], "nurse")
        self.assertEqual(d["referring_facility"], "Community Health Centre")
        self.assertEqual(d["referral_date"], iso(date.today()))

    def test_referral_date_cannot_be_future(self):
        fac = self.make_facility()
        r = self.nurse().post("/api/referrals", json=self.body(fac, referral_date=iso(date.today() + timedelta(2))))
        self.assertEqual(r.status_code, 422)
        self.assertIn("future", r.json()["detail"])

    def test_expected_by_cannot_precede_referral_date(self):
        fac = self.make_facility()
        r = self.nurse().post("/api/referrals", json=self.body(
            fac, referral_date=iso(date.today()), expected_by=iso(date.today() - timedelta(1))))
        self.assertEqual(r.status_code, 422)

    def test_backdated_referral_gets_overdue_default(self):
        fac = self.make_facility()
        n = self.nurse()
        n.post("/api/referrals", json=self.body(fac, referral_date=iso(date.today() - timedelta(20)),
                                                urgency="ROUTINE"))
        self.assertEqual(len(n.get("/api/referrals/outstanding").json()), 1)  # 20 days ago + 14 < today

    def test_responsible_must_be_active_worker_and_nothing_half_saved(self):
        fac = self.make_facility()
        viewer_id = self.viewer().get("/api/auth/me").json()["id"]
        r = self.nurse().post("/api/referrals", json=self.body(fac, responsible_id=viewer_id))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.nurse().get("/api/patients?q=Amina").json(), [])

    def test_staff_list_excludes_viewers(self):
        names = [u["username"] for u in self.nurse().get("/api/staff").json()]
        self.assertEqual(names, ["admin", "nurse"])

    def test_receiving_facility_must_exist(self):
        r = self.nurse().post("/api/referrals", json=self.body(999))
        self.assertEqual(r.status_code, 404)
        self.assertIn("Receiving facility", r.json()["detail"])

    def test_worker_adds_facility_then_refers_to_it(self):
        n = self.nurse()
        fid = n.post("/api/facilities", json={"name": "Lakeside Specialist Clinic"}).json()["id"]
        self.assertEqual(n.post("/api/referrals", json=self.body(fid)).status_code, 201)


class TestPatients(ApiBase):
    def test_register_search_view(self):
        n = self.nurse()
        r = n.post("/api/patients", json={"full_name": "Grace Okello", "date_of_birth": "1975-07-07",
                                          "phone": "0711000111", "address": "Hill View"})
        self.assertEqual(r.status_code, 201)
        pid, code = r.json()["id"], r.json()["patient_no"]
        self.assertEqual(n.get("/api/patients?q=okello").json()[0]["patient_no"], code)
        self.assertEqual(len(n.get(f"/api/patients?q={code}").json()), 1)
        self.assertEqual(len(n.get("/api/patients?q=0711000").json()), 1)
        self.assertEqual(n.get("/api/patients?q=nobody").json(), [])

        fac = self.make_facility()
        rid = n.post("/api/referrals", json={"patient_id": pid, "facility_id": fac,
                                             "reason": "Eye review"}).json()["id"]
        d = n.get(f"/api/patients/{pid}").json()
        self.assertEqual((d["full_name"], d["address"], d["patient_no"]), ("Grace Okello", "Hill View", code))
        self.assertEqual([x["id"] for x in d["referrals"]], [rid])
        listed = n.get("/api/patients").json()[0]
        self.assertEqual((listed["referral_count"], listed["last_referral"]), (1, iso(date.today())))

    def test_validation_and_permissions(self):
        self.assertEqual(self.nurse().post("/api/patients", json={
            "full_name": "X", "date_of_birth": "1990-01-01", "phone": "123"}).status_code, 422)
        ok = {"full_name": "Valid Name", "date_of_birth": "1990-01-01", "phone": "0700111222"}
        self.assertEqual(self.viewer().post("/api/patients", json=ok).status_code, 403)
        self.assertEqual(self.viewer().get("/api/patients").status_code, 200)
        self.assertEqual(self.nurse().get("/api/patients/999").status_code, 404)


class TestDashboardStatistics(ApiBase):
    def test_followup_counts_and_alert(self):
        n = self.nurse()
        a = self.make_referral(n)
        self.make_referral(n, fac=1)
        n.post(f"/api/referrals/{a}/followups", json={"scheduled_for": iso(date.today() + timedelta(3))})
        n.post(f"/api/referrals/{a}/followups", json={"scheduled_for": iso(date.today() + timedelta(9))})
        conn = self.db()
        conn.execute("UPDATE followups SET scheduled_for=? WHERE id=1", (iso(date.today() - timedelta(2)),))
        conn.commit()
        conn.close()
        s = n.get("/api/stats").json()
        self.assertEqual((s["total"], s["needing_followup"], s["followups_pending"], s["followups_overdue"]),
                         (2, 1, 2, 1))
        self.assertEqual(n.post("/api/notifications/generate").json()["created"], 1)
        self.assertIn("was due", n.get("/api/notifications").json()[0]["message"])

    def test_pending_referral_alert_wording(self):
        n = self.nurse()
        rid = self.make_referral(n)
        conn = self.db()
        conn.execute("UPDATE referrals SET expected_by=? WHERE id=?", (iso(date.today() - timedelta(2)), rid))
        conn.commit()
        conn.close()
        n.post("/api/notifications/generate")
        self.assertIn("has not been confirmed as attended", n.get("/api/notifications").json()[0]["message"])
        n.post(f"/api/referrals/{rid}/status", json={"status": "NO_SHOW"})
        n.post("/api/notifications/generate")  # same day, same kind: no duplicate alert
        self.assertEqual(len(n.get("/api/notifications").json()), 1)


class TestMigration(unittest.TestCase):
    def test_old_database_gains_new_columns_and_keeps_data(self):
        schema = new_schema()
        self.addCleanup(drop_schema, schema)
        old = open_db(schema)  # creates the (empty) schema only
        old.execute("""
            CREATE TABLE patients (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                full_name TEXT NOT NULL, date_of_birth TEXT NOT NULL, phone TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT '2020-01-01 00:00:00')""")
        old.execute("INSERT INTO patients (full_name, date_of_birth, phone) VALUES ('Old Patient','1970-01-01','0700000000')")
        old.execute("""
            CREATE TABLE referrals (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                patient_id INTEGER NOT NULL, facility_id INTEGER NOT NULL,
                referred_by INTEGER NOT NULL, reason TEXT NOT NULL, urgency TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING', referral_date TEXT NOT NULL, expected_by TEXT NOT NULL,
                attended_on TEXT, confirmed_by INTEGER, outcome TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT '2020-01-01 00:00:00')""")
        old.commit()
        old.close()
        conn = open_db(schema, init=True)
        cols = lambda t: {r[0] for r in conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?", (t,))}
        self.assertTrue({"notes", "referring_facility"} <= cols("referrals"))
        self.assertIn("address", cols("patients"))
        row = conn.execute("SELECT full_name, address FROM patients").fetchone()
        self.assertEqual((row["full_name"], row["address"]), ("Old Patient", ""))
        conn.close()
        open_db(schema, init=True).close()  # a second start-up is harmless


if __name__ == "__main__":
    unittest.main()
