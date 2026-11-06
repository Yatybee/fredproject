"""Input validation. Every value from the user passes through here first."""
import re
from datetime import date, datetime

from .errors import ValidationError

URGENCIES = ("ROUTINE", "URGENT", "EMERGENCY")
ROLES = ("ADMIN", "HEALTH_WORKER", "VIEWER")

_PHONE = re.compile(r"^\+?\d{7,15}$")
_USERNAME = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


def text(value, field, min_len=1, max_len=200):
    value = (value or "").strip()
    if not (min_len <= len(value) <= max_len):
        raise ValidationError(f"{field} must be {min_len}-{max_len} characters.")
    if any(ord(c) < 32 for c in value):
        raise ValidationError(f"{field} contains control characters.")
    return value


def optional_text(value, field, max_len=500):
    value = (value or "").strip()
    return text(value, field, 0, max_len) if value else ""


def phone(value):
    value = re.sub(r"[ \-()]", "", value or "")
    if not _PHONE.match(value):
        raise ValidationError("Phone must be 7-15 digits, optional leading +.")
    return value


def username(value):
    value = (value or "").strip()
    if not _USERNAME.match(value):
        raise ValidationError("Username must be 3-32 letters, digits, _ . -")
    return value


def password(value):
    if len(value or "") < 8:
        raise ValidationError("Password must be at least 8 characters.")
    return value


def choice(value, field, allowed):
    value = (value or "").strip().upper()
    if value not in allowed:
        raise ValidationError(f"{field} must be one of: {', '.join(allowed)}.")
    return value


def iso_date(value, field, allow_past=True):
    try:
        d = datetime.strptime((value or "").strip(), "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError(f"{field} must be a date in YYYY-MM-DD format.")
    if not allow_past and d < date.today():
        raise ValidationError(f"{field} cannot be in the past.")
    return d.isoformat()


def positive_int(value, field):
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field} must be a whole number.")
    if n <= 0:
        raise ValidationError(f"{field} must be positive.")
    return n
