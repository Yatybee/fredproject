"""Command-line interface.  Run:  python -m referral_tracker --help"""
import argparse
import getpass
import logging
import os
import sys

from .db import connect
from .errors import ReferralError
from .service import Service

log = logging.getLogger("referral_tracker")


def build_parser():
    p = argparse.ArgumentParser(prog="referral_tracker", description=__doc__)
    p.add_argument("--db", default=None, help="Postgres connection string (default: $DATABASE_URL)")
    p.add_argument("--user", "-u", help="username (or set REFERRAL_USER)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def cmd(name, *args, help=None):
        sp = sub.add_parser(name, help=help)
        for a in args:
            flags, kw = (a[0], a[1]) if isinstance(a, tuple) else (a, {})
            sp.add_argument(*([flags] if isinstance(flags, str) else flags), **kw)
        return sp

    cmd("init-admin", "username", help="create the first admin account")
    cmd("add-user", "username", ("role", {"help": "ADMIN | HEALTH_WORKER | VIEWER"}))
    cmd("add-facility", "name", ("--location", {"default": ""}), ("--phone", {"default": ""}))
    cmd("facilities")
    cmd("add-patient", "name", ("dob", {"help": "YYYY-MM-DD"}), "phone")
    cmd("refer", ("patient_id", {}), ("facility_id", {}), "reason",
        ("--urgency", {"default": "ROUTINE"}), ("--expected-by", {"help": "YYYY-MM-DD"}))
    cmd("referrals", ("--status", {}))
    cmd("show", "referral_id")
    cmd("confirm", "referral_id", ("--date", {"help": "attendance date, default today"}))
    cmd("complete", "referral_id", "outcome")
    cmd("no-show", "referral_id")
    cmd("cancel", "referral_id", "reason")
    cmd("follow-up", "referral_id", ("date", {"help": "YYYY-MM-DD"}), ("--notes", {"default": ""}))
    cmd("follow-ups", ("--due", {"action": "store_true"}))
    cmd("done-follow-up", "followup_id")
    cmd("outstanding", help="list overdue referrals")
    cmd("notify", help="generate alerts for overdue referrals / due follow-ups")
    cmd("inbox", ("--all", {"action": "store_true"}), ("--mark-read", {"action": "store_true"}))
    cmd("stats")
    return p


def _table(rows, cols):
    rows = [[str(r[c]) if r[c] is not None else "-" for c in cols] for r in rows]
    widths = [max(len(c), *(len(r[i]) for r in rows)) if rows else len(c) for i, c in enumerate(cols)]
    print("  ".join(c.upper().ljust(w) for c, w in zip(cols, widths)))
    for r in rows:
        print("  ".join(x.ljust(w) for x, w in zip(r, widths)))
    if not rows:
        print("(none)")


REF_COLS = ["id", "patient_name", "facility_name", "urgency", "status", "expected_by"]


def run(args, svc):
    c = args.cmd
    if c == "init-admin":
        pw = _password("New admin password: ", confirm=True)
        print(f"Admin created (id {svc.create_user(None, args.username, pw, 'ADMIN')}).")
        return
    user = svc.authenticate(args.user or os.environ.get("REFERRAL_USER"), _password("Password: "))

    if c == "add-user":
        pw = _password(f"Password for {args.username}: ", confirm=True)
        print(f"User created (id {svc.create_user(user, args.username, pw, args.role)}).")
    elif c == "add-facility":
        print(f"Facility id {svc.add_facility(user, args.name, args.location, args.phone)}.")
    elif c == "facilities":
        _table(svc.list_facilities(user), ["id", "name", "location", "phone"])
    elif c == "add-patient":
        print(f"Patient id {svc.add_patient(user, args.name, args.dob, args.phone)}.")
    elif c == "refer":
        print(f"Referral id {svc.create_referral(user, args.patient_id, args.facility_id, args.reason, args.urgency, args.expected_by)}.")
    elif c == "referrals":
        _table(svc.list_referrals(user, args.status), REF_COLS)
    elif c == "show":
        r = svc.get_referral(user, args.referral_id)
        for k in r.keys():
            print(f"{k:>15}: {r[k]}")
    elif c == "confirm":
        svc.confirm_attendance(user, args.referral_id, args.date); print("Attendance confirmed.")
    elif c == "complete":
        svc.complete_referral(user, args.referral_id, args.outcome); print("Referral completed.")
    elif c == "no-show":
        svc.mark_no_show(user, args.referral_id); print("Marked no-show.")
    elif c == "cancel":
        svc.cancel_referral(user, args.referral_id, args.reason); print("Referral cancelled.")
    elif c == "follow-up":
        print(f"Follow-up id {svc.schedule_followup(user, args.referral_id, args.date, args.notes)}.")
    elif c == "follow-ups":
        _table(svc.list_followups(user, args.due), ["id", "referral_id", "full_name", "scheduled_for", "notes"])
    elif c == "done-follow-up":
        svc.complete_followup(user, args.followup_id); print("Follow-up done.")
    elif c == "outstanding":
        _table(svc.outstanding_referrals(user), REF_COLS)
    elif c == "notify":
        print(f"{svc.generate_notifications(user)} new alert(s) created.")
    elif c == "inbox":
        _table(svc.my_notifications(user, args.all), ["created_on", "kind", "message"])
        if args.mark_read:
            svc.mark_notifications_read(user)
    elif c == "stats":
        _print_stats(svc.statistics(user))


def _print_stats(s):
    print(f"Total referrals:        {s['total']}")
    for k, n in sorted(s["by_status"].items()):
        print(f"  {k:<10} {n}")
    print(f"Attendance rate:        {_pct(s['attendance_rate'])}  (attended or completed / decided)")
    print(f"Completion rate:        {_pct(s['completion_rate'])}")
    print(f"Avg days to attendance: {s['avg_days_to_attendance'] if s['avg_days_to_attendance'] is not None else 'n/a'}")
    print(f"Overdue referrals:      {s['overdue']}")
    print(f"Pending follow-ups:     {s['followups_pending']}")
    print("By urgency:  " + (", ".join(f"{k}={n}" for k, n in sorted(s["by_urgency"].items())) or "none"))
    print("By facility:")
    for name, n in s["by_facility"]:
        print(f"  {name}: {n}")


def _pct(x):
    return "n/a" if x is None else f"{x}%"


def _password(prompt, confirm=False):
    pw = os.environ.get("REFERRAL_PASSWORD") or getpass.getpass(prompt)
    if confirm and not os.environ.get("REFERRAL_PASSWORD") and getpass.getpass("Repeat: ") != pw:
        raise ReferralError("Passwords do not match.")
    return pw


def main(argv=None):
    logging.basicConfig(filename=os.environ.get("REFERRAL_LOG", "referral_tracker.log"),
                        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_parser().parse_args(argv)
    conn = connect(args.db)
    try:
        run(args, Service(conn))
        return 0
    except ReferralError as e:  # expected problem: show a clean message
        log.warning("%s: %s", args.cmd, e)
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception:  # unexpected bug: log the traceback, show nothing internal
        log.exception("unexpected failure in %s", args.cmd)
        print("Unexpected error. Details were written to the log.", file=sys.stderr)
        return 2
    finally:
        conn.close()
