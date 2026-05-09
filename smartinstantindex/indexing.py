import json
from concurrent.futures import ThreadPoolExecutor, as_completed

import httplib2
from oauth2client.service_account import ServiceAccountCredentials
from smartinstantindex.utils import APP_LOGGER, parse_proxy_info

SCOPES = ["https://www.googleapis.com/auth/indexing"]
ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"


def _get_http(proxy=None):
    return httplib2.Http(proxy_info=parse_proxy_info(proxy))


def index_url_from_dict(url, credentials_dict, index, proxy=None):
    """Variant that accepts credentials as a dict instead of a file path (for cloud use)."""
    content = {
        'url': url,
        'type': 'URL_UPDATED'
    }

    credentials = ServiceAccountCredentials.from_json_keyfile_dict(
        credentials_dict, scopes=SCOPES
    )
    http = credentials.authorize(_get_http(proxy))

    response, content = http.request(ENDPOINT, method="POST", body=json.dumps(content))

    if response.status == 200:
        APP_LOGGER.info(f"[{index}]URL: {url} indexed.")
        return True

    if response.status == 429:
        raise Exception("Rate limit reached. Please wait and try again.")

    APP_LOGGER.warning(f"[{index}]URL: {url} could not be indexed.")
    APP_LOGGER.info(f"Response status: {response.status}")

    raise Exception(f"Response status: {response.status}")


def index_url(url, credentials_json, index, proxy=None):
    content = {
        'url': url,
        'type': 'URL_UPDATED'
    }

    credentials = ServiceAccountCredentials.from_json_keyfile_name(
        credentials_json, scopes=SCOPES
    )
    http = credentials.authorize(_get_http(proxy))

    response, content = http.request(ENDPOINT, method="POST", body=json.dumps(content))

    if response.status == 200:
        APP_LOGGER.info(f"[{index}]URL: {url} indexed.")
        return True

    if response.status == 429:
        raise Exception("Rate limit reached. Please wait and try again.")

    APP_LOGGER.warning(f"[{index}]URL: {url} could not be indexed.")
    APP_LOGGER.info(f"Response status: {response.status}")

    raise Exception(f"Response status: {response.status}")


def index_urls_concurrent(urls, credentials_json, proxy=None, max_workers=5):
    """Index multiple URLs concurrently using a thread pool."""
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
                results.append((url, False, str(e)))
    return results
