import base64
from io import BytesIO

from fastapi import APIRouter, HTTPException, status
from pydantic import AliasChoices, BaseModel, Field

router = APIRouter(tags=["text-extraction"])


class TextExtractionRequest(BaseModel):
    file_base64: str = Field(
        min_length=1,
        validation_alias=AliasChoices("fileBase64", "file_base64"),
    )
    mime_type: str | None = Field(
        default=None,
        validation_alias=AliasChoices("mimeType", "mime_type"),
    )
    file_name: str | None = Field(
        default=None,
        max_length=240,
        validation_alias=AliasChoices("fileName", "file_name"),
    )


class TextExtractionResponse(BaseModel):
    text: str


@router.post("/extract-text", response_model=TextExtractionResponse)
async def extract_text(payload: TextExtractionRequest) -> TextExtractionResponse:
    raw = _decode_base64(payload.file_base64)
    name = (payload.file_name or "").lower()
    mime = (payload.mime_type or "").lower()

    if name.endswith((".txt", ".md")) or mime.startswith("text/"):
        return TextExtractionResponse(text=_decode_text(raw))

    if name.endswith(".pdf") or mime == "application/pdf":
        text = _extract_pdf_text(raw)
        if text:
            return TextExtractionResponse(text=text)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PDF 中没有提取到可复制文本，请改为上传文字版 PDF、TXT 或 Markdown。",
        )

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="当前后端暂未配置图片 OCR，请先上传 PDF、TXT 或 Markdown 文本文件。",
    )


def _decode_base64(value: str) -> bytes:
    data = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    try:
        return base64.b64decode(data, validate=False)
    except Exception as exc:  # noqa: BLE001 - request boundary converts decode failures.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="文件 Base64 内容无法解析。",
        ) from exc


def _decode_text(raw: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _extract_pdf_text(raw: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="后端缺少 PDF 文本解析依赖 pypdf，请安装后重试。",
        ) from exc

    try:
        reader = PdfReader(BytesIO(raw))
    except Exception as exc:  # noqa: BLE001 - malformed uploaded file.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PDF 文件无法打开或已损坏。",
        ) from exc

    chunks: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            chunks.append(page_text.strip())
    return "\n\n".join(chunks).strip()
