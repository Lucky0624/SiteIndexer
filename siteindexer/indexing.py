import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import httplib2
from oauth2client.service_account import ServiceAccountCredentials

from siteindexer.constants import MAX_RETRY, RETRY_DELAY_SECONDS
from siteindexer.utils import APP_LOGGER, parse_proxy_info, sanitize_error_message

SCOPES = ["https://www.googleapis.com/auth/indexing"]
ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"


def _get_http(proxy=None):
    return httplib2.Http(proxy_info=parse_proxy_info(proxy))


def _index_url_impl(url, credentials, index, proxy=None):
    content = {
        'url': url,
        'type': 'URL_UPDATED'
    }

    last_err = None
    for attempt in range(MAX_RETRY):
        try:
            http = credentials.authorize(_get_http(proxy))
            response, resp_content = http.request(ENDPOINT, method="POST", body=json.dumps(content))

            if response.status == 200:
                APP_LOGGER.info(f"[{index}]URL: {url} indexed.")
                return True

            if response.status == 429:
                raise Exception("Rate limit reached. Please wait and try again.")

            if response.status == 403:
                raise Exception(f"Permission denied (403)")

            if response.status >= 500:
                last_err = Exception(f"Server error ({response.status})")
                if attempt < MAX_RETRY - 1:
                    delay = RETRY_DELAY_SECONDS * (2 ** attempt)
                    APP_LOGGER.warning(f"[{index}] Server error {response.status}, retrying in {delay}s...")
                    time.sleep(delay)
                    continue

            APP_LOGGER.warning(f"[{index}]URL: {url} could not be indexed. Status: {response.status}")
            raise Exception(sanitize_error_message(f"Indexing failed with status {response.status}"))

        except (ConnectionError, OSError) as e:
            last_err = e
            if attempt < MAX_RETRY - 1:
                delay = RETRY_DELAY_SECONDS * (2 ** attempt)
                APP_LOGGER.warning(f"[{index}] Connection error, retrying in {delay}s...")
                time.sleep(delay)
                continue
            raise Exception(sanitize_error_message(f"Connection failed after {MAX_RETRY} retries: {e}"))

    raise last_err


def index_url_from_dict(url, credentials_dict, index, proxy=None):
    credentials = ServiceAccountCredentials.from_json_keyfile_dict(
        credentials_dict, scopes=SCOPES
    )
    return _index_url_impl(url, credentials, index, proxy=proxy)


def index_url(url, credentials_json, index, proxy=None):
    credentials = ServiceAccountCredentials.from_json_keyfile_name(
        credentials_json, scopes=SCOPES
    )
    return _index_url_impl(url, credentials, index, proxy=proxy)


def index_urls_concurrent(urls, credentials_json, proxy=None, max_workers=5):
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {
            executor.submit(index_url, url, credentials_json, i+1, proxy): url
            for i, url in enumerate(urls)
        }
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                success = future.result()
                results.append((url, success, None))
            except Exception as e:
                results.append((url, False, sanitize_error_message(str(e))))
    return results
