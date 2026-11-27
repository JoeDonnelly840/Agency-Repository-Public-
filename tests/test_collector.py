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

    def test_robots_crawl_delay_only_slows_requests_down(self):
        import urllib.robotparser
        sleeps, t = [], [0.0]
        c = PoliteClient(sleep=lambda s: (sleeps.append(s), t.__setitem__(0, t[0] + s)),
                         clock=lambda: t[0], opener=lambda *a, **k: FakeResponse(b"{}"))
        rp = urllib.robotparser.RobotFileParser(); rp.parse(["User-agent: *", "Crawl-delay: 9"])
        c._robots["www.federalregister.gov"] = rp
        c.get("https://www.federalregister.gov/a", "fr"); c.get("https://www.federalregister.gov/b", "fr")
        self.assertAlmostEqual(sum(sleeps), 9.0)
        rp2 = urllib.robotparser.RobotFileParser(); rp2.parse(["User-agent: *", "Crawl-delay: 0.5"])
        c._robots["www.federalregister.gov"] = rp2; sleeps.clear()
        c.get("https://www.federalregister.gov/c", "fr")
        self.assertAlmostEqual(sum(sleeps), config.MIN_SECONDS_BETWEEN_REQUESTS["www.federalregister.gov"])

    def test_reading_only_runs_get_a_larger_but_bounded_budget(self):
        c = PoliteClient(sleep=lambda s: None, opener=lambda *a, **k: FakeResponse(b"{}"), max_requests=config.DEEPREAD_MAX_REQUESTS)
        self.assertGreater(c.max_requests, config.BACKFILL_MAX_REQUESTS)
        self.assertLessEqual(config.DEEPREAD_MAX_REQUESTS, 600)
        self.assertEqual(PoliteClient().max_requests, config.MAX_REQUESTS_PER_RUN)

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
        f = [x for x in it["flags"] if x["code"] == "agency_adjudication"][0]
        self.assertEqual((f["precedent"], f["level"]), ("open", 0))   # no common-law analogue: a possible issue, not rated
        self.assertIsNone(it["rating"])
        self.assertTrue(f["structural"])

    def test_finra_filing_goes_to_corporations(self):
        it = process(fr_doc(title="Self-Regulatory Organizations; Financial Industry Regulatory Authority, Inc.; "
                                  "Notice of Filing of a Proposed Rule Change To Amend Rule 2165"))
        self.assertEqual(it["corporation"], "finra")
        self.assertEqual(it["category"], "rulemaking")
        self.assertIn("private_delegation", [f["code"] for f in it["flags"]])

    def test_exchange_filing_is_other_sro_low(self):
        it = process(fr_doc(title="Self-Regulatory Organizations; Nasdaq Stock Market LLC; Notice of Filing"))
        self.assertEqual(it["corporation"], "other_sro")
        self.assertEqual(it["priority"], 0)   # an open private-delegation question is listed, not rated

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
        self.assertIsNone(it["rating"])        # directing agencies is lawful after Slaughter: not rated

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


