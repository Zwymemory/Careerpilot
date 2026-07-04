import hashlib
import ipaddress
import re
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import httpx

from app.schemas.job_collector import BrowserSafetyReport, JobCollectRequest, JobSnapshot

SAFETY_RULES = [
    "只允许 http/https 岗位页面。",
    "阻断 localhost、私有网段、链路本地地址和 file/data/javascript URL。",
    "不携带用户 Cookie、登录态或浏览器本地存储。",
    "不绕过验证码、登录墙、反爬限制或平台服务条款。",
    "限制响应体大小，保存正文哈希用于留证。",
]
MAX_FETCH_BYTES = 1_000_000


class JobCollectionError(ValueError):
    pass


@dataclass(frozen=True)
class ScreenshotCapture:
    path: str | None
    sha256: str | None
    status: str
    warning: str | None = None


class JobCollectorService:
    async def collect(self, payload: JobCollectRequest) -> JobSnapshot:
        safety = BrowserSafetyReport(allowed=True, rules=SAFETY_RULES.copy())

        if payload.url:
            return await self._collect_url(payload, safety)
        if payload.html:
            title, text = extract_html_text(payload.html)
            return self._snapshot(
                source_type="html",
                source_url=None,
                source_name=payload.source_name,
                title=title,
                text=text,
                html=payload.html,
                screenshot=ScreenshotCapture(None, None, "skipped"),
                safety=safety,
            )

        text = normalize_text(payload.text or "")
        if len(text) < 10:
            raise JobCollectionError("Collected JD text is too short.")
        return self._snapshot(
            source_type="text",
            source_url=None,
            source_name=payload.source_name,
            title=payload.source_name,
            text=text,
            html=None,
            screenshot=ScreenshotCapture(None, None, "skipped"),
            safety=safety,
        )

    async def _collect_url(
        self,
        payload: JobCollectRequest,
        safety: BrowserSafetyReport,
    ) -> JobSnapshot:
        url = payload.url or ""
        _validate_public_url(url, safety)

        html = await fetch_public_html(url)
        title, text = extract_html_text(html)
        screenshot = (
            await capture_screenshot(url)
            if payload.capture_screenshot
            else ScreenshotCapture(None, None, "skipped")
        )
        if screenshot.warning:
            safety.warnings.append(screenshot.warning)

        return self._snapshot(
            source_type="url",
            source_url=url,
            source_name=payload.source_name,
            title=title,
            text=text,
            html=html,
            screenshot=screenshot,
            safety=safety,
        )

    def _snapshot(
        self,
        *,
        source_type: str,
        source_url: str | None,
        source_name: str | None,
        title: str | None,
        text: str,
        html: str | None,
        screenshot: ScreenshotCapture,
        safety: BrowserSafetyReport,
    ) -> JobSnapshot:
        clean_text = normalize_text(text)
        if len(clean_text) < 10:
            raise JobCollectionError("Collected JD text is too short.")

        return JobSnapshot(
            source_type=source_type,  # type: ignore[arg-type]
            source_url=source_url,
            source_name=source_name,
            title=title,
            text=clean_text[:50_000],
            text_hash=sha256_text(clean_text),
            html_hash=sha256_text(html) if html else None,
            screenshot_path=screenshot.path,
            screenshot_hash=screenshot.sha256,
            screenshot_status=screenshot.status,  # type: ignore[arg-type]
            captured_at=datetime.now(UTC),
            safety=safety,
        )


async def fetch_public_html(url: str) -> str:
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(12.0, connect=5.0),
        follow_redirects=True,
        headers={
            "User-Agent": "CareerPilotJobCollector/0.1 (+no-login; evidence capture)",
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        },
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type and "text/plain" not in content_type:
            raise JobCollectionError(f"Unsupported content type: {content_type or 'unknown'}.")
        content = response.content[:MAX_FETCH_BYTES + 1]
        if len(content) > MAX_FETCH_BYTES:
            raise JobCollectionError("Job page is too large to collect safely.")
        return content.decode(response.encoding or "utf-8", errors="replace")


async def capture_screenshot(url: str) -> ScreenshotCapture:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return ScreenshotCapture(
            path=None,
            sha256=None,
            status="unavailable",
            warning="Playwright is not installed; screenshot evidence was skipped.",
        )

    output_dir = Path(tempfile.gettempdir()) / "careerpilot_job_snapshots"
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"job_{sha256_text(url)[:16]}.png"
    output_path = output_dir / filename

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page(storage_state=None)
            await page.goto(url, wait_until="domcontentloaded", timeout=15_000)
            await page.screenshot(path=str(output_path), full_page=True)
            await browser.close()
    except Exception as exc:  # noqa: BLE001 - screenshot is non-critical evidence.
        return ScreenshotCapture(
            path=None,
            sha256=None,
            status="unavailable",
            warning=f"Screenshot capture unavailable: {exc}",
        )

    return ScreenshotCapture(
        path=str(output_path),
        sha256=sha256_bytes(output_path.read_bytes()),
        status="captured",
    )


class JobHTMLTextExtractor(HTMLParser):
    block_tags = {
        "article",
        "br",
        "div",
        "h1",
        "h2",
        "h3",
        "li",
        "main",
        "p",
        "section",
        "td",
        "th",
        "tr",
    }
    ignored_tags = {"script", "style", "noscript", "svg", "canvas"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self._ignored_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.ignored_tags:
            self._ignored_depth += 1
        if tag == "title":
            self._in_title = True
        if tag in self.block_tags:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.ignored_tags and self._ignored_depth:
            self._ignored_depth -= 1
        if tag == "title":
            self._in_title = False
        if tag in self.block_tags:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        clean = normalize_inline(data)
        if not clean:
            return
        if self._in_title:
            self.title_parts.append(clean)
        else:
            self.parts.append(clean)


def extract_html_text(html: str) -> tuple[str | None, str]:
    extractor = JobHTMLTextExtractor()
    extractor.feed(html)
    title = normalize_text(" ".join(extractor.title_parts)) or None
    text = normalize_text("\n".join(extractor.parts))
    if title and title not in text:
        text = f"{title}\n{text}"
    return title, text


def normalize_inline(text: str) -> str:
    return re.sub(r"[ \t\r\f\v]+", " ", unescape(text)).strip()


def normalize_text(text: str) -> str:
    lines = [normalize_inline(line) for line in re.split(r"\n+", text)]
    compact_lines = [line for line in lines if line]
    return "\n".join(compact_lines)


def sha256_text(text: str | None) -> str:
    return sha256_bytes((text or "").encode("utf-8"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _validate_public_url(url: str, safety: BrowserSafetyReport) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        _block(safety, "Only http/https URLs are allowed.")
    if not parsed.hostname:
        _block(safety, "URL must include a hostname.")

    host = parsed.hostname or ""
    if host.lower() in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        _block(safety, "Localhost and .local hosts are blocked.")

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        _block(safety, "Private, loopback, link-local, multicast, or reserved IPs are blocked.")


def _block(safety: BrowserSafetyReport, reason: str) -> None:
    safety.allowed = False
    safety.blocked_reason = reason
    raise JobCollectionError(reason)
