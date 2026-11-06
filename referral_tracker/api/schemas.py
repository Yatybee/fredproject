"""Request bodies. These only check shape and size; the real business validation stays in
referral_tracker.validation / Service so the CLI and the API can never disagree."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginIn(Body):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)


class UserIn(Body):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)
    role: str = Field(max_length=20)


class UserActiveIn(Body):
    active: bool


class FacilityIn(Body):
    name: str = Field(max_length=200)
    location: str = Field("", max_length=200)
    phone: str = Field("", max_length=30)


class PatientIn(Body):
    full_name: str = Field(max_length=200)
    date_of_birth: str = Field(max_length=10)
    phone: str = Field(max_length=30)
    address: str = Field("", max_length=300)


class ReferralIn(Body):
    """Either patient_id (existing patient) or patient (register a new one) must be given."""
    patient_id: Optional[int] = None
    patient: Optional[PatientIn] = None
    facility_id: int
    reason: str = Field(max_length=1000)
    urgency: str = Field("ROUTINE", max_length=20)
    expected_by: Optional[str] = Field(None, max_length=10)
    referral_date: Optional[str] = Field(None, max_length=10)
    referring_facility: str = Field("", max_length=200)
    notes: str = Field("", max_length=2000)
    responsible_id: Optional[int] = None


class StatusIn(Body):
    status: str = Field(max_length=20)
    attended_on: Optional[str] = Field(None, max_length=10)
    outcome: Optional[str] = Field(None, max_length=1000)


class FollowupIn(Body):
    scheduled_for: str = Field(max_length=10)
    notes: str = Field("", max_length=1000)
