import json
import logging
import logging.config
import os
import re
import shutil
import tempfile
import threading
from datetime import date

from siteindexer.constants import QUOTA_LIMIT


def parse_proxy_info(proxy):
    """将代理 URL 字符串解析为 httplib2.ProxyInfo。

    支持 http://、https://、socks5://，可选 user:pass@host:port 格式。
    如果 proxy 为空则返回 None。
    被 indexing.py 和 searchconsole.py 共用，避免重复解析逻辑。
    """
    if not proxy:
        return None

    import httplib2
    try:
        import socks
    except ImportError:
        import http.client
        clean = proxy.replace("http://", "").replace("https://", "")
        host, port = clean.split(":")
        return httplib2.ProxyInfo(
            proxy_type=3,
            proxy_host=host,
            proxy_port=int(port),
        )

    proxy_type = socks.PROXY_TYPE_HTTP
    if proxy.startswith("socks5"):
        proxy_type = socks.PROXY_TYPE_SOCKS5

    clean_proxy = proxy.replace("http://", "").replace("https://", "").replace("socks5://", "")
    if "@" in clean_proxy:
        auth, host_port = clean_proxy.split("@")
        username, password = auth.split(":")
        host, port = host_port.split(":")
    else:
        host, port = clean_proxy.split(":")
        username, password = None, None

    return httplib2.ProxyInfo(
        proxy_type=proxy_type,
        proxy_host=host,
        proxy_port=int(port),
        proxy_user=username,
        proxy_pass=password,
    )


_file_locks: dict[str, threading.Lock] = {}
_file_locks_lock = threading.Lock()


def _get_file_lock(file_path: str) -> threading.Lock:
    with _file_locks_lock:
        if file_path not in _file_locks:
            _file_locks[file_path] = threading.Lock()
        return _file_locks[file_path]


