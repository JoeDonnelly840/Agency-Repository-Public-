"""Offline tests: python -m unittest discover tests"""
import io
import json
import os
import tempfile
import unittest
import urllib.error

from collector import config, store
from collector.classify import classify
from collector.flags import flag_item
from collector.http_client import PoliteClient, RequestRefused, SourceUnavailable
from collector.sources import federal_register, sec_feeds


class FakeResponse(io.BytesIO):
    headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fr_doc(**kw):
    base = {"document_number": "2026-00001", "title": "Untitled", "type": "Notice", "abstract": "",
            "action": "", "agencies": [{"slug": "securities-and-exchange-commission",
                                        "name": "Securities and Exchange Commission"}],
            "publication_date": "2026-11-09", "html_url": "https://www.federalregister.gov/d/2026-00001",
            "significant": False}
    base.update(kw)
    return base


def process(doc, query="sec"):
    item = federal_register._normalize(doc)
    item["query_agencies"] = [query]
    return flag_item(classify(item))


class SafetyTests(unittest.TestCase):
    def test_refuses_hosts_not_on_allow_list(self):
        c = PoliteClient(sleep=lambda s: None, opener=lambda *a, **k: FakeResponse(b"{}"))
        with self.assertRaises(RequestRefused):
            c.get("https://www.finra.org/rules", "x")
        with self.assertRaises(RequestRefused):
            c.get("http://www.federalregister.gov/api/v1/documents.json", "x")

    def test_only_get_requests_and_user_agent(self):
        seen = []

        def opener(req, timeout):
            seen.append(req)
            return FakeResponse(b"{}")
        c = PoliteClient(sleep=lambda s: None, opener=opener)
        c.get_json("https://www.federalregister.gov/api/v1/agencies.json", "fr")
        self.assertEqual(seen[0].get_method(), "GET")
        self.assertIn("AgencyTracker", seen[0].get_header("User-agent"))

    def test_waits_between_requests_to_same_host(self):
        sleeps, t = [], [0.0]
        c = PoliteClient(sleep=lambda s: (sleeps.append(s), t.__setitem__(0, t[0] + s)),
                         clock=lambda: t[0], opener=lambda *a, **k: FakeResponse(b"{}"))
        c.get("https://www.federalregister.gov/a", "fr")
        c.get("https://www.federalregister.gov/b", "fr")
        self.assertAlmostEqual(sum(sleeps), config.MIN_SECONDS_BETWEEN_REQUESTS["www.federalregister.gov"])

    def test_request_ceiling(self):
        c = PoliteClient(sleep=lambda s: None, opener=lambda *a, **k: FakeResponse(b"{}"))
        c.total_requests = config.MAX_REQUESTS_PER_RUN
        with self.assertRaises(RequestRefused):
            c.get("https://www.federalregister.gov/a", "fr")

    def test_circuit_breaker_and_no_retry_on_404(self):
        calls = []

        def opener(req, timeout):
            calls.append(1)
            raise urllib.error.HTTPError(req.full_url, 404, "nf", {}, None)
        c = PoliteClient(sleep=lambda s: None, opener=opener)
        for _ in range(config.MAX_CONSECUTIVE_FAILURES_PER_SOURCE):
            with self.assertRaises(SourceUnavailable):
                c.get("https://www.federalregister.gov/a", "fr")
        self.assertEqual(len(calls), config.MAX_CONSECUTIVE_FAILURES_PER_SOURCE)  # 404 not retried
        with self.assertRaises(SourceUnavailable):
            c.get("https://www.federalregister.gov/a", "fr")
        self.assertEqual(len(calls), config.MAX_CONSECUTIVE_FAILURES_PER_SOURCE)  # breaker: no new request

    def test_robots_disallow_is_respected(self):
        def opener(req, timeout):
            if req.full_url.endswith("robots.txt"):
                return FakeResponse(b"User-agent: *\nDisallow: /private/\n")
            return FakeResponse(b"ok")
        c = PoliteClient(sleep=lambda s: None, opener=opener)
        with self.assertRaises(SourceUnavailable):
            c.get("https://www.sec.gov/private/feed", "sec", check_robots=True)
        self.assertEqual(c.get("https://www.sec.gov/public/feed", "sec", check_robots=True), b"ok")


