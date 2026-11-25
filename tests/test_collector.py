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
from collector.sources import agency_feeds, federal_register, openfda, sec_feeds


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
        self.assertIn("RegCollect", seen[0].get_header("User-agent"))

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
        self.assertEqual(it["priority"], 2)          # no common-law analogue: Arguable; penalty: Significant
        self.assertEqual(it["flags"][0]["code"], "agency_adjudication")
        self.assertEqual(it["flags"][0]["tier"], 1)
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

    def test_repairs_sloppy_feed(self):
        bad = self.RSS.replace(b"Jane Doe", b"Smith & Jones&nbsp;LLC &mdash; AT&T")
        items = sec_feeds.parse_feed(bad, config.SEC_FEEDS[1])
        self.assertIn("Smith & Jones", items[0]["title"])
        self.assertIn("AT&T", items[0]["title"])

    def test_skipped_without_contact(self):
        items, reps = sec_feeds.fetch(None, "2026-11-01", "2026-11-09", "")
        self.assertEqual(items, [])
        self.assertTrue(all(r["status"] == "skipped" for r in reps))


class SeverityTests(unittest.TestCase):
    def test_jarkesy_pattern_is_flagrant(self):
        it = process(fr_doc(title="In the Matter of Acme Corp.; Order Instituting Proceedings",
                            abstract="The Division seeks civil money penalties for fraud under Rule 10b-5."))
        f = it["flags"][0]
        self.assertEqual((f["code"], f["flagrance"], f["tier"]), ("agency_adjudication", 3, 3))
        self.assertEqual(sorted(f["elements_found"]), ["common_law", "contested", "in_house", "penalty"])
        self.assertEqual(it["seriousness"]["points"], 4)      # sanction 3 + reach 1
        self.assertEqual(it["severity"], {"flagrance": 3, "impact": 2, "score": 6})

    def test_large_penalty_is_severe(self):
        it = process(fr_doc(title="In the Matter of Acme Corp.; Order Instituting Proceedings",
                            abstract="The Division seeks a civil penalty of $150 million for fraud."))
        self.assertEqual(it["seriousness"]["level"], 3)       # 3 + 3 + 1

    def test_settled_matter_is_only_arguable(self):
        it = process(fr_doc(title="In the Matter of Acme Corp.; Order Instituting Cease-and-Desist Proceedings",
                            abstract="Acme submitted an offer of settlement and agreed to pay a civil money penalty for fraud."))
        f = it["flags"][0]
        self.assertEqual((f["flagrance"], f["counters"]), (1, ["settled"]))

    def test_fcc_forfeiture_capped_after_fcc_v_att(self):
        doc = fr_doc(title="Acme Wireless; Notice of Apparent Liability for Forfeiture", abstract="civil penalty for fraud",
                     agencies=[{"slug": "federal-communications-commission"}])
        f = [x for x in process(doc, query="fcc")["flags"] if x["code"] == "agency_adjudication"][0]
        self.assertEqual(f["flagrance"], 1)
        self.assertIn("fcc_forfeiture", f["counters"])

    def test_ieepa_tariffs_flagrant(self):
        doc = fr_doc(type="Presidential Document", subtype="Executive Order", title="Imposing Tariffs",
                     abstract="Under the International Emergency Economic Powers Act, a tariff of 25 percent applies.",
                     agencies=[{"slug": "executive-office-of-the-president"}])
        f = [x for x in process(doc, query="president")["flags"] if x["code"] == "presidential_lawmaking"][0]
        self.assertEqual((f["flagrance"], f["tier_authority"]), (3, "learning_resources"))

    def test_rating_at_the_time_for_older_actions(self):
        doc = fr_doc(type="Presidential Document", subtype="Executive Order", title="Imposing Tariffs",
                     abstract="Under the International Emergency Economic Powers Act, a tariff of 25 percent applies.",
                     publication_date="2025-04-03", agencies=[{"slug": "executive-office-of-the-president"}])
        f = [x for x in process(doc, query="president")["flags"] if x["code"] == "presidential_lawmaking"][0]
        self.assertEqual(f["at_the_time"], {"flagrance": 1, "because": "learning_resources"})

    def test_every_issue_has_tested_elements_and_dated_authorities(self):
        from collector import doctrine
        for issue in doctrine.ISSUES:
            self.assertTrue(issue["elements"], issue["code"])
            for key in issue["authorities"] + [r["authority"] for r in issue["tiers"]]:
                self.assertRegex(doctrine.AUTHORITIES[key]["decided"], r"^\d{4}-\d{2}-\d{2}$")

    def test_gag_terms_are_tagged(self):
        it = process(fr_doc(title="In the Matter of Beta LLC; Consent Order",
                            abstract="Respondent agrees not to publicly deny the allegations and to a civil penalty of $2 million."))
        self.assertIn("gag", it["sanctions"])
        self.assertIn("speech_restraint", [f["code"] for f in it["flags"]])
        self.assertEqual(it["outcome"], "settled")


