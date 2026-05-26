from curl_cffi import requests
from bs4 import BeautifulSoup

from siteindexer.constants import SITEMAP_TIMEOUT
from siteindexer.utils import APP_LOGGER


class SitemapFetchError(Exception):
    """Raised when a sitemap cannot be fetched or parsed completely."""


def _fetch_sitemap_document(sitemap_url, proxy=None):
    response = None
    last_error = None
    proxies = {"http": proxy, "https": proxy} if proxy else None
    for target in ("chrome120", "chrome"):
        try:
            response = requests.get(sitemap_url, impersonate=target, timeout=SITEMAP_TIMEOUT, proxies=proxies)
            if response.status_code == 200:
                break
        except Exception as e:
            last_error = e
            APP_LOGGER.debug(f"Error fetching sitemap with {target}: {e}")
            continue

    if response is None or response.status_code != 200:
        status = response.status_code if response is not None else "No response"
        APP_LOGGER.warning(f"Failed to fetch sitemap: {sitemap_url} (Status: {status})")
        detail = f": {last_error}" if last_error else ""
        raise SitemapFetchError(f"无法获取 sitemap {sitemap_url} (状态: {status}){detail}")

    soup = BeautifulSoup(response.text, features="xml")
    root = soup.find(["urlset", "sitemapindex"])
    if root is None:
        raise SitemapFetchError(f"sitemap 格式无效: {sitemap_url}")
    return root


def fetch_urls_from_sitemap(sitemap_url, proxy=None):
    root = _fetch_sitemap_document(sitemap_url, proxy=proxy)
    if root.name == "urlset":
        urls = {}
        for url_tag in root.find_all("url", recursive=False):
            loc = url_tag.find("loc")
            if loc:
                lastmod = url_tag.find("lastmod")
                urls[loc.text.strip()] = lastmod.text.strip() if lastmod else None
        return urls

    return {
        loc.text.strip(): None
        for sitemap_tag in root.find_all("sitemap", recursive=False)
        if (loc := sitemap_tag.find("loc"))
    }


def fetch_urls_from_sitemap_recursive(sitemap_url, visited_sitemaps=None, proxy=None, _collected=None):
    if visited_sitemaps is None:
        visited_sitemaps = set()
    if _collected is None:
        _collected = {}

    if sitemap_url in visited_sitemaps:
        return _collected
    visited_sitemaps.add(sitemap_url)
    root = _fetch_sitemap_document(sitemap_url, proxy=proxy)

    if root.name == "urlset":
        for url_tag in root.find_all("url", recursive=False):
            loc = url_tag.find("loc")
            if loc:
                lastmod = url_tag.find("lastmod")
                _collected[loc.text.strip()] = lastmod.text.strip() if lastmod else None
    else:
        for sitemap_tag in root.find_all("sitemap", recursive=False):
            loc = sitemap_tag.find("loc")
            if loc:
                fetch_urls_from_sitemap_recursive(
                    loc.text.strip(),
                    visited_sitemaps,
                    proxy=proxy,
                    _collected=_collected,
                )

    return _collected
