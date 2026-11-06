"""Domain exceptions. Callers catch these instead of raw sqlite3/ValueError."""


class ReferralError(Exception):
    """Base class for all expected, user-facing errors."""


class ValidationError(ReferralError):
    """Input failed validation."""


class AuthError(ReferralError):
    """Bad credentials."""


class PermissionDenied(ReferralError):
    """User's role does not allow the action."""


class NotFound(ReferralError):
    """Requested record does not exist."""


class InvalidTransition(ReferralError):
    """Status change not allowed by the referral workflow."""