class RatingTests(unittest.TestCase):
    def test_jarkesy_pattern_is_near_certain(self):
        it = process(fr_doc(title="In the Matter of Acme Corp.; Order Instituting Proceedings",
                            abstract="The Division seeks civil money penalties for fraud under Rule 10b-5."))
        f = it["flags"][0]
        self.assertEqual((f["code"], f["level"], f["precedent"], f["authority"]), ("agency_adjudication", 3, "direct", "jarkesy"))
        self.assertEqual(sorted(f["elements_found"]), ["common_law", "in_house", "penalty"])
        self.assertEqual(it["rating"], {"level": 3, "issues": 1})
        self.assertEqual((it["impact"]["points"], it["impact"]["level"]), (4, 2))   # sanction 3 + reach 1: Significant Impact

    def test_impact_never_changes_the_rating(self):
        small = process(fr_doc(title="In the Matter of Acme Corp.; Order Instituting Proceedings",
                               abstract="The Division seeks civil money penalties for fraud."))
        big = process(fr_doc(title="In the Matter of Acme Corp.; Order Instituting Proceedings",
                             abstract="The Division seeks a civil penalty of $150 million for fraud."))
        self.assertEqual(big["impact"]["level"], 3)            # 3 + 3 + 1 = 7: Serious Impact
        self.assertEqual(small["rating"], big["rating"])

    def test_impact_thresholds(self):
        from collector import doctrine
        lv = lambda pts: 3 if pts >= 7 else 2 if pts >= 4 else 1   # noqa: E731
        for sanctions, money, expect in ((["warning"], "", 1), (["civil_penalty"], "", 2), (["criminal"], "$200 million", 3)):
            item = {"sanctions": sanctions, "category": "enforcement"}
            level, points, _ = doctrine.impact(item, money)
            self.assertEqual((level, lv(points)), (expect, expect))

    def test_settlement_is_noted_but_does_not_lower_the_rating(self):
        it = process(fr_doc(title="In the Matter of Acme Corp.; Order Instituting Cease-and-Desist Proceedings",
                            abstract="Acme submitted an offer of settlement and agreed to pay a civil money penalty for fraud."))
        f = it["flags"][0]
        self.assertEqual((f["level"], f["weighed"]), (3, ["settled"]))

    def test_practice_the_supreme_court_upheld_is_a_possible_issue_with_the_reason(self):
        doc = fr_doc(title="Acme Wireless; Notice of Apparent Liability for Forfeiture; administrative law judge",
                     abstract="civil penalty for fraud", agencies=[{"slug": "federal-communications-commission"}])
        f = [x for x in process(doc, query="fcc")["flags"] if x["code"] == "agency_adjudication"][0]
        self.assertEqual((f["level"], f["unrated_by"]), (0, "fcc_forfeiture"))   # FCC v. AT&T upheld FCC forfeitures

    def test_weighed_factor_lowers_one_step_but_never_below_likely(self):
        doc = fr_doc(title="In the Matter of Acme Customs Brokers; Order Instituting Proceedings",
                     abstract="The Division seeks civil money penalties for fraud in customs duty declarations.",
                     agencies=[{"slug": "federal-trade-commission"}])
        f = [x for x in process(doc, query="ftc")["flags"] if x["code"] == "agency_adjudication"][0]
        self.assertIn("public_rights", f["weighed"])
        self.assertEqual(f["level"], 1)                        # close analogy with every element (2), lowered one step

    def test_ieepa_tariffs_near_certain(self):
        doc = fr_doc(type="Presidential Document", subtype="Executive Order", title="Imposing Tariffs",
                     abstract="Under the International Emergency Economic Powers Act, a tariff of 25 percent applies to imported goods.",
                     agencies=[{"slug": "executive-office-of-the-president"}])
        it = process(doc, query="president")
        f = [x for x in it["flags"] if x["code"] == "presidential_lawmaking"][0]
        self.assertEqual((f["level"], f["authority"]), (3, "learning_resources"))
        self.assertIn("ieepa", it["statutes"])

    def test_rated_under_todays_law_with_note_about_the_time(self):
        doc = fr_doc(type="Presidential Document", subtype="Executive Order", title="Imposing Tariffs",
                     abstract="Under the International Emergency Economic Powers Act, a tariff of 25 percent applies to imported goods.",
                     publication_date="2025-04-03", agencies=[{"slug": "executive-office-of-the-president"}])
        f = [x for x in process(doc, query="president")["flags"] if x["code"] == "presidential_lawmaking"][0]
        self.assertEqual(f["level"], 3)
        self.assertEqual(f["at_the_time"], {"level": 1, "because": "learning_resources"})

    def test_known_ruling_sets_the_rating(self):
        doc = fr_doc(type="Presidential Document", subtype="Executive Order", title="Regulating Imports With a Reciprocal Tariff",
                     publication_date="2025-04-07", executive_order_number=14257, agencies=[{"slug": "executive-office-of-the-president"}])
        f = [x for x in process(doc, query="president")["flags"] if x["code"] == "presidential_lawmaking"][0]
        self.assertEqual((f["level"], f["ruling"]), (3, "ieepa_tariffs"))
        cpp = process(fr_doc(document_number="2015-22842", type="Rule", title="Carbon Pollution Emission Guidelines",
                             agencies=[{"slug": "environmental-protection-agency"}]), query="epa")
        self.assertEqual(cpp["rating"]["level"], 3)

    def test_ruling_that_upheld_an_action_is_weighed(self):
        it = process(fr_doc(document_number="2021-23831", type="Rule", title="Omnibus COVID-19 Health Care Staff Vaccination",
                            significant=True, agencies=[{"slug": "health-and-human-services-department"}]), query="hhs")
        f = [x for x in it["flags"] if x["code"] == "major_questions"][0]
        self.assertIn("upheld_by_court", f["weighed"])

    def test_gas_station_named_chevron_is_not_chevron_deference(self):
        it = process(fr_doc(title="CTP CMP Case re King Chevron Food Mart, Inc.", type="Notice"))
        self.assertNotIn("statutory_deference", [f["code"] for f in it["flags"] if f["level"]])

    def test_withdrawals_do_not_raise_what_they_withdraw(self):
        it = process(fr_doc(type="Rule", title="COVID-19 Vaccination and Testing; Emergency Temporary Standard; Withdrawal of the vaccination and testing ETS",
                            significant=True, agencies=[{"slug": "labor-department"}]), query="dol")
        self.assertEqual(it["flags"], [])

    def test_free_exercise_and_rfra(self):
        it = process(fr_doc(type="Rule", title="Health Coverage Mandate",
                            abstract="All employers, including religious organizations, must provide coverage; the rule removes the religious exemption and provides exemptions for secular small businesses.",
                            agencies=[{"slug": "health-and-human-services-department"}]), query="hhs")
        f = [x for x in it["flags"] if x["code"] == "free_exercise"][0]
        self.assertGreaterEqual(f["level"], 1)
        self.assertIn(f["precedent"], ("analogy", "direct"))

    def test_every_issue_has_gates_and_dated_authorities_and_three_precedent_levels(self):
        from collector import doctrine
        for issue in doctrine.ISSUES:
            self.assertTrue(any(e.get("gate") for e in issue["elements"]), issue["code"])
            self.assertEqual(issue["precedent"][-1]["level"], "open", issue["code"])
            for r in issue["precedent"]:
                self.assertIn(r["level"], doctrine.STRENGTH)
            for key in issue["authorities"] + [r["authority"] for r in issue["precedent"]]:
                self.assertRegex(doctrine.AUTHORITIES[key]["decided"], r"^\d{4}-\d{2}-\d{2}$")
        from collector import rulings
        for r in rulings.RULINGS:
            self.assertIn(r["authority"], doctrine.AUTHORITIES)
            self.assertIn(r["issue"], doctrine.ISSUE_BY_CODE)

    def test_gag_terms_are_tagged(self):
        it = process(fr_doc(title="In the Matter of Beta LLC; Consent Order",
                            abstract="Respondent agrees not to publicly deny the allegations and to a civil penalty of $2 million."))
        self.assertIn("gag", it["sanctions"])
        self.assertIn("speech_restraint", [f["code"] for f in it["flags"]])
        self.assertEqual(it["outcome"], "settled")


