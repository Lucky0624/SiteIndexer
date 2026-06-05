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

    def test_full_run_uses_gsc_sync_and_skips_without_inspection(self):
        site = dict(self.site, site_url="sc-domain:example.com")
        (routes.DATA_DIR / "config.json").write_text(
            json.dumps({"sites": [site]}),
            encoding="utf-8",
        )
        urls = {
            "https://example.com/already": {"indexed": False, "lastmod": None},
            "https://example.com/new": {"indexed": False, "lastmod": None},
        }
        (routes.DATA_DIR / "urls_demo.json").write_text(json.dumps(urls), encoding="utf-8")
        submitted = []

        def record_submission(url, *_args, **_kwargs):
            submitted.append(url)
            return True

        raw = {url: None for url in urls}
        with (
            patch.object(routes, "fetch_urls_from_sitemap_recursive", return_value=raw),
            patch.object(routes, "build_indexing_plan", return_value=[("cred.json", 1)]),
            patch.object(routes, "fetch_indexed_pages", return_value={"https://example.com/already"}),
            patch.object(routes, "inspect_url") as inspect_mock,
            patch.object(routes, "index_url_with_retry", side_effect=record_submission),
            patch.object(routes, "update_quota_batch"),
        ):
            response = self.client.get("/api/sites/demo/run/stream")

        self.assertEqual(response.status_code, 200)
        inspect_mock.assert_not_called()
        self.assertEqual(submitted, ["https://example.com/new"])

        stored = json.loads((routes.DATA_DIR / "urls_demo.json").read_text(encoding="utf-8"))
        self.assertTrue(stored["https://example.com/already"]["indexed"])
        self.assertEqual(stored["https://example.com/already"]["completed_via"], "gsc_performance")
        self.assertEqual(stored["https://example.com/already"]["index_status"], "gsc_seen")
        self.assertIn("gsc_seen_at", stored["https://example.com/already"])
        self.assertTrue(stored["https://example.com/new"]["indexed"])
        self.assertEqual(stored["https://example.com/new"]["completed_via"], "google_api")
        self.assertEqual(stored["https://example.com/new"]["index_status"], "submitted")
        self.assertIn("google_submitted_at", stored["https://example.com/new"])

    def test_gsc_sync_streams_url_updates_and_records_history_details(self):
        site = dict(self.site, site_url="sc-domain:example.com")
        (routes.DATA_DIR / "config.json").write_text(
            json.dumps({"sites": [site]}),
            encoding="utf-8",
        )

        with patch.object(routes, "fetch_indexed_pages", return_value={"https://example.com/public"}):
            response = self.client.get("/api/sites/demo/sync-gsc/stream")

        self.assertEqual(response.status_code, 200)
        self.assertIn('"type": "gsc_synced"', response.text)
        self.assertIn("https://example.com/public", response.text)

        stored = json.loads((routes.DATA_DIR / "urls_demo.json").read_text(encoding="utf-8"))
        self.assertTrue(stored["https://example.com/public"]["indexed"])
        self.assertEqual(stored["https://example.com/public"]["completed_via"], "gsc_performance")
        self.assertIn("sc_synced_at", stored["https://example.com/public"])
        self.assertIn("gsc_seen_at", stored["https://example.com/public"])
        self.assertEqual(stored["https://example.com/public"]["index_status"], "gsc_seen")

        history = json.loads((routes.DATA_DIR / "history.json").read_text(encoding="utf-8"))
        self.assertEqual(history[-1]["operation"], "gsc_sync")
        self.assertEqual(history[-1]["synced"], 1)
        self.assertEqual(history[-1]["details"][0]["url"], "https://example.com/public")
        self.assertEqual(history[-1]["details"][0]["action"], "gsc_synced")

    def test_inspection_retries_transient_timeout(self):
        calls = []

        def flaky_inspection(url, *_args, **_kwargs):
            calls.append(url)
            if len(calls) == 1:
                raise TimeoutError("[WinError 10060] 连接尝试失败")
            return {
                "coverageState": "URL is not indexed",
                "status_category": "pending_crawl",
                "is_indexed": False,
            }

        with (
            patch.object(routes, "inspect_url", side_effect=flaky_inspection),
            patch.object(routes.time, "sleep"),
        ):
            result = routes.inspect_url_with_retry(
                "https://example.com/public",
                "sc-domain:example.com",
                "cred.json",
            )

        self.assertEqual(len(calls), 2)
        self.assertEqual(result["status_category"], "pending_crawl")

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
