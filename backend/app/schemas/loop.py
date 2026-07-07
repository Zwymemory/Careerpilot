from enum import StrEnum

from pydantic import AliasChoices, BaseModel, Field, model_validator


class LoopPhase(StrEnum):
    PLAN = "plan"
    EXECUTE = "execute"
    VERIFY = "verify"
    REFLECT = "reflect"
    HUMAN_APPROVAL = "human_approval"
    COMMIT = "commit"


class LoopRunRequest(BaseModel):
    goal: str = Field(min_length=3, max_length=800)
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    resume_text: str | None = Field(default=None, min_length=10, max_length=30000)
    job_text: str | None = Field(default=None, min_length=10, max_length=30000)

    @model_validator(mode="after")
    def require_resume_or_job_text(self) -> "LoopRunRequest":
        if not self.resume_text and not self.job_text:
            raise ValueError("At least one of resume_text or job_text is required.")
        return self


class LoopApprovalRequest(BaseModel):
    approved_by: str = Field(default="local-user", min_length=1, max_length=80)
    notes: str | None = Field(
        default=None,
        max_length=1000,
        validation_alias=AliasChoices("notes", "note"),
    )


class LoopResumeRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
