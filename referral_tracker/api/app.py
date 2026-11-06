"""FastAPI application. A thin HTTP adapter over referral_tracker.service.Service:
no business rules live here, so validation, permissions and workflow are identical to the CLI."""
import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from .. import security
from ..db import connect
from ..errors import (AuthError, InvalidTransition, NotFound, PermissionDenied, ReferralError,
                      ValidationError)
from ..service import DEFAULT_CENTRE, TRANSITIONS, Service
from . import schemas as s

log = logging.getLogger("referral_tracker.api")

COOKIE = "session"
MAX_FAILS, LOCKOUT_SECONDS = 5, 300
STATUS_FOR = {ValidationError: 422, AuthError: 401, PermissionDenied: 403,
              NotFound: 404, InvalidTransition: 409}
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def rows(rs):
    return [dict(r) for r in rs]


def create_app(db_path=None):
    db_path = db_path or os.environ.get("REFERRAL_DB", "referrals.db")
    cookie_secure = os.environ.get("REFERRAL_COOKIE_SECURE", "0") == "1"
    connect(db_path).close()  # create / upgrade the schema once at start-up
    failures = {}  # username -> [timestamps]; in-memory brute-force throttle

    # Automatic alerts: run once at start-up, then every REFERRAL_NOTIFY_INTERVAL seconds
    # (default 3600; 0 turns the scheduler off). Same rules as the Notifications button / `notify`.
    interval = int(os.environ.get("REFERRAL_NOTIFY_INTERVAL", "3600"))

    def run_notifications():
        conn = connect(db_path, init=False)
        try:
            n = Service(conn).generate_notifications({"role": "ADMIN"})
            if n:
                log.info("scheduled check created %d alert(s)", n)
        except Exception:
            log.exception("scheduled notification check failed")
        finally:
            conn.close()

    async def scheduler():
        while True:
            await asyncio.to_thread(run_notifications)
            await asyncio.sleep(interval)

    @asynccontextmanager
    async def lifespan(_):
        task = asyncio.create_task(scheduler()) if interval > 0 else None
        yield
        if task:
            task.cancel()

    app = FastAPI(title="Referral Tracking and Follow-Up API", docs_url="/api/docs",
                  openapi_url="/api/openapi.json", lifespan=lifespan)

    # ---------- dependencies ----------
    def svc():
        conn = connect(db_path, init=False)
        try:
            yield Service(conn)
        finally:
            conn.close()

    def current_user(request: Request, service: Service = Depends(svc)):
        return service.user_for_token(request.cookies.get(COOKIE))

    # ---------- error handling ----------
    @app.exception_handler(ReferralError)
    async def referral_error(_, exc: ReferralError):
        code = next((c for t, c in STATUS_FOR.items() if isinstance(exc, t)), 400)
        return JSONResponse({"detail": str(exc)}, status_code=code)

    @app.exception_handler(RequestValidationError)
    async def bad_shape(_, exc: RequestValidationError):
        first = exc.errors()[0]
        field = ".".join(str(p) for p in first["loc"] if p != "body")
        return JSONResponse({"detail": f"{field}: {first['msg']}" if field else first["msg"]},
                            status_code=422)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Unexpected server error."}, status_code=500)

    api = APIRouter(prefix="/api")

    # ---------- auth ----------
    @api.post("/auth/login")
    def login(body: s.LoginIn, response: Response, service: Service = Depends(svc)):
        key = body.username.lower()
        now = time.time()
        recent = [t for t in failures.get(key, []) if now - t < LOCKOUT_SECONDS]
        if len(recent) >= MAX_FAILS:
            return JSONResponse({"detail": "Too many failed attempts. Try again in a few minutes."},
                                status_code=429)
        try:
            user = service.authenticate(body.username, body.password)
        except AuthError:
            failures[key] = recent + [now]
            raise
        failures.pop(key, None)
        response.set_cookie(COOKIE, service.create_session(user), httponly=True, samesite="strict",
                            secure=cookie_secure, max_age=service.SESSION_HOURS * 3600)
        return me_payload(user)

    @api.post("/auth/logout")
    def logout(request: Request, response: Response, service: Service = Depends(svc)):
        service.end_session(request.cookies.get(COOKIE))
        response.delete_cookie(COOKIE)
        return {"ok": True}

    @api.get("/auth/me")
    def me(user=Depends(current_user)):
        return me_payload(user)

    def me_payload(user):
        return {"id": user["id"], "username": user["username"], "role": user["role"],
                "permissions": sorted(a for a, roles in security.PERMISSIONS.items()
                                      if user["role"] in roles)}

    # ---------- users (admin) ----------
    @api.get("/users")
    def users(user=Depends(current_user), service: Service = Depends(svc)):
        return rows(service.list_users(user))

    @api.post("/users", status_code=201)
    def add_user(body: s.UserIn, user=Depends(current_user), service: Service = Depends(svc)):
        return {"id": service.create_user(user, body.username, body.password, body.role)}

    @api.patch("/users/{user_id}")
    def set_user_active(user_id: int, body: s.UserActiveIn, user=Depends(current_user),
                        service: Service = Depends(svc)):
        service.set_user_active(user, user_id, body.active)
        return {"ok": True}

    @api.get("/config")
    def config(user=Depends(current_user)):
        return {"centre_name": DEFAULT_CENTRE}

    @api.get("/staff")
    def staff(user=Depends(current_user), service: Service = Depends(svc)):
        """Active staff who can be assigned as the responsible health worker."""
        return rows(service.list_staff(user))

    # ---------- facilities ----------
    @api.get("/facilities")
    def facilities(user=Depends(current_user), service: Service = Depends(svc)):
        return rows(service.list_facilities(user))

    @api.post("/facilities", status_code=201)
    def add_facility(body: s.FacilityIn, user=Depends(current_user), service: Service = Depends(svc)):
        return {"id": service.add_facility(user, body.name, body.location, body.phone)}

    @api.put("/facilities/{facility_id}")
    def update_facility(facility_id: int, body: s.FacilityIn, user=Depends(current_user),
                        service: Service = Depends(svc)):
        service.update_facility(user, facility_id, body.name, body.location, body.phone)
        return {"ok": True}

    @api.delete("/facilities/{facility_id}")
    def delete_facility(facility_id: int, user=Depends(current_user), service: Service = Depends(svc)):
        service.delete_facility(user, facility_id)
        return {"ok": True}

    # ---------- patients ----------
    @api.get("/patients")
    def patients(q: str = "", user=Depends(current_user), service: Service = Depends(svc)):
        return rows(service.list_patients(user, q))

    @api.post("/patients", status_code=201)
    def add_patient(body: s.PatientIn, user=Depends(current_user), service: Service = Depends(svc)):
        pid = service.add_patient(user, body.full_name, body.date_of_birth, body.phone, body.address)
        return {"id": pid, "patient_no": f"PT-{pid:05d}"}

    @api.get("/patients/{patient_id}")
    def patient(patient_id: int, user=Depends(current_user), service: Service = Depends(svc)):
        p, referrals = service.get_patient(user, patient_id)
        return {**dict(p), "referrals": rows(referrals)}

    # ---------- referrals ----------
    @api.get("/referrals")
    def referrals(q: str = "", status: str = "", urgency: str = "", facility_id: int = 0,
                  user=Depends(current_user), service: Service = Depends(svc)):
        return rows(service.list_referrals(user, status or None, q, urgency or None, facility_id or None))

    @api.get("/referrals/outstanding")
    def outstanding(user=Depends(current_user), service: Service = Depends(svc)):
        return rows(service.outstanding_referrals(user))

    @api.post("/referrals", status_code=201)
    def create_referral(body: s.ReferralIn, user=Depends(current_user), service: Service = Depends(svc)):
        if (body.patient_id is None) == (body.patient is None):
            raise ValidationError("Provide either an existing patient or new patient details.")
        extra = dict(referral_date=body.referral_date, referring_facility=body.referring_facility,
                     notes=body.notes, responsible_id=body.responsible_id)
        if body.patient:
            p = body.patient
            pid, rid = service.register_and_refer(
                user, p.full_name, p.date_of_birth, p.phone, body.facility_id, body.reason,
                body.urgency, body.expected_by, address=p.address, **extra)
        else:
            pid = body.patient_id
            rid = service.create_referral(user, pid, body.facility_id, body.reason, body.urgency,
                                          body.expected_by, **extra)
        return {"id": rid, "patient_id": pid}

    @api.get("/referrals/{referral_id}")
    def referral(referral_id: int, user=Depends(current_user), service: Service = Depends(svc)):
        r = dict(service.get_referral(user, referral_id))
        r["history"] = rows(service.referral_history(user, referral_id))
        r["followups"] = rows(service.list_followups(user, state="all", referral_id=referral_id))
        r["allowed_transitions"] = sorted(TRANSITIONS[r["status"]])
        return r

    @api.post("/referrals/{referral_id}/status")
    def set_status(referral_id: int, body: s.StatusIn, user=Depends(current_user),
                   service: Service = Depends(svc)):
        new = body.status.upper()
        if new == "ATTENDED":
            service.confirm_attendance(user, referral_id, body.attended_on)
        elif new == "COMPLETED":
            service.complete_referral(user, referral_id, body.outcome)
        elif new == "NO_SHOW":
            service.mark_no_show(user, referral_id)
        elif new == "CANCELLED":
            service.cancel_referral(user, referral_id, body.outcome)
        else:
            raise ValidationError("Status must be ATTENDED, COMPLETED, NO_SHOW or CANCELLED.")
        return {"ok": True}

    @api.post("/referrals/{referral_id}/attendance")
    def confirm_attendance(referral_id: int, body: s.StatusIn | None = None,
                           user=Depends(current_user), service: Service = Depends(svc)):
        service.confirm_attendance(user, referral_id, body.attended_on if body else None)
        return {"ok": True}

    # ---------- follow-ups ----------
    @api.get("/followups")
    def followups(state: str = "pending", due: bool = False, user=Depends(current_user),
                  service: Service = Depends(svc)):
        return rows(service.list_followups(user, due_only=due, state=state))

    @api.post("/referrals/{referral_id}/followups", status_code=201)
    def add_followup(referral_id: int, body: s.FollowupIn, user=Depends(current_user),
                     service: Service = Depends(svc)):
        return {"id": service.schedule_followup(user, referral_id, body.scheduled_for, body.notes)}

    @api.post("/followups/{followup_id}/complete")
    def complete_followup(followup_id: int, user=Depends(current_user), service: Service = Depends(svc)):
        service.complete_followup(user, followup_id)
        return {"ok": True}

    # ---------- notifications ----------
    @api.post("/notifications/generate")
    def generate(user=Depends(current_user), service: Service = Depends(svc)):
        return {"created": service.generate_notifications(user)}

    @api.get("/notifications")
    def notifications(include_read: bool = False, user=Depends(current_user),
                      service: Service = Depends(svc)):
        return rows(service.my_notifications(user, include_read))

    @api.post("/notifications/read")
    def read_all(user=Depends(current_user), service: Service = Depends(svc)):
        service.mark_notifications_read(user)
        return {"ok": True}

    @api.post("/notifications/{notification_id}/read")
    def read_one(notification_id: int, user=Depends(current_user), service: Service = Depends(svc)):
        service.mark_notification_read(user, notification_id)
        return {"ok": True}

    # ---------- statistics ----------
    @api.get("/stats")
    def stats(user=Depends(current_user), service: Service = Depends(svc)):
        return service.statistics(user)

    @api.get("/health")
    def health():
        return {"ok": True}

    app.include_router(api)

    # ---------- serve the built React app (production / single-port mode) ----------
    if FRONTEND_DIST.is_dir():
        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse({"detail": "Not found."}, status_code=404)
            target = (FRONTEND_DIST / path).resolve()
            if path and FRONTEND_DIST in target.parents and target.is_file():
                return FileResponse(target)
            return FileResponse(FRONTEND_DIST / "index.html")  # client-side routing

    return app
