import json
import unittest
from unittest.mock import patch

from siteindexer import searchconsole


class SearchConsoleTests(unittest.TestCase):
    def test_inspection_normalizes_url_prefix_property_with_trailing_slash(self):
        captured = {}

        class FakeHttp:
            def request(self, endpoint, method="GET", body=None, headers=None):
                captured["endpoint"] = endpoint
                captured["method"] = method
                captured["body"] = json.loads(body)
                return (
                    type("Response", (), {"status": 200})(),
                    json.dumps({
                        "inspectionResult": {
                            "indexStatusResult": {
                                "verdict": "PASS",
                                "coverageState": "Submitted and indexed",
                            }
                        }
                    }).encode("utf-8"),
                )

        with patch.object(searchconsole, "_make_http", return_value=FakeHttp()):
            result = searchconsole.inspect_url(
                "https://example.com/page",
                "https://example.com",
                "cred.json",
            )

        self.assertEqual(captured["body"]["siteUrl"], "https://example.com/")
        self.assertTrue(result["is_indexed"])


if __name__ == "__main__":
    unittest.main()
