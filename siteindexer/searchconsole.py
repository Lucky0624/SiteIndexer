import json
from datetime import date, timedelta
from urllib.parse import quote

import httplib2
from oauth2client.service_account import ServiceAccountCredentials

from siteindexer.constants import GSC_ROW_LIMIT, GSC_MONTHS_BACK
from siteindexer.utils import APP_LOGGER, parse_proxy_info, sanitize_error_message

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
BASE_URL = "https://www.googleapis.com/webmasters/v3/sites"

INSPECTION_INDEXED_STATES = {
    "Submitted and indexed",
    "Indexed",
}

INSPECTION_PENDING_STATES = {
    "Crawled - currently not indexed",
    "Discovered - currently not indexed",
    "Submitted URL seems to be a Soft 404",
    "URL is not indexed",
    "Crawled as Googlebot",
}

INSPECTION_BLOCKED_STATES = {
    "Blocked by robots.txt",
    "Blocked due to unauthorized request (403)",
    "Blocked by page fetch tool",
    "Not found (404)",
    "Server error (5XX)",
}


def _make_http_from_credentials(credentials, proxy=None):
    return credentials.authorize(httplib2.Http(proxy_info=parse_proxy_info(proxy)))


def _make_http(credentials_json: str, proxy=None):
    credentials = ServiceAccountCredentials.from_json_keyfile_name(
        credentials_json, scopes=SCOPES
    )
    return _make_http_from_credentials(credentials, proxy=proxy)


def _make_http_from_dict(credentials_dict: dict, proxy=None):
    credentials = ServiceAccountCredentials.from_json_keyfile_dict(
        credentials_dict, scopes=SCOPES
    )
    return _make_http_from_credentials(credentials, proxy=proxy)


def list_gsc_properties(credentials_json: str, proxy=None) -> list:
    http = _make_http(credentials_json, proxy=proxy)
    response, content = http.request(BASE_URL, method="GET")
    if response.status != 200:
        try:
            detail = json.loads(content).get("error", {}).get("message", content.decode()[:300])
        except Exception:
            detail = content.decode()[:300]
        raise Exception(sanitize_error_message(f"Could not list GSC properties ({response.status}): {detail}"))
    data = json.loads(content)
    return [entry["siteUrl"] for entry in data.get("siteEntry", [])]


def _fetch_indexed_pages_impl(http, site_url: str, months_back: int = GSC_MONTHS_BACK) -> set:
    if site_url.startswith("http") and not site_url.endswith("/"):
        site_url = site_url + "/"

    end_date = str(date.today())
    start_date = str(date.today() - timedelta(days=months_back * 30))

    encoded_site = quote(site_url, safe="")
    endpoint = f"{BASE_URL}/{encoded_site}/searchAnalytics/query"

    all_pages = set()
    start_row = 0
    row_limit = GSC_ROW_LIMIT

    while True:
        body = json.dumps({
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": ["page"],
            "rowLimit": row_limit,
            "startRow": start_row,
        })
        response, content = http.request(
            endpoint,
            method="POST",
            body=body,
            headers={"Content-Type": "application/json"},
        )

        if response.status == 403:
            try:
                detail = json.loads(content).get("error", {}).get("message", content.decode()[:300])
            except Exception:
                detail = content.decode()[:300]
            raise Exception(sanitize_error_message(f"Access denied (403): {detail}\nTried site URL: {site_url}"))
        if response.status == 429:
            raise Exception("GSC rate limit reached. Please try again later.")
        if response.status != 200:
            try:
                detail = json.loads(content).get("error", {}).get("message", content.decode()[:200])
            except Exception:
                detail = content.decode()[:200]
            raise Exception(sanitize_error_message(f"GSC API error {response.status}: {detail}"))

        data = json.loads(content)
        rows = data.get("rows", [])
        if not rows:
            break

        for row in rows:
            all_pages.add(row["keys"][0])

        APP_LOGGER.info(f"GSC: fetched {len(rows)} pages (total: {len(all_pages)})")

        if len(rows) < row_limit:
            break
        start_row += row_limit

    return all_pages


