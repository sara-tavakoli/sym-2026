from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

Gender = Literal["", "female", "male", "non_binary", "other", "prefer_not_to_say"]
REQUIRED_PROFILE_FIELDS = ("full_name", "date_of_birth", "mobile")


class UserProfile(BaseModel):
    full_name: str = ""
    date_of_birth: str = ""  # yyyy-mm-dd
    mobile: str = ""
    preferred_name: str = ""
    gender: Gender = ""


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    date_of_birth: str
    mobile: str
    preferred_name: str = Field("", max_length=40)
    gender: Gender = ""

    @field_validator("full_name", "preferred_name")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("date_of_birth")
    @classmethod
    def valid_dob(cls, v: str) -> str:
        try:
            d = date.fromisoformat(v)
        except ValueError:
            raise ValueError("Enter your date of birth as a valid date")
        today = date.today()
        if d >= today or (today.year - d.year) > 120:
            raise ValueError("Enter a real date of birth")
        return v

    @field_validator("mobile")
    @classmethod
    def valid_mobile(cls, v: str) -> str:
        digits = "".join(c for c in v if c.isdigit())
        if not 8 <= len(digits) <= 15:
            raise ValueError("Enter a valid mobile number, e.g. 0412 345 678")
        return v.strip()


class PublicUser(BaseModel):
    user_id: str
    email: str
    name: str
    auth_providers: list[str]
    profile: UserProfile
    profile_complete: bool
    missing_fields: list[str]


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class GoogleSessionRequest(BaseModel):
    session_id: str = Field(min_length=4, max_length=512)


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(max_length=128)


class OkResponse(BaseModel):
    ok: bool = True
    message: Optional[str] = None
