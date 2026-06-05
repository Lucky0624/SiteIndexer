"""
SiteIndexer — Local Web Backend
FastAPI app: serves the Astro static build and exposes the API.
"""
import asyncio
import json
import os
import sys
import time
import threading
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DATA_DIR = Path(os.environ.get("SMARTINDEX_DATA_DIR", Path(__file__).parent.parent.parent))
STATIC_DIR = Path(os.environ.get("SMARTINDEX_STATIC_DIR", Path(__file__).parent.parent / "frontend" / "dist"))

sys.path.insert(0, str(DATA_DIR))

from siteindexer.utils import (
    load_json, save_json_atomic, save_urls_to_file, normalize_config,
    migrate_urls, filter_urls, sync_urls, build_indexing_plan,
    update_quota_batch, get_quota_remaining, QUOTA_LIMIT,
    DEFAULT_SKIP_EXTENSIONS, GlobalTaskLock, sanitize_error_message,
    normalize_url_state, should_skip_google_submit, derive_index_status,
    is_google_submitted, is_manual_completed, is_gsc_seen, is_inspection_indexed,
)
from siteindexer.sitemaps import SitemapFetchError, fetch_urls_from_sitemap_recursive
from siteindexer.indexing import index_url
from siteindexer.searchconsole import fetch_indexed_pages, inspect_url
from siteindexer.constants import BATCH_SAVE_INTERVAL, MAX_RETRY, RETRY_DELAY_SECONDS, BING_INDEXNOW_BATCH_SIZE, HISTORY_MAX_RECORDS, INSPECTION_BATCH_SAVE_INTERVAL

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_config_lock = threading.Lock()
_history_lock = threading.Lock()
_task_locks: dict[str, GlobalTaskLock] = {}

def config_path() -> Path:
    return DATA_DIR / "config.json"

def history_path() -> Path:
    return DATA_DIR / "history.json"

def get_config() -> dict:
    with _config_lock:
        raw = load_json(str(config_path()))
        return normalize_config(raw) if raw else {"sites": []}


def save_config(config: dict) -> None:
    with _config_lock:
        save_json_atomic(config, str(config_path()))


def load_history() -> list:
    data = load_json(str(history_path()))
    return data if isinstance(data, list) else []


def save_history(history: list) -> None:
    with _history_lock:
        save_json_atomic(history[-HISTORY_MAX_RECORDS:], str(history_path()), indent=2)


def record_history(
    site_name: str,
    indexed: int,
    errors: int,
    duration_s: float,
    *,
    operation: str = "google_submit",
    details: Optional[list[dict]] = None,
    synced: int = 0,
    checked: int = 0,
    skipped: int = 0,
):
    with _history_lock:
        history = load_history()
        history.append({
            "id": datetime.now().strftime("%Y%m%d%H%M%S%f"),
            "site": site_name,
            "operation": operation,
            "date": str(date.today()),
            "time": datetime.now().strftime("%H:%M:%S"),
            "indexed": indexed,
            "synced": synced,
            "checked": checked,
            "skipped": skipped,
            "errors": errors,
            "duration_s": round(duration_s, 1),
            "details": details or [],
        })
        save_json_atomic(history[-HISTORY_MAX_RECORDS:], str(history_path()), indent=2)


def index_url_with_retry(url, creds_full, index, proxy=None):
    """Wrap index_url with automatic retry on transient network errors."""
    last_err = None
    for attempt in range(1, MAX_RETRY + 1):
        try:
            return index_url(url, creds_full, index, proxy=proxy)
        except Exception as e:
            last_err = e
            msg = str(e)
            # Don't retry on quota/permission errors
            if "429" in msg or "403" in msg or "quota" in msg.lower():
                raise
            if attempt < MAX_RETRY:
                time.sleep(RETRY_DELAY_SECONDS * attempt)
    raise last_err


def _is_transient_network_error(message: str) -> bool:
    lower = message.lower()
    transient_markers = (
        "10060",
        "timed out",
        "timeout",
        "connection timed out",
        "failed to establish a new connection",
        "servernotfounderror",
        "connection reset",
        "connection aborted",
        "unexpected_eof",
        "eof occurred",
        "temporarily unavailable",
    )
    return any(marker in lower for marker in transient_markers)


def inspect_url_with_retry(url, site_url, creds_full, proxy=None):
    """Wrap URL Inspection with retry for transient network/proxy failures."""
    last_err = None
    for attempt in range(1, MAX_RETRY + 1):
        try:
            return inspect_url(url, site_url, creds_full, proxy=proxy)
        except Exception as e:
            last_err = e
            msg = str(e)
            lower = msg.lower()
            if "400" in msg or "403" in msg or "429" in msg or "quota" in lower:
                raise
            if not _is_transient_network_error(msg):
                raise
            if attempt < MAX_RETRY:
                time.sleep(RETRY_DELAY_SECONDS * attempt)
    raise Exception(sanitize_error_message(f"URL Inspection 连接失败，已重试 {MAX_RETRY} 次: {last_err}"))


def get_site(name: str) -> dict:
    config = get_config()
    for site in config.get("sites", []):
        if site["name"] == name:
            return site
    raise HTTPException(status_code=404, detail=f"站点 '{name}' 不存在")


def _data_file_path(filename: str) -> Path:
    target = (DATA_DIR / filename).resolve()
    base = DATA_DIR.resolve()
    if not target.is_relative_to(base):
        raise HTTPException(status_code=400, detail="非法文件路径")
    return target


def urls_path(site: dict) -> Path:
    return _data_file_path(site["urls_file"])


def load_urls(site: dict) -> dict:
    return migrate_urls(load_json(str(urls_path(site))))


def creds_path(filename: str) -> Path:
    return _data_file_path(filename)


def _acquire_site_task(name: str) -> GlobalTaskLock:
    lock = _task_locks.setdefault(name, GlobalTaskLock())
    if not lock.acquire(name, blocking=False):
        raise HTTPException(status_code=409, detail="该站点已有任务正在运行")
    return lock


