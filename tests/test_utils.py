import os
import tempfile
import unittest

from siteindexer.utils import (
    get_quota_remaining,
    migrate_urls,
    sanitize_error_message,
    sync_urls,
    update_quota_batch,
)


class SyncUrlsTests(unittest.TestCase):
    def test_lastmod_change_resets_all_cached_submission_states(self):
        existing = {
            "https://example.com/a": {
                "indexed": True,
                "indexed_at": "2026-01-01",
                "google_submitted_at": "2026-01-01",
                "gsc_seen_at": "2026-01-01",
                "inspection_indexed_at": "2026-01-01",
                "lastmod": "2026-01-01",
                "bing_submitted": "2026-01-01",
                "sc_synced_at": "2026-01-01",
                "status_category": "indexed",
                "inspected_at": "2026-01-01",
            }
        }

        result = sync_urls(
            existing,
            {"https://example.com/a": None},
            {"https://example.com/a": None},
            {"track_lastmod": True},
        )

        self.assertEqual(result["reset_count"], 1)
        self.assertFalse(existing["https://example.com/a"]["indexed"])
        self.assertIsNone(existing["https://example.com/a"]["lastmod"])
        self.assertNotIn("bing_submitted", existing["https://example.com/a"])
        self.assertNotIn("google_submitted_at", existing["https://example.com/a"])
        self.assertNotIn("gsc_seen_at", existing["https://example.com/a"])
        self.assertNotIn("inspection_indexed_at", existing["https://example.com/a"])
        self.assertNotIn("status_category", existing["https://example.com/a"])
        self.assertEqual(existing["https://example.com/a"]["index_status"], "unknown")

    def test_migrate_urls_normalizes_legacy_index_state(self):
        migrated = migrate_urls({
            "https://example.com/a": {
                "indexed": True,
                "indexed_at": "2026-01-01",
                "completed_via": "google_api",
                "lastmod": None,
            },
            "https://example.com/b": {
                "indexed": True,
                "sc_synced_at": "2026-01-02",
                "completed_via": "gsc_performance",
                "lastmod": None,
            },
        })

        self.assertEqual(migrated["https://example.com/a"]["google_submitted_at"], "2026-01-01")
        self.assertEqual(migrated["https://example.com/a"]["index_status"], "submitted")
        self.assertEqual(migrated["https://example.com/b"]["gsc_seen_at"], "2026-01-02")
        self.assertEqual(migrated["https://example.com/b"]["index_status"], "gsc_seen")

    def test_quota_uses_configured_data_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous = os.environ.get("SMARTINDEX_DATA_DIR")
            os.environ["SMARTINDEX_DATA_DIR"] = tmp
            try:
                update_quota_batch("cred.json", 2)
                self.assertEqual(get_quota_remaining("cred.json"), 198)
                self.assertTrue(os.path.exists(os.path.join(tmp, "quota.json")))
            finally:
                if previous is None:
                    os.environ.pop("SMARTINDEX_DATA_DIR", None)
                else:
                    os.environ["SMARTINDEX_DATA_DIR"] = previous

    def test_proxy_credentials_are_removed_from_errors(self):
        message = "proxy socks5://alice:password@example.test:1080 failed"
        self.assertNotIn("alice:password", sanitize_error_message(message))


if __name__ == "__main__":
    unittest.main()