class DatesAndStorageTests(unittest.TestCase):
    def test_signing_date_is_the_action_date(self):
        doc = fr_doc(type="Presidential Document", subtype="Executive Order", title="An order",
                     publication_date="2026-11-12", signing_date="2026-11-07",
                     agencies=[{"slug": "executive-office-of-the-president"}])
        it = federal_register._normalize(doc)
        self.assertEqual((it["date"], it["published"], it["date_basis"]), ("2026-11-07", "2026-11-12", "signed"))

    def test_openfda_uses_classification_date(self):
        rec = {"recall_number": "F-1-2026", "recalling_firm": "A", "product_description": "B", "classification": "Class II",
               "report_date": "20261111", "center_classification_date": "20261104", "_endpoint": "food"}
        it = openfda.normalize(rec, "food")
        self.assertEqual((it["date"], it["published"]), ("2026-11-04", "2026-11-11"))

    def test_old_months_are_archived_with_chart_facts(self):
        import datetime as dt
        with tempfile.TemporaryDirectory() as root:
            it = process(fr_doc(publication_date="2026-01-15"))
            new, months = store.merge_items([it], "2026-11-20T00:00:00", root=root, today=dt.date(2026, 11, 20))
            self.assertEqual((new, months), (1, {"2026-01"}))
            idx = store.finish_storage(store.load_index(root), months, dt.date(2026, 11, 20), root=root)
            self.assertEqual(idx["months"], {"2026-01": 1})
            with open(os.path.join(root, "facts", "2026-01.json")) as f:
                facts = json.load(f)
            self.assertEqual(facts["rows"][0][0], "2026-01-15")

    def test_exchange_fee_filing_is_routine(self):
        it = process(fr_doc(title="Self-Regulatory Organizations; Nasdaq Stock Market LLC; Notice of Filing and Immediate "
                                  "Effectiveness of a Proposed Rule Change To Amend the Exchange's Fee Schedule"))
        self.assertEqual((it["corporation"], it["routine"]), ("other_sro", True))

    def test_backfill_walks_back_month_by_month(self):
        from collector import backfill
        self.assertEqual(backfill._prev_month("2026-01"), "2025-12")
        self.assertEqual(backfill._month_bounds("2024-02"), ("2024-02-01", "2024-02-29"))


class FdaDocketTests(unittest.TestCase):
    def _regs(self, docket, title):
        it = {"id": "regs:x", "source": "regulations_gov", "title": title, "summary": "", "action": "",
              "doc_type": "Other", "docket_ids": [docket], "query_agencies": ["fda"], "date": "2026-11-09"}
        return flag_item(classify(it))

    def test_tobacco_cmp_complaint_is_enforcement(self):
        it = self._regs("FDA-2026-H-1234", "Complaint")
        self.assertEqual(it["category"], "enforcement")
        self.assertIn("civil_penalty", it["sanctions"])
        self.assertEqual(it["flags"][0]["code"], "agency_adjudication")

    def test_supplement_notification_is_other(self):
        it = self._regs("FDA-2026-S-0001", "2026-001040 - Example Inc - Gummies")
        self.assertEqual(it["category"], "other")
        self.assertEqual(it["flags"], [])