@contextmanager
def _locked_site_action(name: str):
    lock = _acquire_site_task(name)
    try:
        yield
    finally:
        lock.release()


def _safe_error(error: Exception) -> str:
    return sanitize_error_message(str(error))


def _inspection_error_message(error: Exception) -> str:
    msg = _safe_error(error)
    lower = msg.lower()
    if _is_transient_network_error(msg):
        hints = [
            "这是连接 Google URL Inspection API 时的网络超时，不代表这个页面本身未收录或页面有问题。",
            "请检查当前网络或代理节点是否能稳定访问 searchconsole.googleapis.com；如果站点配置了凭据专用代理，也要确认该代理仍可用。",
            "GSC 搜索表现同步和 URL Inspection 是不同接口；同步可用时，运行索引仍会走 GSC 快速校准，深度检测失败不会影响正常提交。",
        ]
        return f"{msg}\n\n" + "\n".join(hints)

    if "inspection api error" not in lower:
        return msg

    hints = [
        "深度检测调用的是 Google URL Inspection API，和 GSC 搜索表现同步不是同一个接口；GSC 同步可用不代表深度检测一定可用。",
        "请确认 Google Cloud 项目已启用 Search Console API，服务账户已加入对应 Search Console 属性，且被检测 URL 属于该 GSC 属性范围。",
    ]
    if "403" in msg:
        hints.append("如果是 403，通常是服务账户权限不足、属性不匹配，或 URL 不在当前 site_url 属性下。")
    if "400" in msg:
        hints.append("如果是 400，通常是 site_url 格式不正确，或 inspectionUrl 与 siteUrl 不匹配。")
    if "429" in msg or "quota" in lower:
        hints.append("如果是 429/配额错误，需要等待 URL Inspection API 配额恢复。")
    return f"{msg}\n\n" + "\n".join(hints)


def _google_done(data: dict) -> bool:
    return should_skip_google_submit(normalize_url_state(data))


def _refresh_url_state(entry: dict) -> dict:
    return normalize_url_state(entry)


def _mark_google_submitted(entry: dict, today: str) -> None:
    entry["google_submitted_at"] = today
    entry["indexed_at"] = today
    entry["completed_via"] = "google_api"
    _refresh_url_state(entry)


def _mark_manual_completed(entry: dict, today: str) -> None:
    entry["manual_completed_at"] = today
    entry["indexed_at"] = today
    entry["completed_via"] = "manual"
    _refresh_url_state(entry)


def _mark_gsc_seen(entry: dict, today: str) -> None:
    entry["gsc_seen_at"] = today
    entry["sc_synced_at"] = today
    if not is_inspection_indexed(entry):
        entry["completed_via"] = "gsc_performance"
    _refresh_url_state(entry)


def _reset_google_state(entry: dict) -> None:
    for key in (
        "indexed_at",
        "google_submitted_at",
        "manual_completed_at",
        "completed_via",
        "sc_synced_at",
        "gsc_seen_at",
        "category",
        "coverage_state",
        "status_category",
        "inspected_at",
        "inspection_indexed_at",
        "category_updated_at",
        "verdict",
        "last_crawl_time",
        "page_fetch_state",
        "robots_txt_state",
    ):
        entry.pop(key, None)
    entry["indexed"] = False
    entry["index_status"] = derive_index_status(entry)


def _sync_gsc_seen(site: dict, existing: dict, visible_urls, today: str) -> tuple[int, int, list[dict]]:
    creds_file = site["credentials"][0]
    cred_proxy = site.get("credential_proxies", {}).get(creds_file) or site.get("proxy") or get_config().get("proxy")
    gsc_pages = fetch_indexed_pages(site["site_url"], str(creds_path(creds_file)), proxy=cred_proxy)
    gsc_normalized = {u.rstrip("/"): u for u in gsc_pages}
    matched_urls = [url for url in visible_urls if url.rstrip("/") in gsc_normalized]
    history_details = []

    for url in matched_urls:
        _mark_gsc_seen(existing[url], today)
        history_details.append({
            "url": url,
            "action": "gsc_synced",
            "source": "search_analytics",
            "status": "seen_in_search_performance",
        })

    return len(matched_urls), len(gsc_pages), history_details


def _apply_inspection_result(existing: dict, url: str, result: dict, today: str) -> bool:
    entry = existing[url]
    entry["category"] = result.get("coverageState", "Unknown")
    entry["coverage_state"] = result.get("coverageState", "Unknown")
    entry["category_updated_at"] = today
    entry["verdict"] = result.get("verdict")
    entry["status_category"] = result.get("status_category", "unknown")
    entry["last_crawl_time"] = result.get("lastCrawlTime")
    entry["page_fetch_state"] = result.get("pageFetchState")
    entry["robots_txt_state"] = result.get("robotsTxtState")
    entry["inspected_at"] = today

    if result.get("is_indexed"):
        entry["inspection_indexed_at"] = today
        entry["completed_via"] = "inspection"
        _refresh_url_state(entry)
        return True
    _refresh_url_state(entry)
    return False


def quota_for_site(site: dict) -> list[dict]:
    result = []
    quota_data = load_json(str(DATA_DIR / "quota.json"))
    for creds_file in site.get("credentials", []):
        entry = quota_data.get(creds_file, {})
        used = entry.get("used", 0) if entry.get("date") == str(date.today()) else 0
        result.append({
            "credentials_file": creds_file,
            "credentials_name": creds_file.replace(".json", ""),
            "used": used,
            "limit": QUOTA_LIMIT,
            "remaining": max(0, QUOTA_LIMIT - used),
        })
    return result