class FullTextTests(unittest.TestCase):
    RAW = ("<html><body><pre>Executive Order 14257. By the authority vested in me as President by the Constitution and the laws of the "
           "United States, including the International Emergency Economic Powers Act (50 U.S.C. 1701 et seq.), it is hereby ordered: "
           + "filler words about trade. " * 200 + "All articles imported shall be subject to an additional ad valorem rate of duty of 10 percent."
           + " more filler." * 100 + "</pre></body></html>")

    def test_extract_keeps_short_passages_and_statutes(self):
        from collector import fulltext
        r = fulltext.extract(self.RAW)
        self.assertIn("ieepa", r["cites"])
        self.assertTrue(r["ev"])
        self.assertTrue(all(len(p) < 700 for p in r["ev"]))
        self.assertTrue(any("ad valorem" in p for p in r["ev"]))
        self.assertLess(sum(len(p) for p in r["ev"]), len(self.RAW))

    def test_full_text_evidence_changes_the_rating_and_is_marked(self):
        from collector import fulltext
        doc = fr_doc(type="Presidential Document", subtype="Executive Order", title="Regulating Imports With a Reciprocal Tariff",
                     agencies=[{"slug": "executive-office-of-the-president"}])
        before = process(doc, query="president")
        self.assertIsNone(before["rating"])
        item = federal_register._normalize(doc)
        item["query_agencies"] = ["president"]
        classify(item)
        fulltext.record_on_item(item, {**fulltext.extract(self.RAW), "v": fulltext.FT_VERSION, "read": "2026-11-27"})
        after = flag_item(item)
        f = [x for x in after["flags"] if x["code"] == "presidential_lawmaking"][0]
        self.assertEqual(f["level"], 3)
        self.assertIn("no_clear_authority", f["full_text_elements"])
        self.assertEqual(item["ft"]["v"], fulltext.FT_VERSION)

    def test_raw_text_url_is_on_the_federal_register_host(self):
        from collector import fulltext
        url = fulltext.raw_text_url({"id": "fr:2025-06063", "published": "2025-04-07"})
        self.assertEqual(url, "https://www.federalregister.gov/documents/full_text/text/2025/04/07/2025-06063.txt")
        self.assertIn("www.federalregister.gov", config.ALLOWED_HOSTS)

    def test_read_checks_robots_and_reports_missing_text(self):
        from collector import fulltext
        calls = []

        class Client:
            def get(self, url, source, check_robots=False, not_found_ok=False):
                calls.append((url, check_robots))
                return b""
        rec = fulltext.read_one(Client(), {"id": "fr:2025-06063", "published": "2025-04-07"})
        self.assertTrue(calls[0][1])
        self.assertEqual(rec["error"], "no plain-text version")

    def test_sweep_is_resumable_and_respects_budget(self):
        from collector import fulltext

        class Client:
            n = 0

            def get_json(self, url, source):
                Client.n += 1
                return {"results": [{"document_number": "2025-06063", "excerpts": "the <span class='match'>International Emergency Economic Powers Act</span> ..."}]}
        found, used, nxt = fulltext.sweep(Client(), "2025-01-01", "2025-12-31", budget=5)
        self.assertLessEqual(used, 5)
        self.assertIsNotNone(nxt)
        self.assertIn("ieepa", found["2025-06063"]["terms"])
        found2, used2, nxt2 = fulltext.sweep(Client(), "2025-01-01", "2025-12-31", budget=999, first_term=nxt)
        self.assertIsNone(nxt2)

    def test_evidence_files_round_trip(self):
        from collector import fulltext
        with tempfile.TemporaryDirectory() as root:
            it = {"id": "fr:2025-06063", "published": "2025-04-07", "source": "federal_register"}
            fulltext.save_records([it], {"fr:2025-06063": {"v": 1, "read": "2026-11-27", "ev": ["a passage"], "cites": ["ieepa"]}}, root)
            fresh = dict(it)
            fulltext.attach([fresh], root)
            self.assertEqual(fresh["_ev"], ["a passage"])
            self.assertEqual(fresh["ft"]["v"], 1)