class ClassifyAndFlagTests(unittest.TestCase):
    def test_final_rule_significant(self):
        it = process(fr_doc(type="Rule", title="Climate Disclosure", significant=True))
        self.assertEqual((it["category"], it["subcategory"]), ("rulemaking", "Final rule"))
        self.assertIn("major_questions", [f["code"] for f in it["flags"]])

    def test_alj_proceeding_is_high_priority_structural(self):
        it = process(fr_doc(title="In the Matter of Acme Corp.; Notice of Hearing Before an Administrative Law Judge",
                            abstract="The respondent faces civil money penalties."))
        self.assertEqual(it["category"], "adjudication")
        self.assertEqual(it["priority"], 3)
        self.assertEqual(it["flags"][0]["code"], "agency_adjudication")
        self.assertTrue(it["flags"][0]["structural"])

    def test_finra_filing_goes_to_corporations(self):
        it = process(fr_doc(title="Self-Regulatory Organizations; Financial Industry Regulatory Authority, Inc.; "
                                  "Notice of Filing of a Proposed Rule Change To Amend Rule 2165"))
        self.assertEqual(it["corporation"], "finra")
        self.assertEqual(it["category"], "rulemaking")
        self.assertIn("private_delegation", [f["code"] for f in it["flags"]])

    def test_exchange_filing_is_other_sro_low(self):
        it = process(fr_doc(title="Self-Regulatory Organizations; Nasdaq Stock Market LLC; Notice of Filing"))
        self.assertEqual(it["corporation"], "other_sro")
        self.assertEqual(it["priority"], 1)

    def test_fda_document_not_double_listed_under_hhs(self):
        doc = fr_doc(agencies=[{"slug": "health-and-human-services-department"},
                               {"slug": "food-and-drug-administration"}], title="Medical Devices; Notice")
        it = process(doc, query="hhs")
        self.assertEqual(it["agencies"], ["fda"])

    def test_paperwork_notice_is_other_and_unflagged(self):
        it = process(fr_doc(title="Agency Information Collection Activities; Submission for OMB Review"))
        self.assertEqual(it["category"], "other")
        self.assertEqual(it["flags"], [])

    def test_presidential_document(self):
        doc = fr_doc(type="Presidential Document", subtype="Executive Order",
                     title="Ensuring Accountability for All Agencies", agencies=[{"slug": "executive-office-of-the-president"}])
        it = process(doc, query="president")
        self.assertEqual(it["category"], "presidential")
        self.assertIn("removal_independence", [f["code"] for f in it["flags"]])

    def test_alj_at_rulemaking_hearing_is_not_penalty_flag(self):
        doc = fr_doc(title="Heat Injury and Illness Prevention; Informal Public Hearing",
                     abstract="An administrative law judge will preside.",
                     agencies=[{"slug": "labor-department"}])
        it = process(doc, query="dol")
        self.assertEqual(it["category"], "rulemaking")
        codes = [f["code"] for f in it["flags"]]
        self.assertNotIn("agency_adjudication", codes)
        self.assertIn("officer_appointment_removal", codes)

    def test_ferc_filing_is_adjudication(self):
        doc = fr_doc(title="Combined Notice of Filings #1",
                     agencies=[{"slug": "federal-energy-regulatory-commission"}])
        it = process(doc, query="ferc")
        self.assertEqual(it["category"], "adjudication")


class SecFeedTests(unittest.TestCase):
    RSS = b"""<?xml version="1.0"?><rss><channel>
      <item><title>Order Instituting Cease-and-Desist Proceedings: Jane Doe</title>
        <link>https://www.sec.gov/x/1</link><guid>1</guid>
        <pubDate>Mon, 09 Nov 2026 10:00:00 -0500</pubDate><description>&lt;p&gt;Settled&lt;/p&gt;</description></item>
    </channel></rss>"""

    def test_parse_and_flag(self):
        feed = config.SEC_FEEDS[1]
        items = sec_feeds.parse_feed(self.RSS, feed)
        self.assertEqual(items[0]["date"], "2026-11-09")
        it = flag_item(classify(items[0]))
        self.assertEqual(it["category"], "adjudication")
        self.assertEqual(it["flags"][0]["code"], "agency_adjudication")

    def test_skipped_without_contact(self):
        items, reps = sec_feeds.fetch(None, "2026-11-01", "2026-11-09", "")
        self.assertEqual(items, [])
        self.assertTrue(all(r["status"] == "skipped" for r in reps))


class StoreTests(unittest.TestCase):
    def test_merge_keeps_first_seen_and_window(self):
        import datetime as dt
        with tempfile.TemporaryDirectory() as root:
            it = process(fr_doc())
            self.assertEqual(store.merge_items([dict(it)], "2026-11-09T12:00:00", root=root), 1)
            self.assertEqual(store.merge_items([dict(it)], "2026-11-10T12:00:00", root=root), 0)
            with open(os.path.join(root, "days", "2026-11-09.json")) as f:
                saved = json.load(f)["items"][0]
            self.assertEqual(saved["first_seen"], "2026-11-09T12:00:00")

            idx = store.load_index(root)
            today = dt.date(2026, 11, 10)
            self.assertEqual(store.compute_window(idx, today), ("2026-10-11", "2026-11-10"))
            run = {"run_at": "x", "start": "2026-10-11", "end": "2026-11-10", "items_new": 1,
                   "reports": [{"source": "federal_register", "label": "FR", "status": "ok", "detail": "",
                                "agencies": {}}]}
            idx = store.write_index(idx, run, root=root)
            self.assertEqual(store.compute_window(idx, dt.date(2026, 11, 11)), ("2026-11-07", "2026-11-11"))
            self.assertEqual(idx["days"], {"2026-11-09": 1})


if __name__ == "__main__":
    unittest.main()