def site_stats(site: dict) -> dict:
    stored_urls = load_urls(site)
    visible = filter_urls({url: data.get("lastmod") for url, data in stored_urls.items()}, site)
    urls = {url: stored_urls[url] for url in visible}
    total = len(urls)
    processed = sum(1 for u in urls.values() if _google_done(u))
    submitted = sum(1 for u in urls.values() if is_google_submitted(u) or is_manual_completed(u))
    gsc_seen = sum(1 for u in urls.values() if is_gsc_seen(u))
    inspected = sum(1 for u in urls.values() if u.get("inspected_at"))
    inspection_indexed = sum(1 for u in urls.values() if is_inspection_indexed(u))
    confirmed = sum(1 for u in urls.values() if is_gsc_seen(u) or is_inspection_indexed(u))
    crawled_not_indexed = sum(1 for u in urls.values() if u.get("status_category") == "crawled_not_indexed")
    pending_crawl = sum(1 for u in urls.values() if u.get("status_category") == "pending_crawl")
    blocked = sum(1 for u in urls.values() if u.get("status_category") == "blocked")
    pending = total - processed
    return {
        "name": site["name"],
        "sitemap_url": site["sitemap_url"],
        "site_url": site.get("site_url", ""),
        "track_lastmod": site.get("track_lastmod", False),
        "schedule_enabled": site.get("schedule_enabled", False),
        "schedule_hour": site.get("schedule_hour", 8),
        "skip_extensions": site.get("skip_extensions", DEFAULT_SKIP_EXTENSIONS),
        "exclude_patterns": site.get("exclude_patterns", []),
        "include_patterns": site.get("include_patterns", []),
        "credentials": site.get("credentials", []),
        "urls_total": total,
        "urls_indexed": processed,
        "urls_submit_done": processed,
        "urls_submitted": submitted,
        "urls_gsc_indexed": gsc_seen,
        "urls_gsc_seen": gsc_seen,
        "urls_inspection_indexed": inspection_indexed,
        "urls_index_confirmed": confirmed,
        "urls_pending": pending,
        "urls_inspected": inspected,
        "urls_crawled_not_indexed": crawled_not_indexed,
        "urls_pending_crawl": pending_crawl,
        "urls_blocked": blocked,
        "quota": quota_for_site(site),
        "credential_proxies": site.get("credential_proxies", {}),
    }


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="SiteIndexer Local")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:7842", "http://127.0.0.1:7842"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.get("/api/sites")
def list_sites():
    config = get_config()
    return [site_stats(s) for s in config.get("sites", [])]


@app.get("/api/sites/{name}/stats")
def get_site_stats(name: str):
    site = get_site(name)
    return site_stats(site)


# --- URL listing ---

def _get_category(url: str, site_url: str) -> str:
    try:
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        if not path:
            return "Home"
        parts = path.split("/")
        return parts[0]
    except Exception:
        return "Other"

@app.get("/api/sites/{name}/categories")
def get_categories(name: str):
    site = get_site(name)
    urls = load_urls(site)
    visible = filter_urls({url: data.get("lastmod") for url, data in urls.items()}, site)
    
    cats = set()
    site_url = site.get("site_url", "")
    for url in visible:
        cats.add(_get_category(url, site_url))
    
    # Sort categories, put Home first
    sorted_cats = sorted(list(cats))
    if "Home" in sorted_cats:
        sorted_cats.remove("Home")
        sorted_cats.insert(0, "Home")
    return {"categories": sorted_cats}


@app.get("/api/sites/{name}/urls")
def list_urls(
    name: str,
    filter: str = "all",
    page: int = 1,
    page_size: int = 100,
    search: str = "",
    category: str = "all",
    channel: str = "google",
):
    site = get_site(name)
    urls = load_urls(site)
    page = max(1, page)
    page_size = min(max(1, page_size), 500)

    # Apply site filters so excluded URLs are hidden from view
    # (they stay in storage to preserve their indexed state)
    visible = filter_urls({url: data.get("lastmod") for url, data in urls.items()}, site)
    
    site_url = site.get("site_url", "")

    items = []
    for url, data in urls.items():
        if url not in visible:
            continue
        data = _refresh_url_state(data)
        
        if category != "all" and _get_category(url, site_url) != category:
            continue
            
        processed = _google_done(data)
        channel_done = bool(data.get("bing_submitted")) if channel == "bing" else processed
        gsc_seen = is_gsc_seen(data)
        if filter == "pending" and channel_done:
            continue
        if filter == "indexed" and not channel_done:
            continue
        if filter == "gsc_indexed" and not gsc_seen:
            continue
        items.append({
            "url": url,
            "indexed": processed,
            "indexed_at": data.get("indexed_at"),
            "google_submitted": is_google_submitted(data),
            "google_submitted_at": data.get("google_submitted_at"),
            "manual_completed": is_manual_completed(data),
            "manual_completed_at": data.get("manual_completed_at"),
            "completed_via": data.get("completed_via"),
            "lastmod": data.get("lastmod"),
            "sc_synced_at": data.get("sc_synced_at"),
            "gsc_seen": is_gsc_seen(data),
            "gsc_seen_at": data.get("gsc_seen_at") or data.get("sc_synced_at"),
            "bing_submitted": data.get("bing_submitted"),
            "priority": data.get("priority", "normal"),
            "category": data.get("category") or _get_category(url, site_url),
            "category_updated_at": data.get("category_updated_at"),
            "verdict": data.get("verdict"),
            "status_category": data.get("status_category"),
            "index_status": data.get("index_status") or derive_index_status(data),
            "inspection_indexed": is_inspection_indexed(data),
            "inspection_indexed_at": data.get("inspection_indexed_at"),
            "last_crawl_time": data.get("last_crawl_time"),
            "page_fetch_state": data.get("page_fetch_state"),
            "robots_txt_state": data.get("robots_txt_state"),
            "inspected_at": data.get("inspected_at"),
            "coverage_state": data.get("coverage_state") or data.get("category"),
        })

    if search:
        items = [i for i in items if search.lower() in i["url"].lower()]

    # Sort: high priority first, then normal, then low
    priority_order = {"high": 0, "normal": 1, "low": 2}
    items.sort(key=lambda x: (priority_order.get(x["priority"], 1), x["url"]))

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    return {"data": items[start:end], "total": total, "page": page, "page_size": page_size}


# --- Site CRUD ---

