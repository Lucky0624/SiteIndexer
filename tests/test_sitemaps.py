import unittest
from unittest.mock import patch

from siteindexer.sitemaps import SitemapFetchError, fetch_urls_from_sitemap_recursive


class _Response:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


class SitemapTests(unittest.TestCase):
    def test_sitemap_index_is_parsed_by_document_type_not_file_suffix(self):
        documents = {
            "https://example.com/sitemap": """<?xml version="1.0"?>
                <sitemapindex>
                    <sitemap><loc>https://example.com/pages?id=1</loc></sitemap>
                </sitemapindex>""",
            "https://example.com/pages?id=1": """<?xml version="1.0"?>
                <urlset>
                    <url><loc>https://example.com/feed.xml</loc><lastmod>2026-05-25</lastmod></url>
                </urlset>""",
        }

        def fake_get(url, **_kwargs):
            return _Response(200, documents[url])

        with patch("siteindexer.sitemaps.requests.get", side_effect=fake_get):
            result = fetch_urls_from_sitemap_recursive("https://example.com/sitemap")

        self.assertEqual(result, {"https://example.com/feed.xml": "2026-05-25"})

    def test_fetch_failure_is_not_reported_as_empty_sitemap(self):
        with patch("siteindexer.sitemaps.requests.get", return_value=_Response(503)):
            with self.assertRaises(SitemapFetchError):
                fetch_urls_from_sitemap_recursive("https://example.com/sitemap.xml")


if __name__ == "__main__":
    unittest.main()