def load_json(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    except FileNotFoundError:
        return {}


def backup_file(file_path: str, max_backups: int = 3) -> None:
    """保存前自动备份文件，保留最多 max_backups 份历史副本。

    备份命名格式：原文件名.1, 原文件名.2, ...（数字越大越旧）
    """
    if not os.path.exists(file_path):
        return

    for i in range(max_backups, 1, -1):
        older = f"{file_path}.{i}"
        newer = f"{file_path}.{i - 1}"
        if os.path.exists(newer):
            shutil.move(newer, older)

    shutil.copy2(file_path, f"{file_path}.1")


def _write_json_atomic(data, file_path: str, indent: int = 4) -> None:
    """Write JSON through a same-directory temporary file and atomic replace."""
    directory = os.path.dirname(os.path.abspath(file_path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=directory,
        prefix=f".{os.path.basename(file_path)}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(data, file, indent=indent, ensure_ascii=False)
            file.flush()
            os.fsync(file.fileno())
        os.replace(tmp_path, file_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def save_json_atomic(data, file_path: str, indent: int = 4, backup: bool = False) -> None:
    lock = _get_file_lock(file_path)
    with lock:
        if backup:
            backup_file(file_path)
        _write_json_atomic(data, file_path, indent=indent)


def save_urls_to_file(urls, file_path):
    save_json_atomic(urls, file_path, backup=True)


def create_logger() -> logging.Logger:
    logger = logging.getLogger("siteindexer")
    if os.path.exists("logging.conf"):
        logging.config.fileConfig("logging.conf")
    else:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return logger


APP_LOGGER = create_logger()


DEFAULT_SKIP_EXTENSIONS = [
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
    ".pdf", ".mp4", ".zip",
]


def normalize_config(config):
    """将配置规范化为多站点格式，为每个站点填充默认值。"""
    proxy = config.get("proxy", "")

    if "sitemap_url" in config:
        config = {
            "proxy": proxy,
            "sites": [
                {
                    "name": "default",
                    "sitemap_url": config["sitemap_url"],
                    "credentials": config.get("credentials", "credentials.json"),
                    "urls_file": config.get("urls_file", "urls.json"),
                }
            ]
        }

    config["proxy"] = proxy

    for site in config.get("sites", []):
        creds = site.get("credentials", "credentials.json")
        if isinstance(creds, str):
            creds = [creds]
        site["credentials"] = creds
        site.setdefault("urls_file", f"urls_{site['name']}.json")
        site.setdefault("track_lastmod", False)
        site.setdefault("skip_extensions", DEFAULT_SKIP_EXTENSIONS)
        site.setdefault("exclude_patterns", [])
        site.setdefault("include_patterns", [])
        site.setdefault("site_url", "")
        site.setdefault("proxy", proxy)

    return config


def _first_value(*values):
    for value in values:
        if value:
            return value
    return None


def is_google_submitted(entry: dict) -> bool:
    return bool(entry.get("google_submitted_at")) or entry.get("completed_via") == "google_api"


def is_manual_completed(entry: dict) -> bool:
    return bool(entry.get("manual_completed_at")) or entry.get("completed_via") == "manual"


def is_gsc_seen(entry: dict) -> bool:
    return bool(entry.get("gsc_seen_at") or entry.get("sc_synced_at"))


def is_inspection_indexed(entry: dict) -> bool:
    return bool(entry.get("inspection_indexed_at")) or entry.get("status_category") == "indexed"


def should_skip_google_submit(entry: dict) -> bool:
    if is_google_submitted(entry) or is_manual_completed(entry) or is_gsc_seen(entry) or is_inspection_indexed(entry):
        return True

    # Legacy data only had indexed=true after successful Google submission.
    return bool(entry.get("indexed"))


def derive_index_status(entry: dict) -> str:
    status_category = entry.get("status_category")
    if status_category == "indexed" or entry.get("inspection_indexed_at"):
        return "indexed"
    if status_category in {"crawled_not_indexed", "pending_crawl", "blocked", "error"}:
        return status_category
    if is_gsc_seen(entry):
        return "gsc_seen"
    if is_google_submitted(entry):
        return "submitted"
    if is_manual_completed(entry):
        return "manual"
    return "unknown"


def normalize_url_state(entry: dict) -> dict:
    """Normalize legacy URL state into explicit submission and index signals."""
    if not isinstance(entry, dict):
        entry = {"indexed": bool(entry), "lastmod": None}

    completed_via = entry.get("completed_via")
    indexed_at = entry.get("indexed_at")

    if completed_via == "google_api" and indexed_at:
        entry.setdefault("google_submitted_at", indexed_at)
    if completed_via == "manual" and indexed_at:
        entry.setdefault("manual_completed_at", indexed_at)
    if entry.get("sc_synced_at"):
        entry.setdefault("gsc_seen_at", entry.get("sc_synced_at"))
    if entry.get("gsc_seen_at"):
        entry.setdefault("sc_synced_at", entry.get("gsc_seen_at"))
    if entry.get("status_category") == "indexed":
        entry.setdefault(
            "inspection_indexed_at",
            _first_value(entry.get("inspected_at"), entry.get("category_updated_at"), indexed_at),
        )

    if entry.get("indexed") and not any(
        (
            entry.get("google_submitted_at"),
            entry.get("manual_completed_at"),
            entry.get("gsc_seen_at"),
            entry.get("inspection_indexed_at"),
        )
    ):
        if completed_via == "gsc_performance":
            entry.setdefault("gsc_seen_at", _first_value(entry.get("sc_synced_at"), indexed_at))
            if entry.get("gsc_seen_at"):
                entry.setdefault("sc_synced_at", entry.get("gsc_seen_at"))
        elif completed_via == "inspection":
            entry.setdefault("inspection_indexed_at", _first_value(entry.get("inspected_at"), indexed_at))
        elif completed_via == "manual":
            entry.setdefault("manual_completed_at", indexed_at)
        else:
            if indexed_at:
                entry.setdefault("google_submitted_at", indexed_at)

    if entry.get("google_submitted_at"):
        entry.setdefault("indexed_at", entry.get("google_submitted_at"))

    entry["indexed"] = should_skip_google_submit(entry)
    entry["index_status"] = derive_index_status(entry)
    return entry


def migrate_urls(data):
    """将旧版 URL 状态转换为统一字段，同时兼容旧的 indexed 语义。"""
    migrated = {}
    for url, value in data.items():
        migrated[url] = normalize_url_state(value)
    return migrated


def _matches(pattern, url):
    """将模式与 URL 进行匹配。

    支持普通子字符串和正则表达式。
    自动去除 JavaScript 风格的分隔符（/pattern/）。
    如果模式包含正则元字符则编译并搜索，否则使用简单的子字符串检查。
    """
    if pattern.startswith("/") and pattern.rfind("/", 1) > 0:
        end = pattern.rfind("/", 1)
        pattern = pattern[1:end]

    _REGEX_CHARS = set(r"^$*+?{}[]|()")
    if any(c in pattern for c in _REGEX_CHARS):
        try:
            return bool(re.search(pattern, url))
        except re.error:
            return pattern in url
    return pattern in url


def filter_urls(urls, site_config):
    """按扩展名、排除模式和包含模式过滤 URL。

    模式同时支持普通子字符串和正则表达式。
    """
    skip_extensions = [e.lower() for e in site_config.get("skip_extensions", DEFAULT_SKIP_EXTENSIONS)]
    exclude_patterns = site_config.get("exclude_patterns", [])
    include_patterns = site_config.get("include_patterns", [])

    result = {}
    for url, lastmod in urls.items():
        url_lower = url.lower()
        if any(url_lower.endswith(ext) for ext in skip_extensions):
            continue

        if any(_matches(pattern, url) for pattern in exclude_patterns):
            continue

        if include_patterns and not any(_matches(pattern, url) for pattern in include_patterns):
            continue

        result[url] = lastmod

    return result


def update_quota(credentials_file):
    """将给定凭据文件的每日配额计数器加 1。"""
    update_quota_batch(credentials_file, 1)


_quota_lock = threading.Lock()
QUOTA_FILE = "quota.json"


def _quota_path():
    data_dir = os.environ.get("SMARTINDEX_DATA_DIR", os.getcwd())
    return os.path.join(data_dir, QUOTA_FILE)


def update_quota_batch(credentials_file, count):
    """在单次磁盘写入中将每日配额计数器增加 count。

    线程安全：使用锁防止并发的读-修改-写损坏。
    """
    with _quota_lock:
        qp = _quota_path()
        quota = load_json(qp)
        today = str(date.today())

        entry = quota.get(credentials_file)
        if entry and entry.get("date") == today:
            entry["used"] += count
        else:
            quota[credentials_file] = {"date": today, "used": count}

        _write_json_atomic(quota, qp)


def get_quota_remaining(credentials_file):
    """返回给定凭据文件今天剩余的 URL 提交配额。"""
    with _quota_lock:
        quota = load_json(_quota_path())
        entry = quota.get(credentials_file, {})
        used = entry.get("used", 0) if entry.get("date") == str(date.today()) else 0
        return max(0, QUOTA_LIMIT - used)


def sync_urls(existing_urls, sitemap_urls, raw_urls, site_config):
    """将现有 URL 状态与站点地图数据同步。

    - 将过滤后站点地图中的新 URL 添加为待处理。
    - 删除不再存在于原始（未过滤）站点地图中的 URL。
    - 对 lastmod 发生变化的 URL 重置索引状态（如果启用了 track_lastmod）。

    Args:
        existing_urls: dict of {url: {"indexed": bool, "lastmod": str|None, ...}}
        sitemap_urls: dict of {url: lastmod} 过滤后（来自 filter_urls）
        raw_urls: dict of {url: lastmod} 过滤前（用于删除检查）
        site_config: 站点配置字典

    Returns:
        dict with keys: new_count, del_count, reset_count
    """
    new_count = 0
    for url, lastmod in sitemap_urls.items():
        if url not in existing_urls:
            existing_urls[url] = normalize_url_state({"indexed": False, "lastmod": lastmod})
            new_count += 1

    del_count = 0
    for url in list(existing_urls):
        if url not in raw_urls:
            del existing_urls[url]
            del_count += 1

    reset_count = 0
    if site_config.get("track_lastmod"):
        for url, entry in existing_urls.items():
            if url not in sitemap_urls:
                continue
            new_lastmod = sitemap_urls[url]
            if new_lastmod != entry.get("lastmod"):
                entry["indexed"] = False
                entry["lastmod"] = new_lastmod
                entry.pop("indexed_at", None)
                entry.pop("google_submitted_at", None)
                entry.pop("manual_completed_at", None)
                entry.pop("completed_via", None)
                entry.pop("bing_submitted", None)
                entry.pop("sc_synced_at", None)
                entry.pop("gsc_seen_at", None)
                entry.pop("category", None)
                entry.pop("coverage_state", None)
                entry.pop("status_category", None)
                entry.pop("inspected_at", None)
                entry.pop("inspection_indexed_at", None)
                entry.pop("category_updated_at", None)
                entry.pop("verdict", None)
                entry.pop("last_crawl_time", None)
                entry.pop("page_fetch_state", None)
                entry.pop("robots_txt_state", None)
                entry["index_status"] = "unknown"
                reset_count += 1

    return {"new_count": new_count, "del_count": del_count, "reset_count": reset_count}


def build_indexing_plan(credentials_list):
    """返回今天配额 > 0 的凭据列表 [(creds_file, remaining)]。"""
    plan = []
    for creds in credentials_list:
        remaining = get_quota_remaining(creds)
        if remaining > 0:
            plan.append((creds, remaining))
    return plan


_SENSITIVE_PATTERNS = [
    re.compile(r'(?<=://)[^/@\s:]+:[^@\s]+@'),
    re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'),
    re.compile(r'(?:api[_-]?key|token|secret|password|passwd|pwd|auth)["\s:=]+["\']?([\w\-_.]{8,})["\']?', re.IGNORECASE),
    re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
]


def sanitize_error_message(msg: str) -> str:
    """过滤异常信息中的敏感内容（邮箱、密钥、token等），用于统一错误处理。"""
    sanitized = msg
    for pattern in _SENSITIVE_PATTERNS:
        replacement = "[REDACTED]@" if pattern.pattern.startswith("(?<=://)") else "[REDACTED]"
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


class GlobalTaskLock:
    """全局任务锁，使用 threading.Lock 实现，防止同一站点同时运行多个任务。"""

    def __init__(self):
        self._lock = threading.Lock()
        self._locked_by: str | None = None

    def acquire(self, site_name: str = "", blocking: bool = True, timeout: float = -1) -> bool:
        acquired = self._lock.acquire(blocking=blocking, timeout=timeout if timeout > 0 else -1)
        if acquired:
            self._locked_by = site_name or "unknown"
        return acquired

    def release(self):
        self._locked_by = None
        self._lock.release()

    @property
    def locked(self) -> bool:
        return self._lock.locked()

    @property
    def locked_by(self) -> str | None:
        return self._locked_by