class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
    sitemap_url: str
    site_url: str = ""
    track_lastmod: bool = False
    credentials: list[str] = Field(default_factory=list)
    credential_proxies: dict[str, str] = Field(default_factory=dict)
    skip_extensions: list[str] = Field(default_factory=lambda: list(DEFAULT_SKIP_EXTENSIONS))
    exclude_patterns: list[str] = Field(default_factory=list)
    include_patterns: list[str] = Field(default_factory=list)


@app.post("/api/sites")
def create_site(body: SiteCreate):
    config = get_config()
    names = [s["name"] for s in config.get("sites", [])]
    if body.name in names:
        raise HTTPException(status_code=409, detail="站点名称已存在")

    site = {
        "name": body.name,
        "sitemap_url": body.sitemap_url,
        "site_url": body.site_url,
        "track_lastmod": body.track_lastmod,
        "credentials": body.credentials,
        "credential_proxies": body.credential_proxies,
        "urls_file": f"urls_{body.name}.json",
        "skip_extensions": body.skip_extensions,
        "exclude_patterns": body.exclude_patterns,
        "include_patterns": body.include_patterns,
    }
    config.setdefault("sites", []).append(site)
    save_config(config)
    return site_stats(site)


class SiteUpdate(BaseModel):
    sitemap_url: Optional[str] = None
    site_url: Optional[str] = None
    track_lastmod: Optional[bool] = None
    credentials: Optional[list[str]] = None
    credential_proxies: Optional[dict[str, str]] = None
    skip_extensions: Optional[list[str]] = None
    exclude_patterns: Optional[list[str]] = None
    include_patterns: Optional[list[str]] = None


@app.put("/api/sites/{name}")
def update_site(name: str, body: SiteUpdate):
    with _locked_site_action(name):
        config = get_config()
        for site in config.get("sites", []):
            if site["name"] == name:
                for field, val in body.model_dump(exclude_none=True).items():
                    site[field] = val
                save_config(config)
                return site_stats(site)
    raise HTTPException(status_code=404, detail="站点不存在")


@app.delete("/api/sites/{name}")
def delete_site(name: str):
    get_site(name)
    with _locked_site_action(name):
        config = get_config()
        sites = config.get("sites", [])
        config["sites"] = [s for s in sites if s["name"] != name]
        save_config(config)
    return {"ok": True}


# --- Actions ---

@app.post("/api/sites/{name}/fetch-urls")
def fetch_urls(name: str):
    site = get_site(name)
    with _locked_site_action(name):
        proxy = get_config().get("proxy")
        site_proxy = site.get("proxy", proxy)
        try:
            raw = fetch_urls_from_sitemap_recursive(site["sitemap_url"], proxy=site_proxy)
        except SitemapFetchError as e:
            raise HTTPException(status_code=502, detail=_safe_error(e))
        filtered = filter_urls(raw, site)
        existing = load_urls(site)

        result = sync_urls(existing, filtered, raw, site)
        save_urls_to_file(existing, str(urls_path(site)))
        return {
            "found": len(filtered),
            "added": result["new_count"],
            "removed": result["del_count"],
            "reset": result["reset_count"],
        }


@app.post("/api/sites/{name}/mark-indexed")
def mark_indexed(name: str, body: dict):
    site = get_site(name)
    urls_list = body.get("urls", [])
    with _locked_site_action(name):
        existing = load_urls(site)
        today = str(date.today())
        for url in urls_list:
            if url in existing:
                _mark_manual_completed(existing[url], today)
        save_urls_to_file(existing, str(urls_path(site)))
    return {"ok": True}


@app.post("/api/sites/{name}/reset")
def reset_urls(name: str, body: dict):
    site = get_site(name)
    urls_list = body.get("urls", [])  # empty = reset all
    with _locked_site_action(name):
        existing = load_urls(site)
        targets = urls_list if urls_list else list(existing.keys())
        for url in targets:
            if url in existing:
                _reset_google_state(existing[url])
        save_urls_to_file(existing, str(urls_path(site)))
    return {"ok": True}


# --- SSE: Run Selected URLs ---