class MethodologyReviewTests(unittest.TestCase):
    """One test for each problem found in the November 2026 review of the methodology."""

    def test_settled_sec_fraud_case_is_unchanged(self):        # item 8: kept as it was, by the owner's choice
        it = process(fr_doc(title="In the Matter of X; Order Instituting Cease-and-Desist Proceedings, Making Findings, and Imposing a Civil Penalty",
                            abstract="Respondent consented to the entry of the order. The order finds X made misleading statements and imposes a civil money penalty."))
        f = [x for x in it["flags"] if x["code"] == "agency_adjudication"][0]
        self.assertEqual((f["level"], f["weighed"]), (3, ["settled"]))

    def test_ratification_is_a_cure_not_a_violation(self):      # item 6
        it = process(fr_doc(type="Notice", title="Ratification of Appointment of Administrative Law Judges",
                            abstract="The Commission ratifies the appointment of its administrative law judges to resolve any Appointments Clause concerns."))
        self.assertNotIn("officer_appointment_removal", [f["code"] for f in it["flags"]])
        self.assertIsNone(it["rating"])

    def test_unappointed_judge_is_still_flagged(self):
        it = process(fr_doc(type="Notice", title="Order on Remand",
                            abstract="The administrative law judge who issued the initial decision was not properly appointed."))
        f = [x for x in it["flags"] if x["code"] == "officer_appointment_removal"][0]
        self.assertGreaterEqual(f["level"], 2)

    def test_chevron_reliance_is_rated_likely_at_most(self):     # item 3
        it = process(fr_doc(type="Rule", title="Definition of Term", publication_date="2019-05-01",
                            abstract="The agency's interpretation is reasonable and entitled to Chevron deference because the statute is ambiguous."))
        f = [x for x in it["flags"] if x["code"] == "statutory_deference"][0]
        self.assertEqual((f["level"], f["capped"]), (1, 1))
        self.assertEqual(f["at_the_time"]["because"], "loper_bright")

    def test_chevron_the_company_is_not_chevron_deference(self):
        it = process(fr_doc(type="Notice", title="Clean Air Act Operating Permit Program; Petition for Objection To Proposed Permit for Chevron U.S.A. Inc. Refinery",
                            abstract="The petition asks EPA to object to a permit; the Administrator interprets the regulations."))
        self.assertNotIn("statutory_deference", [f["code"] for f in it["flags"] if f["level"]])

    def test_post_loper_bright_discussion_is_not_rated(self):
        it = process(fr_doc(type="Rule", title="Updating Certification Regulations", publication_date="2026-01-15",
                            abstract="Following Loper Bright, the agency no longer relies on Chevron deference and adopts the best reading of the statute."))
        f = [x for x in it["flags"] if x["code"] == "statutory_deference"][0]
        self.assertEqual((f["level"], f["unrated_by"]), (0, "post_loper"))

    def test_due_process_does_not_apply_to_rules_of_general_application(self):   # item 4
        it = process(fr_doc(type="Rule", title="Interim Final Rule; Revisions to Licensing Fees",
                            abstract="This interim final rule is immediately effective. Licenses that are not renewed will be revoked."))
        self.assertNotIn("due_process_takings", [f["code"] for f in it["flags"]])

    def test_due_process_applies_to_actions_against_particular_parties(self):
        it = process(fr_doc(type="Notice", title="In the Matter of Acme Securities; Order of Summary Suspension of Registration",
                            abstract="The Commission suspended the registration of the broker-dealer without a prior hearing, effective immediately."))
        self.assertEqual([f["level"] for f in it["flags"] if f["code"] == "due_process_takings"], [1])

    def test_rule_granting_physical_access_is_a_takings_issue(self):
        it = process(fr_doc(type="Rule", title="Access to agricultural employers' property",
                            abstract="The rule grants union organizers a right to enter employers' property for three hours per day.",
                            agencies=[{"slug": "labor-department"}]), query="dol")
        f = [x for x in it["flags"] if x["code"] == "due_process_takings"][0]
        self.assertEqual((f["level"], f["authority"]), (2, "cedar_point"))

    def test_waiver_congress_authorized_is_not_executive_lawmaking(self):   # item 5
        it = process(fr_doc(type="Presidential Document", subtype="Memorandum", title="Waiver of Jones Act requirements",
                            abstract="Pursuant to the waiver authority Congress provided, I waive the requirements of section 27 for vessels carrying fuel.",
                            agencies=[{"slug": "executive-office-of-the-president"}]), query="president")
        self.assertEqual([f for f in it["flags"] if f["level"]], [])

    def test_refusing_to_enforce_a_statute_is_executive_lawmaking(self):
        it = process(fr_doc(type="Presidential Document", subtype="Executive Order", title="Pausing Enforcement",
                            abstract="The Attorney General shall not enforce the Act for 75 days, and companies shall not be penalized.",
                            agencies=[{"slug": "executive-office-of-the-president"}]), query="president")
        f = [x for x in it["flags"] if x["code"] == "presidential_lawmaking"][0]
        self.assertEqual((f["level"], f["authority"]), (1, "clinton_ny"))

    def test_section_232_tariffs_alone_are_not_rated(self):
        it = process(fr_doc(type="Presidential Document", subtype="Proclamation", title="Adjusting Imports of Steel Into the United States",
                            abstract="Under section 232 of the Trade Expansion Act of 1962, an additional ad valorem duty applies to imported steel articles.",
                            agencies=[{"slug": "executive-office-of-the-president"}]), query="president")
        self.assertEqual([f for f in it["flags"] if f["level"]], [])

    def test_full_text_words_cannot_inflate_a_rating(self):     # item 1
        from collector import fulltext
        doc = fr_doc(type="Rule", title="Energy Conservation Standards for Refrigerators", significant=True,
                     agencies=[{"slug": "environmental-protection-agency"}])
        item = federal_register._normalize(doc)
        item["query_agencies"] = ["epa"]
        classify(item)
        flag_item(item)
        self.assertIsNone(item["rating"])
        boiler = ("Commenters said this unprecedented, economically significant rule rests on our general rulemaking authority and "
                  "will for the first time set nationwide standards. " * 3) + " filler" * 600
        fulltext.record_on_item(item, {**fulltext.extract(boiler), "v": fulltext.FT_VERSION, "read": "2026-11-27"})
        flag_item(item)
        f = [x for x in item["flags"] if x["code"] == "major_questions"][0]
        self.assertLessEqual(f["level"], 1)                     # preamble passages can support Likely at most

    def test_issue_must_appear_in_operative_text(self):
        from collector import fulltext
        doc = fr_doc(type="Rule", title="Hospital Payment Updates", agencies=[{"slug": "health-and-human-services-department"}])
        item = federal_register._normalize(doc)
        item["query_agencies"] = ["hhs"]
        classify(item)
        fulltext.record_on_item(item, {**fulltext.extract("Commenters objected to race-based preferences and racial quotas in other programs. " + " filler" * 600),
                                       "v": fulltext.FT_VERSION, "read": "2026-11-27"})
        flag_item(item)
        self.assertIsNone(item["rating"])

    def test_operative_regulatory_text_supports_higher_ratings(self):
        from collector import fulltext
        raw = (" preamble words" * 800 + " List of Subjects in 29 CFR Part 1910. For the reasons stated, OSHA amends 29 CFR part 1910 as follows: "
               "All employers with 100 or more employees must comply with this emergency temporary standard, issued under 29 U.S.C. 655(c), "
               "which is unprecedented in reach and imposes nationwide requirements.")
        rec = fulltext.extract(raw)
        self.assertTrue(rec["opev"])

    def test_recalls_are_not_speech_cases_and_gagne_is_not_a_gag(self):
        it = process(fr_doc(type="Notice", title="Brendon Gagne: Final Debarment Order",
                            abstract="FDA is issuing an order debarring Brendon Gagne for 5 years."))
        self.assertNotIn("speech_restraint", [f["code"] for f in it["flags"]])

    def test_routine_state_plan_approvals_are_not_federalism_flags(self):
        it = process(fr_doc(type="Rule", title="Air Plan Approval; Vermont; Regional Haze Five-Year Progress Report",
                            abstract="EPA approves the State's plan; states must submit progress reports.",
                            agencies=[{"slug": "environmental-protection-agency"}]), query="epa")
        self.assertNotIn("federalism", [f["code"] for f in it["flags"]])

    def test_religion_needs_a_real_burden(self):
        it = process(fr_doc(type="Rule", title="Grants program requirements",
                            abstract="Faith-based organizations may apply; awards are made on the merits.",
                            agencies=[{"slug": "health-and-human-services-department"}]), query="hhs")
        self.assertEqual([f for f in it["flags"] if f["code"] == "free_exercise" and f["level"]], [])

    def test_establishment_clause_and_rluipa_are_checked(self):
        est = process(fr_doc(type="Rule", title="Exemptions for Religious Employers",
                             abstract="The rule provides exemptions that distinguish between denominations, requiring religious employers to meet a religious test.",
                             agencies=[{"slug": "labor-department"}]), query="dol")
        f = [x for x in est["flags"] if x["code"] == "free_exercise"][0]
        self.assertEqual(f["authority"], "catholic_charities")
        pr = process(fr_doc(type="Rule", title="Federal Detention Standards",
                            abstract="Detainees must comply with grooming rules that prohibit religious beards; no religious exemption is available.",
                            agencies=[{"slug": "health-and-human-services-department"}]), query="hhs")
        f = [x for x in pr["flags"] if x["code"] == "free_exercise"][0]
        self.assertEqual(f["authority"], "holt")
        self.assertGreaterEqual(f["level"], 1)

    def test_factual_disclosures_are_weighed_under_zauderer(self):
        it = process(fr_doc(type="Rule", title="Fee Disclosure Rule",
                            abstract="Firms must disclose fees. This compelled disclosure is purely factual and uncontroversial, though critics call it controversial opinion.",
                            agencies=[{"slug": "federal-trade-commission"}]), query="ftc")
        f = [x for x in it["flags"] if x["code"] == "free_speech"][0]
        self.assertIn("factual_disclosure", f["weighed"])

    def test_court_rulings_carry_cautions_and_memos_match_code(self):
        from collector import doctrine, rulings
        cautioned = {r["key"] for r in rulings.RULINGS if r.get("caution")}
        self.assertTrue({"osha_ets", "wotus_2015", "dol_fiduciary"} <= cautioned)
        self.assertIn("narrow", doctrine.AUTHORITIES["cook"]["held"])
        for issue in doctrine.ISSUES:
            for w in issue.get("weighed", []):
                self.assertIn(w["effect"], ("lowers", "noted", "unrates"))
            ex = doctrine.export()["doctrine"]["issues"]
            self.assertTrue(all("effect" in w for i in ex for w in i["weighed"]))


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

    def test_fact_rows_list_rated_and_possible_issues_separately(self):
        it = {"date": "2026-01-15", "agencies": ["fda"], "category": "enforcement", "subcategory": "Enforcement notice",
              "outcome": "charged", "sanctions": ["civil_penalty"], "rating": {"level": 2}, "impact": {"level": 1},
              "flags": [{"code": "agency_adjudication", "level": 2}, {"code": "due_process_takings", "level": 0}]}
        row = store.fact_row(it, {})
        self.assertEqual((row[6], row[7], row[10]), (["agency_adjudication"], 2, ["due_process_takings"]))

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
