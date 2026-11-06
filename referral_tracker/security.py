"""Password hashing and role-based access control."""
import hashlib
import hmac
import os

from .errors import PermissionDenied

_ITERATIONS = 200_000

# action -> roles allowed to perform it
PERMISSIONS = {
    "manage_users": {"ADMIN"},
    "manage_facilities": {"ADMIN"},  # edit / delete
    "add_facility": {"ADMIN", "HEALTH_WORKER"},  # so a referral is never blocked by a missing facility
    "write_referral": {"ADMIN", "HEALTH_WORKER"},
    "read": {"ADMIN", "HEALTH_WORKER", "VIEWER"},
    "notify": {"ADMIN", "HEALTH_WORKER"},
}


def hash_password(password, salt=None):
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return salt.hex(), digest.hex()


def verify_password(password, salt_hex, hash_hex):
    _, digest = hash_password(password, bytes.fromhex(salt_hex))
    return hmac.compare_digest(digest, hash_hex)  # constant-time compare


def require(user, action):
    if user["role"] not in PERMISSIONS[action]:
        raise PermissionDenied(f"Role {user['role']} may not {action.replace('_', ' ')}.")