@app.post("/api/sites/{name}/run/selected/stream")
def run_selected_stream(name: str, body: dict):
    site = get_site(name)
    urls_to_index = body.get("urls", [])
    if not urls_to_index:
        raise HTTPException(status_code=400, detail="未提供 URL")
    lock = _acquire_site_task(name)

    def generate():
        def send(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        yield send({"type": "connected"})

        try:
            existing = load_urls(site)
            today = str(date.today())
            history_details = []

            plan = build_indexing_plan(site["credentials"])
            total_capacity = sum(cap for _, cap in plan)
            visible = filter_urls({url: data.get("lastmod") for url, data in existing.items()}, site)
            pending_urls = [u for u in urls_to_index if u in visible and not _google_done(existing[u])][:total_capacity]

            yield send({"type": "plan", "pending": len(pending_urls), "capacity": total_capacity})

            if not plan or not pending_urls:
                yield send({"type": "done", "indexed": 0, "pending": len(pending_urls)})
                return

            global_i = 0
            url_cursor = 0
            run_start = time.time()

            for creds_file, capacity in plan:
                batch = pending_urls[url_cursor: url_cursor + capacity]
                if not batch:
                    break
                creds_full = str(creds_path(creds_file))
                batch_indexed = 0

                for url in batch:
                    try:
                        cred_proxy = site.get("credential_proxies", {}).get(creds_file) or site.get("proxy") or get_config().get("proxy")
                        index_url(url, creds_full, global_i + 1, proxy=cred_proxy)
                        _mark_google_submitted(existing[url], today)
                        history_details.append({
                            "url": url,
                            "action": "submitted",
                            "source": "google_api",
                            "status": "submitted",
                        })
                        global_i += 1
                        batch_indexed += 1
                        save_urls_to_file(existing, str(urls_path(site)))
                        update_quota_batch(creds_file, 1)
                        yield send({
                            "type": "indexed",
                            "url": url,
                            "done": global_i,
                            "total": len(pending_urls),
                            "google_submitted_at": today,
                            "index_status": existing[url].get("index_status"),
                            "completed_via": existing[url].get("completed_via"),
                        })
                    except Exception as e:
                        msg = str(e)
                        if "429" in msg or "quota" in msg.lower():
                            yield send({"type": "quota_exhausted", "message": f"{creds_file} 配额已用尽"})
                            break
                        elif "403" in msg:
                            yield send({"type": "error", "message": f"权限被拒绝 (403) - 凭据 {creds_file} 未被添加为 Search Console 的【拥有者(Owner)】。将跳过此凭据尝试下一个。"})
                            break
                        elif "UNEXPECTED_EOF_WHILE_READING" in msg or "EOF occurred" in msg:
                            yield send({"type": "error", "message": f"网络连接意外中断 (SSL EOF) - 请检查代理节点是否稳定。当前代理: {'已配置' if cred_proxy else '无'}"})
                            return
                        elif "ServerNotFoundError" in msg or "Failed to establish a new connection" in msg:
                            yield send({"type": "error", "message": f"无法连接到 Google 服务器 - 请检查网络或代理设置。当前代理: {'已配置' if cred_proxy else '无'}"})
                            return
                        else:
                            yield send({"type": "error", "message": f"提交出错: {_safe_error(e)}"})
                            return

                url_cursor += batch_indexed

            record_history(
                name,
                global_i,
                0,
                time.time() - run_start,
                operation="selected_submit",
                details=history_details,
            )
            yield send({"type": "done", "indexed": global_i, "pending": len(pending_urls) - global_i})

        except Exception as e:
            yield send({"type": "error", "message": _safe_error(e)})
        finally:
            lock.release()

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# --- SSE: Run Indexing ---

@app.get("/api/sites/{name}/run/stream")
def run_stream(name: str):
    site = get_site(name)
    lock = _acquire_site_task(name)

    def generate():
        def send(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        try:
            yield send({"type": "connected"})
            today = str(date.today())

            yield send({"type": "status", "message": "正在获取 sitemap..."})
            raw = fetch_urls_from_sitemap_recursive(site["sitemap_url"], proxy=site.get("proxy"))
            filtered = filter_urls(raw, site)
            yield send({"type": "urls_found", "count": len(filtered)})

            existing = load_urls(site)
            sync_urls(existing, filtered, raw, site)
            save_urls_to_file(existing, str(urls_path(site)))

            global_i = 0
            error_count = 0
            run_start = time.time()
            history_details = []
            gsc_synced = 0
            checked_count = 0

            if site.get("site_url") and site.get("credentials"):
                yield send({"type": "gsc_sync_start"})
                try:
                    gsc_synced, gsc_total, _gsc_details = _sync_gsc_seen(site, existing, filtered, today)
                    if gsc_synced > 0:
                        save_urls_to_file(existing, str(urls_path(site)))
                    yield send({"type": "gsc_sync_done", "synced": gsc_synced, "total": gsc_total})
                except Exception as e:
                    yield send({
                        "type": "gsc_sync_warning",
                        "message": f"GSC 同步不可用，已继续使用本地状态提交: {_safe_error(e)}",
                    })

            # Build plan
            plan = build_indexing_plan(site["credentials"])
            pending_urls = [u for u in filtered if not _google_done(existing[u])]
            total_capacity = sum(cap for _, cap in plan)
            skipped_indexed = max(0, len(filtered) - len(pending_urls))

            yield send({
                "type": "state_plan",
                "total": len(filtered),
                "skipped": skipped_indexed,
                "pending": len(pending_urls),
                "gsc_synced": gsc_synced,
            })
            yield send({"type": "plan", "pending": len(pending_urls), "capacity": total_capacity})

            if not plan:
                yield send({"type": "done", "indexed": 0, "pending": len(pending_urls)})
                return

            # Sort pending URLs by priority (high first)
            def url_priority(u):
                p = existing.get(u, {}).get("priority", "normal")
                return {"high": 0, "normal": 1, "low": 2}.get(p, 1)
            pending_urls.sort(key=url_priority)

            total_to_index = min(len(pending_urls), total_capacity)

            for creds_file, capacity in plan:
                if not pending_urls:
                    break
                batch = pending_urls[:capacity]
                pending_urls = pending_urls[capacity:]
                creds_full = str(creds_path(creds_file))

                batch_indexed = 0
                unsaved_count = 0

                for url in batch:
                    try:
                        cred_proxy = site.get("credential_proxies", {}).get(creds_file) or site.get("proxy") or get_config().get("proxy")
                        index_url_with_retry(url, creds_full, global_i + 1, proxy=cred_proxy)
                        _mark_google_submitted(existing[url], today)
                        history_details.append({
                            "url": url,
                            "action": "submitted",
                            "source": "google_api",
                            "status": "submitted",
                        })
                        global_i += 1
                        batch_indexed += 1
                        unsaved_count += 1
                        update_quota_batch(creds_file, 1)
                        # Batch save: write to disk every BATCH_SAVE_INTERVAL URLs
                        if unsaved_count >= BATCH_SAVE_INTERVAL:
                            save_urls_to_file(existing, str(urls_path(site)))
                            unsaved_count = 0
                        yield send({
                            "type": "indexed",
                            "url": url,
                            "done": global_i,
                            "total": total_to_index,
                            "google_submitted_at": today,
                            "index_status": existing[url].get("index_status"),
                            "completed_via": existing[url].get("completed_via"),
                        })
                    except Exception as e:
                        msg = str(e)
                        error_count += 1
                        if "429" in msg or "quota" in msg.lower():
                            yield send({"type": "quota_exhausted", "message": f"{creds_file} 配额已用尽"})
                            pending_urls = batch[batch_indexed:] + pending_urls
                            break
                        elif "403" in msg:
                            yield send({"type": "error", "message": f"权限被拒绝 (403) - 凭据 {creds_file} 未被添加为 Search Console 的【拥有者(Owner)】。将跳过此凭据尝试下一个。"})
                            pending_urls = batch[batch_indexed:] + pending_urls
                            break
                        elif "UNEXPECTED_EOF_WHILE_READING" in msg or "EOF occurred" in msg:
                            yield send({"type": "error", "message": f"网络连接意外中断 (SSL EOF) - 请检查代理节点是否稳定。当前代理: {'已配置' if cred_proxy else '无'}"})
                            save_urls_to_file(existing, str(urls_path(site)))
                            record_history(name, global_i, error_count, time.time() - run_start, details=history_details, synced=gsc_synced, checked=checked_count, skipped=skipped_indexed)
                            return
                        elif "ServerNotFoundError" in msg or "Failed to establish a new connection" in msg:
                            yield send({"type": "error", "message": f"无法连接到 Google 服务器 - 请检查网络或代理设置。当前代理: {'已配置' if cred_proxy else '无'}"})
                            save_urls_to_file(existing, str(urls_path(site)))
                            record_history(name, global_i, error_count, time.time() - run_start, details=history_details, synced=gsc_synced, checked=checked_count, skipped=skipped_indexed)
                            return
                        else:
                            yield send({"type": "error", "message": f"提交出错: {_safe_error(e)}"})
                            save_urls_to_file(existing, str(urls_path(site)))
                            history_details.append({
                                "url": url,
                                "action": "error",
                                "source": "google_api",
                                "status": "error",
                                "detail": _safe_error(e),
                            })
                            record_history(name, global_i, error_count, time.time() - run_start, details=history_details, synced=gsc_synced, checked=checked_count, skipped=skipped_indexed)
                            return

                # Flush remaining unsaved at end of each credential batch
                if unsaved_count > 0:
                    save_urls_to_file(existing, str(urls_path(site)))

            final_pending = sum(1 for u in filtered if not _google_done(existing[u]))
            record_history(name, global_i, error_count, time.time() - run_start, details=history_details, synced=gsc_synced, checked=checked_count, skipped=skipped_indexed)
            yield send({"type": "done", "indexed": global_i, "pending": final_pending})

        except Exception as e:
            yield send({"type": "error", "message": _safe_error(e)})
        finally:
            lock.release()

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# --- SSE: Sync GSC ---

@app.get("/api/sites/{name}/sync-gsc/stream")
def sync_gsc_stream(name: str):
    site = get_site(name)
    lock = _acquire_site_task(name)

    def generate():
        def send(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        try:
            run_start = time.time()
            if not site.get("site_url"):
                yield send({"type": "error", "message": "此站点未配置 Google Search Console 属性。"})
                return
            if not site.get("credentials"):
                yield send({"type": "error", "message": "此站点未配置凭据。"})
                return

            yield send({"type": "status", "message": "正在连接到 Google Search Console..."})
            existing = load_urls(site)
            visible = filter_urls({url: data.get("lastmod") for url, data in existing.items()}, site)
            today = str(date.today())
            synced, gsc_total, history_details = _sync_gsc_seen(site, existing, visible, today)
            yield send({"type": "status", "message": f"在 GSC 搜索表现中找到 {gsc_total} 个页面。"})
            yield send({"type": "gsc_plan", "matched": synced, "total": gsc_total})
            for synced_i, detail in enumerate(history_details, start=1):
                url = detail["url"]
                yield send({
                    "type": "gsc_synced",
                    "url": url,
                    "done": synced_i,
                    "total": synced,
                    "sc_synced_at": today,
                    "gsc_seen_at": today,
                    "indexed": existing[url].get("indexed", False),
                    "index_status": existing[url].get("index_status"),
                    "completed_via": existing[url].get("completed_via"),
                })

            save_urls_to_file(existing, str(urls_path(site)))
            record_history(
                name,
                0,
                0,
                time.time() - run_start,
                operation="gsc_sync",
                details=history_details,
                synced=synced,
            )
            yield send({"type": "done", "synced": synced, "total": gsc_total})
        except Exception as e:
            yield send({"type": "error", "message": _safe_error(e)})
        finally:
            lock.release()

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# --- SSE: Inspect URLs ---

class InspectRequest(BaseModel):
    urls: list[str]

@app.post("/api/sites/{name}/inspect/stream")
def inspect_stream(name: str, body: InspectRequest):
    site = get_site(name)
    urls_to_inspect = body.urls
    lock = _acquire_site_task(name)

    def generate():
        def send(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        try:
            run_start = time.time()
            if not site.get("site_url"):
                yield send({"type": "error", "message": "此站点未配置 Google Search Console 属性。"})
                return
            if not site.get("credentials"):
                yield send({"type": "error", "message": "此站点未配置凭据。"})
                return

            yield send({"type": "status", "message": f"正在从 Google 获取 {len(urls_to_inspect)} 个 URL 的详细状态..."})

            existing = load_urls(site)
            today = str(date.today())
            creds_file = site["credentials"][0]
            creds_full = str(creds_path(creds_file))
            
            count = 0
            indexed_count = 0
            error_count = 0
            unsaved_count = 0
            history_details = []
            for url in urls_to_inspect:
                if url not in existing:
                    continue
                
                cred_proxy = site.get("credential_proxies", {}).get(creds_file) or site.get("proxy") or get_config().get("proxy")
                try:
                    res = inspect_url_with_retry(url, site["site_url"], creds_full, proxy=cred_proxy)
                except Exception as e:
                    error_count += 1
                    history_details.append({
                        "url": url,
                        "action": "error",
                        "source": "inspection",
                        "status": "error",
                        "detail": _inspection_error_message(e),
                    })
                    yield send({"type": "error", "message": f"检测 {url} 出错: {_inspection_error_message(e)}"})
                    break
                
                is_indexed = _apply_inspection_result(existing, url, res, today)
                if is_indexed:
                    indexed_count += 1
                history_details.append({
                    "url": url,
                    "action": "inspection_indexed" if is_indexed else "inspection_checked",
                    "source": "inspection",
                    "status": res.get("status_category", "unknown"),
                    "detail": res.get("coverageState", "Unknown"),
                })
                
                count += 1
                unsaved_count += 1
                if unsaved_count >= INSPECTION_BATCH_SAVE_INTERVAL:
                    save_urls_to_file(existing, str(urls_path(site)))
                    unsaved_count = 0
                yield send({
                    "type": "inspected",
                    "url": url,
                    "category": res.get("coverageState", "Unknown"),
                    "verdict": res.get("verdict"),
                    "status_category": res.get("status_category", "unknown"),
                    "last_crawl_time": res.get("lastCrawlTime"),
                    "page_fetch_state": res.get("pageFetchState"),
                    "robots_txt_state": res.get("robotsTxtState"),
                    "is_indexed": res.get("is_indexed", False),
                    "indexed": existing[url].get("indexed", False),
                    "index_status": existing[url].get("index_status"),
                    "inspection_indexed_at": existing[url].get("inspection_indexed_at"),
                    "completed_via": existing[url].get("completed_via"),
                    "done": count,
                    "total": len(urls_to_inspect),
                })
            
            if unsaved_count > 0:
                save_urls_to_file(existing, str(urls_path(site)))
            record_history(
                name,
                0,
                error_count,
                time.time() - run_start,
                operation="inspection",
                details=history_details,
                checked=count,
                skipped=indexed_count,
            )
            yield send({"type": "done", "count": count, "indexed": indexed_count})
        except Exception as e:
            yield send({"type": "error", "message": _inspection_error_message(e)})
        finally:
            lock.release()

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/sites/{name}/inspect-pending/stream")
def inspect_pending_stream(name: str):
    site = get_site(name)
    lock = _acquire_site_task(name)

    def generate():
        def send(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        try:
            run_start = time.time()
            if not site.get("site_url"):
                yield send({"type": "error", "message": "此站点未配置 Google Search Console 属性。"})
                return
            if not site.get("credentials"):
                yield send({"type": "error", "message": "此站点未配置凭据。"})
                return

            existing = load_urls(site)
            visible = filter_urls({url: data.get("lastmod") for url, data in existing.items()}, site)
            pending_urls = [url for url in visible if not _google_done(existing[url])]

            if not pending_urls:
                yield send({"type": "done", "count": 0, "indexed": 0, "message": "没有待检测的 URL。"})
                return

            yield send({"type": "status", "message": f"正在检测 {len(pending_urls)} 个待处理 URL 的索引状态..."})

            today = str(date.today())
            creds_file = site["credentials"][0]
            creds_full = str(creds_path(creds_file))
            cred_proxy = site.get("credential_proxies", {}).get(creds_file) or site.get("proxy") or get_config().get("proxy")

            count = 0
            indexed_count = 0
            error_count = 0
            unsaved_count = 0
            history_details = []

            for url in pending_urls:
                try:
                    res = inspect_url_with_retry(url, site["site_url"], creds_full, proxy=cred_proxy)

                    is_indexed = _apply_inspection_result(existing, url, res, today)
                    if is_indexed:
                        indexed_count += 1
                    history_details.append({
                        "url": url,
                        "action": "inspection_indexed" if is_indexed else "inspection_checked",
                        "source": "inspection",
                        "status": res.get("status_category", "unknown"),
                        "detail": res.get("coverageState", "Unknown"),
                    })

                    count += 1
                    unsaved_count += 1
                    if unsaved_count >= INSPECTION_BATCH_SAVE_INTERVAL:
                        save_urls_to_file(existing, str(urls_path(site)))
                        unsaved_count = 0

                    yield send({
                        "type": "inspected",
                        "url": url,
                        "category": res.get("coverageState", "Unknown"),
                        "verdict": res.get("verdict"),
                        "status_category": res.get("status_category", "unknown"),
                        "is_indexed": res.get("is_indexed", False),
                        "indexed": existing[url].get("indexed", False),
                        "index_status": existing[url].get("index_status"),
                        "inspection_indexed_at": existing[url].get("inspection_indexed_at"),
                        "completed_via": existing[url].get("completed_via"),
                        "done": count,
                        "total": len(pending_urls),
                    })
                except Exception as e:
                    msg = str(e)
                    error_count += 1
                    history_details.append({
                        "url": url,
                        "action": "error",
                        "source": "inspection",
                        "status": "error",
                        "detail": _inspection_error_message(e),
                    })
                    if "429" in msg or "quota" in msg.lower():
                        yield send({"type": "error", "message": f"API 配额已用尽，已检测 {count} 个 URL。"})
                        break
                    yield send({"type": "error", "message": f"检测 {url} 出错: {_inspection_error_message(e)}"})
                    break

            if unsaved_count > 0:
                save_urls_to_file(existing, str(urls_path(site)))

            record_history(
                name,
                0,
                error_count,
                time.time() - run_start,
                operation="inspection_pending",
                details=history_details,
                checked=count,
                skipped=indexed_count,
            )
            yield send({"type": "done", "count": count, "indexed": indexed_count})
        except Exception as e:
            yield send({"type": "error", "message": _inspection_error_message(e)})
        finally:
            lock.release()

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# --- Credentials ---

@app.get("/api/credentials")
def list_credentials():
    """List all .json files in DATA_DIR that look like service account credentials."""
    creds = []
    for f in DATA_DIR.iterdir():
        if f.suffix == ".json" and f.name not in ("config.json", "quota.json"):
            try:
                data = json.loads(f.read_text())
                if "type" in data and data.get("type") == "service_account":
                    creds.append({
                        "filename": f.name,
                        "client_email": data.get("client_email", ""),
                        "project_id": data.get("project_id", ""),
                    })
            except Exception:
                pass
    return creds


@app.post("/api/credentials/upload")
async def upload_credential(file: UploadFile = File(...)):
    safe_name = _safe_creds_filename(file.filename or "")
    content = await file.read()
    try:
        data = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="无效的 JSON 文件")
    if data.get("type") != "service_account":
        raise HTTPException(status_code=400, detail="不是有效的 Google 服务账户 JSON")

    dest = creds_path(safe_name)
    if dest.exists():
        raise HTTPException(status_code=409, detail="同名凭据已存在，请先删除旧文件或重命名后上传")
    dest.write_bytes(content)
    return {
        "filename": safe_name,
        "client_email": data.get("client_email", ""),
        "project_id": data.get("project_id", ""),
    }


def _safe_creds_filename(filename: str) -> str:
    """Validate and sanitize a credentials filename to prevent path traversal."""
    if not filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    if "\\" in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="文件名不能包含路径分隔符")
    if filename in ("config.json", "quota.json", "history.json") or filename.startswith("urls_"):
        raise HTTPException(status_code=400, detail="不能操作系统配置文件")
    if not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="只支持 .json 文件")
    return filename


@app.delete("/api/credentials/{filename}")
def delete_credential(filename: str):
    filename = _safe_creds_filename(filename)
    used_by = [
        site["name"]
        for site in get_config().get("sites", [])
        if filename in site.get("credentials", [])
    ]
    if used_by:
        raise HTTPException(status_code=409, detail=f"凭据仍被站点使用: {', '.join(used_by)}")
    target = creds_path(filename)
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    target.unlink()
    return {"ok": True}


# --- History ---

@app.get("/api/history")
def get_history(site: str = "", limit: int = 50):
    history = load_history()
    if site:
        history = [h for h in history if h.get("site") == site]
    return history[-limit:]


@app.delete("/api/history")
def clear_history():
    save_history([])
    return {"ok": True}


# --- URL Priority ---

class PriorityUpdate(BaseModel):
    urls: list[str]
    priority: str  # "high" | "normal" | "low"

@app.post("/api/sites/{name}/set-priority")
def set_url_priority(name: str, body: PriorityUpdate):
    site = get_site(name)
    if body.priority not in {"high", "normal", "low"}:
        raise HTTPException(status_code=400, detail="无效的优先级")
    with _locked_site_action(name):
        existing = load_urls(site)
        updated = 0
        for url in body.urls:
            if url in existing:
                existing[url]["priority"] = body.priority
                updated += 1
        save_urls_to_file(existing, str(urls_path(site)))
    return {"updated": updated}


# --- Bing IndexNow ---

INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow"

class IndexNowConfig(BaseModel):
    key: str = ""
    keyLocation: str = ""

@app.get("/api/indexnow/config")
def get_indexnow_config():
    config = get_config()
    return {
        "key": config.get("indexnow_key", ""),
        "keyLocation": config.get("indexnow_keyLocation", "")
    }

@app.post("/api/indexnow/config")
def save_indexnow_config(body: IndexNowConfig):
    config = get_config()
    config["indexnow_key"] = body.key
    config["indexnow_keyLocation"] = body.keyLocation
    save_config(config)
    return {"ok": True}

@app.get("/api/sites/{name}/submit-bing/stream")
def submit_bing_stream(name: str):
    site = get_site(name)
    config = get_config()
    api_key = config.get("indexnow_key", "")
    lock = _task_locks.setdefault(name, GlobalTaskLock())
    if not lock.acquire(name, blocking=False):
        raise HTTPException(status_code=409, detail="该站点已有任务正在运行")

    def generate():
        import requests as http_requests
        def send(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        try:
            if not api_key:
                yield send({"type": "error", "message": "未配置 IndexNow API Key，请先在设置中填写。"})
                return

            yield send({"type": "status", "message": "正在准备提交到 Bing IndexNow..."})

            existing = load_urls(site)
            visible = filter_urls({url: data.get("lastmod") for url, data in existing.items()}, site)
            pending_urls = [u for u in visible if not existing.get(u, {}).get("bing_submitted")]

            if not pending_urls:
                yield send({"type": "done", "submitted": 0, "message": "所有 URL 均已提交过 Bing。"})
                return

            yield send({"type": "status", "message": f"共 {len(pending_urls)} 个 URL 待提交到 Bing"})
            total_submitted = 0

            urls_by_host: dict[str, list[str]] = {}
            for url in pending_urls:
                host = urlparse(url).netloc
                if not host:
                    yield send({"type": "error", "message": f"无效 URL，无法提交到 Bing: {url}"})
                    return
                urls_by_host.setdefault(host, []).append(url)

            for host, host_urls in urls_by_host.items():
                for i in range(0, len(host_urls), BING_INDEXNOW_BATCH_SIZE):
                    batch = host_urls[i:i + BING_INDEXNOW_BATCH_SIZE]
                    try:
                        payload = {
                            "host": host,
                            "key": api_key,
                            "urlList": batch,
                        }
                        key_location = config.get("indexnow_keyLocation", "")
                        if key_location:
                            payload["keyLocation"] = key_location
                        resp = http_requests.post(
                            INDEXNOW_ENDPOINT,
                            json=payload,
                            headers={"Content-Type": "application/json"},
                            timeout=30,
                        )
                        if resp.status_code not in (200, 202):
                            yield send({"type": "error", "message": f"Bing 返回状态码 {resp.status_code}: {resp.text[:200]}"})
                            return
                        for url in batch:
                            existing[url]["bing_submitted"] = str(date.today())
                        total_submitted += len(batch)
                        save_urls_to_file(existing, str(urls_path(site)))
                        yield send({"type": "progress", "submitted": total_submitted, "total": len(pending_urls)})
                    except Exception as e:
                        yield send({"type": "error", "message": f"提交到 Bing 出错: {_safe_error(e)}"})
                        return

            yield send({"type": "done", "submitted": total_submitted, "message": f"成功提交 {total_submitted} 个 URL 到 Bing"})
        finally:
            lock.release()

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ---------------------------------------------------------------------------
# Serve Astro static build (must be last)
# ---------------------------------------------------------------------------

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    @app.get("/")
    def no_frontend():
        return JSONResponse(
            {"error": "Frontend not built. Run: cd web_local/frontend && npm run build"},
            status_code=503,
        )
