import ast
import json
import re
from dataclasses import dataclass
from typing import Any


class JSONRepairError(ValueError):
    pass


@dataclass(frozen=True)
class JSONRepairResult:
    data: dict[str, Any]
    repaired: bool
    issues: list[str]


_FENCED_JSON_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)
_TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")


def repair_json_object(raw_text: str) -> JSONRepairResult:
    candidate, extraction_repaired, extraction_issues = _extract_json_candidate(raw_text)
    attempts = [(candidate, extraction_repaired, extraction_issues)]

    normalized = _normalize_json_text(candidate)
    if normalized != candidate:
        attempts.append((normalized, True, [*extraction_issues, "normalized_json_text"]))

    last_error: Exception | None = None
    for text, repaired, issues in attempts:
        try:
            data = json.loads(text)
            return _ensure_object(data, repaired, issues)
        except json.JSONDecodeError as exc:
            last_error = exc

    try:
        data = ast.literal_eval(normalized)
        return _ensure_object(data, True, [*extraction_issues, "parsed_python_literal"])
    except (SyntaxError, ValueError) as exc:
        last_error = exc

    raise JSONRepairError(f"Could not repair JSON object: {last_error}") from last_error


def _extract_json_candidate(raw_text: str) -> tuple[str, bool, list[str]]:
    text = raw_text.strip()
    fenced_match = _FENCED_JSON_RE.search(text)
    if fenced_match:
        return fenced_match.group(1).strip(), True, ["extracted_markdown_json_fence"]

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise JSONRepairError("No JSON object found in text.")
    if start == 0 and end == len(text) - 1:
        return text, False, []
    return text[start : end + 1], True, ["extracted_embedded_json_object"]


def _normalize_json_text(text: str) -> str:
    normalized = text.strip()
    normalized = normalized.replace("\u201c", '"').replace("\u201d", '"')
    normalized = normalized.replace("\u2018", "'").replace("\u2019", "'")
    normalized = _TRAILING_COMMA_RE.sub(r"\1", normalized)
    return normalized


def _ensure_object(data: Any, repaired: bool, issues: list[str]) -> JSONRepairResult:
    if not isinstance(data, dict):
        raise JSONRepairError("Parsed JSON value is not an object.")
    return JSONRepairResult(data=data, repaired=repaired, issues=issues)