class AgencyFeedTests(unittest.TestCase):
    RSS = b"""<?xml version="1.0"?><rss><channel>
      <item><title>FTC Sues Acme Over Deceptive Subscriptions</title><link>https://www.ftc.gov/n/1</link>
        <pubDate>Mon, 09 Nov 2026 10:00:00 -0500</pubDate><description>Complaint seeks civil penalties.</description></item>
      <item><title>FTC to Host Workshop on Data Privacy</title><link>https://www.ftc.gov/n/2</link>
        <pubDate>Mon, 09 Nov 2026 11:00:00 -0500</pubDate></item>
    </channel></rss>"""
    ATOM = b"""<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Decision in Starbucks Corp.</title><link href="https://www.nlrb.gov/case/1"/><id>tag:1</id>
      <updated>2026-11-10T12:00:00Z</updated><summary>Board decision</summary></entry></feed>"""

    def test_keeps_actions_drops_events(self):
        feed = [f for f in config.AGENCY_FEEDS if f["key"] == "nlrb_press"][0]
        items = [i for i in agency_feeds.parse_feed(self.RSS, feed) if agency_feeds.keep(i, feed)]
        self.assertEqual([i["title"] for i in items], ["FTC Sues Acme Over Deceptive Subscriptions"])
        it = flag_item(classify(items[0]))
        self.assertEqual(it["agencies"], ["nlrb"])
        self.assertEqual(it["category"], "enforcement")

    def test_atom_with_fixed_category(self):
        feed = [f for f in config.AGENCY_FEEDS if f["key"] == "nlrb_board"][0]
        it = classify(agency_feeds.parse_feed(self.ATOM, feed)[0])
        self.assertEqual((it["date"], it["category"], it["url"]), ("2026-11-10", "adjudication", "https://www.nlrb.gov/case/1"))

    def test_discovery_only_follows_same_host(self):
        page = (b'<a href="https://evil.example.com/rss.xml">Board Decisions</a>'
                b'<a href="/rss/rssBoard.xml">Board Decisions</a>')

        def opener(req, timeout):
            if req.full_url.endswith("robots.txt"):
                return FakeResponse(b"User-agent: *\nAllow: /\n")
            return FakeResponse(page)
        c = PoliteClient(sleep=lambda s: None, opener=opener)
        feed = [f for f in config.AGENCY_FEEDS if f["key"] == "nlrb_board"][0]
        self.assertEqual(agency_feeds.discover_url(c, feed), "https://www.nlrb.gov/rss/rssBoard.xml")

    def test_new_hosts_allowed_but_finra_still_refused(self):
        for host in ("www.nlrb.gov", "api.fda.gov"):
            self.assertIn(host, config.ALLOWED_HOSTS)
        for host in ("www.finra.org", "www.ftc.gov", "www.fcc.gov"):   # FTC and FCC refuse automated readers
            self.assertNotIn(host, config.ALLOWED_HOSTS)


class OpenFdaTests(unittest.TestCase):
    def test_normalize_and_404_means_no_results(self):
        rec = {"recall_number": "D-0001-2027", "recalling_firm": "Acme Pharma", "product_description": "Tablets",
               "classification": "Class I", "voluntary_mandated": "Voluntary: Firm initiated",
               "reason_for_recall": "Contamination", "report_date": "20261111", "_endpoint": "drug"}
        it = flag_item(classify(openfda.normalize(rec, "drugs")))
        self.assertEqual((it["date"], it["category"], it["outcome"]), ("2026-11-11", "enforcement", "recall"))
        self.assertIn("recall", it["sanctions"])

        def opener(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 404, "nf", {}, None)
        c = PoliteClient(sleep=lambda s: None, opener=opener)
        items, rep = openfda.fetch(c, "2026-11-01", "2026-11-02")
        self.assertEqual((items, rep["status"]), ([], "ok"))


class StoreTests(unittest.TestCase):
    def test_merge_keeps_first_seen_and_window(self):
        import datetime as dt
        with tempfile.TemporaryDirectory() as root:
            it = process(fr_doc())
            day = dt.date(2026, 11, 10)
            self.assertEqual(store.merge_items([dict(it)], "2026-11-09T12:00:00", root=root, today=day)[0], 1)
            self.assertEqual(store.merge_items([dict(it)], "2026-11-10T12:00:00", root=root, today=day)[0], 0)
            with open(os.path.join(root, "days", "2026-11-09.json")) as f:
                saved = json.load(f)["items"][0]
            self.assertEqual(saved["first_seen"], "2026-11-09T12:00:00")

            idx = store.load_index(root)
            today = dt.date(2026, 11, 10)
            self.assertEqual(store.compute_window(idx, today), ("2026-10-11", "2026-11-10"))
            run = {"run_at": "x", "start": "2026-10-11", "end": "2026-11-10", "items_new": 1,
                   "reports": [{"source": "federal_register", "label": "FR", "status": "ok", "detail": "",
                                "agencies": {}}]}
            store.finish_storage(idx, set(), day, root=root)
            idx = store.write_index(idx, run, root=root)
            self.assertEqual(store.compute_window(idx, dt.date(2026, 11, 11)), ("2026-11-07", "2026-11-11"))
            self.assertEqual(idx["days"], {"2026-11-09": 1})


if __name__ == "__main__":
    unittest.main()
