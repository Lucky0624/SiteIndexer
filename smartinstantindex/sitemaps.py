from curl_cffi import requests
from bs4 import BeautifulSoup


def fetch_urls_from_sitemap(sitemap_url, proxy=None):
    response = None
    proxies = {"http": proxy, "https": proxy} if proxy else None
    for target in ("chrome120", "chrome"):
        try:
            response = requests.get(sitemap_url, impersonate=target, timeout=20, proxies=proxies)
            if response.status_code == 200:
                break
        except Exception as e:
            print(f"Error fetching sitemap with {target}: {e}")
            continue
    
    if response and response.status_code == 200:
        soup = BeautifulSoup(response.text, features="xml")
        urls = {}
        for url_tag in soup.find_all("url"):
            loc = url_tag.find("loc")
            if loc:
                lastmod = url_tag.find("lastmod")
                urls[loc.text] = lastmod.text if lastmod else None
        # Also handle sitemap index entries (sitemaploc entries are inside <sitemap>)
        for sitemap_tag in soup.find_all("sitemap"):
            loc = sitemap_tag.find("loc")
            if loc and loc.text not in urls:
                urls[loc.text] = None
        return urls
    else:
        status = response.status_code if response else "No response"
        print(f"Failed to fetch sitemap: {sitemap_url} (Status: {status})")
        return {}


def fetch_urls_from_sitemap_recursive(sitemap_url, visited_sitemaps=None, proxy=None, _collected=None):
    """Recursively fetch all page URLs from a sitemap (index).

    Thread-safe: each call chain uses its own local dict instead of a global.
    """
    if visited_sitemaps is None:
        visited_sitemaps = set()
    if _collected is None:
        _collected = {}

    visited_sitemaps.add(sitemap_url)
    urls = fetch_urls_from_sitemap(sitemap_url, proxy=proxy)

    for url, lastmod in urls.items():
        if not url.endswith(".xml"):
            _collected[url] = lastmod
        elif url not in visited_sitemaps:
            fetch_urls_from_sitemap_recursive(url, visited_sitemaps, proxy=proxy, _collected=_collected)

    return _collected