def fetch_indexed_pages(site_url: str, credentials_json: str, months_back: int = GSC_MONTHS_BACK, proxy=None) -> set:
    http = _make_http(credentials_json, proxy=proxy)

    try:
        return _fetch_indexed_pages_impl(http, site_url, months_back=months_back)
    except Exception as e:
        if "403" in str(e):
            available = []
            try:
                available = list_gsc_properties(credentials_json, proxy=proxy)
            except Exception:
                pass
            props_hint = (
                "\n\nProperties accessible to this service account:\n  " +
                "\n  ".join(available) if available else
                "\n\nCould not list properties — the 'Google Search Console API' may not be enabled in GCP."
            )
            raise Exception(f"{e}{props_hint}")
        raise


def fetch_indexed_pages_from_dict(site_url: str, credentials_dict: dict, months_back: int = GSC_MONTHS_BACK, proxy=None) -> set:
    http = _make_http_from_dict(credentials_dict, proxy=proxy)
    return _fetch_indexed_pages_impl(http, site_url, months_back=months_back)


def _classify_inspection_result(result: dict) -> str:
    verdict = result.get("verdict", "UNKNOWN")
    coverage_state = result.get("coverageState", "")
    robots_state = result.get("robotsTxtState", "")
    page_fetch_state = result.get("pageFetchState", "")

    if verdict == "PASS" or coverage_state in INSPECTION_INDEXED_STATES or "Indexed" in coverage_state:
        return "indexed"

    if coverage_state in INSPECTION_BLOCKED_STATES:
        return "blocked"

    if "Soft 404" in coverage_state:
        return "error"

    if "5XX" in coverage_state or "Server error" in coverage_state:
        return "error"

    if robots_state == "BLOCKED":
        return "blocked"

    if page_fetch_state in ("NOT_FOUND", "FORBIDDEN"):
        return "blocked"

    if "Crawled" in coverage_state:
        return "crawled_not_indexed"

    if "Discovered" in coverage_state:
        return "pending_crawl"

    if verdict == "NEUTRAL":
        return "pending_crawl"

    if verdict == "FAIL":
        return "blocked"

    return "unknown"


def inspect_url(url: str, site_url: str, credentials_json: str, proxy=None) -> dict:
    http = _make_http(credentials_json, proxy=proxy)

    endpoint = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"

    body = json.dumps({
        "inspectionUrl": url,
        "siteUrl": site_url,
        "languageCode": "zh-CN",
    })

    response, content = http.request(
        endpoint,
        method="POST",
        body=body,
        headers={"Content-Type": "application/json"},
    )

    if response.status != 200:
        try:
            detail = json.loads(content).get("error", {}).get("message", content.decode()[:200])
        except Exception:
            detail = content.decode()[:200]
        raise Exception(sanitize_error_message(f"Inspection API error {response.status}: {detail}"))

    data = json.loads(content)
    index_result = data.get("inspectionResult", {}).get("indexStatusResult", {})

    result = {
        "verdict": index_result.get("verdict", "UNKNOWN"),
        "coverageState": index_result.get("coverageState", "Unknown"),
        "lastCrawlTime": index_result.get("lastCrawlTime"),
        "pageFetchState": index_result.get("pageFetchState"),
        "robotsTxtState": index_result.get("robotsTxtState"),
        "indexingState": index_result.get("indexingState"),
        "crawledAs": index_result.get("crawledAs"),
        "sitemap": index_result.get("sitemap"),
        "referrerUrls": index_result.get("referrerUrls", []),
    }

    status_category = _classify_inspection_result(result)
    result["status_category"] = status_category
    result["is_indexed"] = status_category == "indexed"

    return result
