"""Trust boundary helpers for prompt assembly."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class TrustLevel(StrEnum):
    TRUSTED = "trusted"
    UNTRUSTED = "untrusted"


class ContentSourceType(StrEnum):
    SYSTEM_PROMPT = "system_prompt"
    OPERATOR_PROMPT = "operator_prompt"
    USER_CONTENT = "user_content"
    RETRIEVED_KNOWLEDGE = "retrieved_knowledge"
    TOOL_OUTPUT = "tool_output"
    FILE_CONTENT = "file_content"
    WEB_CONTENT = "web_content"
    GENERATED_SUMMARY = "generated_summary"


UNTRUSTED_TAG = "untrusted_content"


class TrustBoundary(BaseModel):
    source_type: ContentSourceType
    trust_level: TrustLevel
    source_id: str | None = None
    transformation_path: list[str] = Field(default_factory=list)


def classify_trust_level(source_type: ContentSourceType, *, promoted: bool = False) -> TrustLevel:
    if promoted:
        return TrustLevel.TRUSTED
    if source_type in {ContentSourceType.SYSTEM_PROMPT, ContentSourceType.OPERATOR_PROMPT, ContentSourceType.USER_CONTENT}:
        return TrustLevel.TRUSTED
    return TrustLevel.UNTRUSTED


def wrap_untrusted_content(content: str, boundary: TrustBoundary) -> str:
    source_id = f' source_id="{boundary.source_id}"' if boundary.source_id else ""
    path = ",".join(boundary.transformation_path)
    transformation = f' transformation_path="{path}"' if path else ""
    return (
        f"<{UNTRUSTED_TAG} source_type=\"{boundary.source_type.value}\""
        f"{source_id} trust_level=\"{boundary.trust_level.value}\"{transformation}>\n"
        f"{content}\n"
        f"</{UNTRUSTED_TAG}>"
    )
