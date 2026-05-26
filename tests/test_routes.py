import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from siteindexer.sitemaps import SitemapFetchError
from web_local.backend import routes


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_data_dir = routes.DATA_DIR
        routes.DATA_DIR = Path(self.tempdir.name)
        routes._task_locks.clear()
        self.site = {
            "name": "demo",
            "sitemap_url": "https://example.com/sitemap.xml",
            "credentials": ["cred.json"],
            "urls_file": "urls_demo.json",
            "skip_extensions": [],
            "exclude_patterns": ["/admin/"],
            "include_patterns": [],
        }
        (routes.DATA_DIR / "config.json").write_text(
            json.dumps({"sites": [self.site]}),
            encoding="utf-8",
        )
        self.urls = {
            "https://example.com/admin/hidden": {"indexed": False, "lastmod": None},
            "https://example.com/public": {"indexed": False, "lastmod": None},
        }
        (routes.DATA_DIR / "urls_demo.json").write_text(json.dumps(self.urls), encoding="utf-8")
        self.client = TestClient(routes.app)

    def tearDown(self):
        routes.DATA_DIR = self.original_data_dir
        routes._task_locks.clear()
        self.tempdir.cleanup()

    def test_full_run_does_not_submit_excluded_existing_urls(self):
        submitted = []

        def record_submission(url, *_args, **_kwargs):
            submitted.append(url)
            return True

        raw = {url: None for url in self.urls}
        with (
            patch.object(routes, "fetch_urls_from_sitemap_recursive", return_value=raw),
            patch.object(routes, "build_indexing_plan", return_value=[("cred.json", 10)]),
            patch.object(routes, "index_url_with_retry", side_effect=record_submission),
            patch.object(routes, "update_quota_batch"),
        ):
            response = self.client.get("/api/sites/demo/run/stream")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(submitted, ["https://example.com/public"])

    def test_failed_sitemap_fetch_does_not_delete_existing_urls(self):
        with patch.object(
            routes,
            "fetch_urls_from_sitemap_recursive",
            side_effect=SitemapFetchError("offline"),
        ):
            response = self.client.post("/api/sites/demo/fetch-urls")

        self.assertEqual(response.status_code, 502)
        stored = json.loads((routes.DATA_DIR / "urls_demo.json").read_text(encoding="utf-8"))
        self.assertEqual(stored, self.urls)


if __name__ == "__main__":
    unittest.main()
