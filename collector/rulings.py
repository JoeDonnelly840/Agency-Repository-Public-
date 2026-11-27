"""Known rulings: court decisions about specific agency or presidential actions.

When a court has ruled on the very action RegCollect is rating, that ruling is the best
evidence there is, so it sets the constitutionality rating directly:
  Supreme Court      3 (almost certainly unconstitutional or unlawful)
  Court of appeals   2 (very likely)
  District court     1 (likely)
A ruling that upheld the action is recorded as a weighed factor instead.

Several of these holdings are statutory (the agency or the President exceeded the power
Congress gave). They are included because acting without delegated power is a
separation-of-powers defect, and each one says plainly which kind of holding it is.

Match an action by Federal Register document number ("fr:2015-22842"), executive order
number, or Regulations.gov document ID. Add new rulings at the end of RULINGS and run
python -m collector.reclassify. Verify every citation before relying on it.
"""

LEVEL_BY_COURT = {"supreme": 3, "appeals": 2, "district": 1}
COURT_LABEL = {"supreme": "Supreme Court", "appeals": "Federal court of appeals", "district": "Federal district court"}

AUTHORITIES = {
    "ch_dol_fiduciary": {"cite": "Chamber of Commerce v. U.S. Department of Labor, 885 F.3d 360 (5th Cir. 2018)", "decided": "2018-03-15",
                         "held": "Vacated the Department of Labor's 2016 fiduciary rule in its entirety as exceeding ERISA."},
    "ohio_telecom": {"cite": "Ohio Telecom Ass'n v. FCC, 124 F.4th 993 (6th Cir. 2025)", "decided": "2025-01-02",
                     "held": "Set aside the FCC's 2024 net-neutrality order; broadband is an information service the FCC may not regulate as common carriage."},
    "napfm": {"cite": "National Ass'n of Private Fund Managers v. SEC, 103 F.4th 1097 (5th Cir. 2024)", "decided": "2024-06-05",
              "held": "Vacated the SEC's private fund adviser rules as exceeding its statutory authority."},
    "ryan_ftc": {"cite": "Ryan, LLC v. FTC, 746 F. Supp. 3d 369 (N.D. Tex. 2024)", "decided": "2024-08-20",
                 "held": "Set aside the FTC's non-compete rule as exceeding the FTC's rulemaking authority and as arbitrary and capricious."},
    "texas_dol_2024": {"cite": "Texas v. U.S. Department of Labor, No. 4:24-cv-499 (E.D. Tex. Nov. 15, 2024)", "decided": "2024-11-15",
                       "held": "Vacated the Department of Labor's 2024 overtime rule as exceeding the Fair Labor Standards Act."},
    "nevada_dol": {"cite": "Nevada v. U.S. Department of Labor, 275 F. Supp. 3d 795 (E.D. Tex. 2017)", "decided": "2017-08-31",
                   "held": "Held the Department of Labor's 2016 overtime rule invalid as exceeding the Fair Labor Standards Act."},
    "chamber_nlrb": {"cite": "Chamber of Commerce v. NLRB, No. 6:23-cv-553 (E.D. Tex. Mar. 8, 2024)", "decided": "2024-03-08",
                     "held": "Vacated the NLRB's 2023 joint-employer rule as contrary to common-law agency principles the Act incorporates."},
    "franciscan": {"cite": "Franciscan Alliance, Inc. v. Burwell, 227 F. Supp. 3d 660 (N.D. Tex. 2016)", "decided": "2016-12-31",
                   "held": "Enjoined parts of HHS's 2016 Section 1557 rule, finding them likely contrary to the statute and to RFRA as applied to religious health-care providers."},
    "georgia_wheeler": {"cite": "Georgia v. Wheeler, 418 F. Supp. 3d 1336 (S.D. Ga. 2019)", "decided": "2019-08-21",
                        "held": "Held the 2015 Clean Water Rule unlawful as exceeding the agencies' authority under the Clean Water Act."},
}

RULINGS = [
    {"key": "ieepa_tariffs", "issue": "presidential_lawmaking", "court": "supreme", "authority": "learning_resources", "result": "unlawful",
     "kind": "statutory", "label": "IEEPA tariff orders",
     "summary": "The Supreme Court held that IEEPA does not authorize tariffs, so the duties imposed by these orders lacked legal authority. Tariffs are a power the Constitution gives Congress.",
     "eo": ["14193", "14194", "14195", "14200", "14226", "14227", "14228", "14231", "14232", "14245", "14256", "14257",
            "14259", "14266", "14298", "14316", "14325", "14326", "14334", "14346", "14357", "14358", "14360", "14361", "14384"]},
    {"key": "clean_power_plan", "issue": "major_questions", "court": "supreme", "authority": "west_virginia", "result": "unlawful",
     "kind": "statutory", "label": "Clean Power Plan",
     "summary": "The Supreme Court held that the Clean Power Plan's generation-shifting approach exceeded EPA's authority under section 111(d) of the Clean Air Act (major questions doctrine).",
     "ids": ["fr:2015-22842"]},
    {"key": "eviction_moratorium", "issue": "major_questions", "court": "supreme", "authority": "alabama_realtors", "result": "unlawful",
     "kind": "statutory", "label": "CDC eviction moratorium",
     "summary": "The Supreme Court held that the CDC's nationwide eviction moratorium exceeded its authority under the Public Health Service Act.",
     "ids": ["fr:2020-19654", "fr:2021-02243", "fr:2021-06718", "fr:2021-13842", "fr:2021-16945",
             "regs:CDC-2020-0127-0001", "regs:CDC-2021-0035-0001"]},
    {"key": "osha_ets", "issue": "major_questions", "court": "supreme", "level": 2, "authority": "nfib_osha", "result": "unlawful",
     "kind": "statutory", "label": "OSHA vaccine-or-test emergency standard",
     "summary": "The Supreme Court stayed the standard, holding that challengers were likely to succeed because OSHA likely lacked authority. Because the ruling was a stay rather than a final judgment, it is rated very likely rather than almost certain.",
     "ids": ["fr:2021-23643", "fr:2021-26268", "fr:C1-2021-26268"]},
    {"key": "cms_vaccine", "issue": "major_questions", "court": "supreme", "authority": "biden_missouri", "result": "upheld",
     "kind": "statutory", "label": "CMS health-care staff vaccination rule",
     "summary": "The Supreme Court allowed this rule to take effect, finding it within the Secretary's authority.",
     "ids": ["fr:2021-23831"]},
    {"key": "wotus_2015", "issue": "major_questions", "court": "district", "authority": "georgia_wheeler", "result": "unlawful",
     "kind": "statutory", "label": "2015 Clean Water Rule",
     "summary": "A federal district court held the rule unlawful, and Sackett v. EPA (2023) later rejected the 'significant nexus' approach it relied on.",
     "ids": ["fr:2015-13435"]},
    {"key": "dol_fiduciary", "issue": "major_questions", "court": "appeals", "authority": "ch_dol_fiduciary", "result": "unlawful",
     "kind": "statutory", "label": "Department of Labor fiduciary rule (2016)",
     "summary": "The Fifth Circuit vacated the rule in its entirety as exceeding ERISA.",
     "ids": ["fr:2016-07924"]},
    {"key": "net_neutrality_2024", "issue": "statutory_deference", "court": "appeals", "authority": "ohio_telecom", "result": "unlawful",
     "kind": "statutory", "label": "FCC net-neutrality order (2024)",
     "summary": "The Sixth Circuit, applying Loper Bright without deference, set the order aside as beyond the FCC's statutory authority.",
     "ids": ["fr:2024-10674"]},
    {"key": "private_funds", "issue": "major_questions", "court": "appeals", "authority": "napfm", "result": "unlawful",
     "kind": "statutory", "label": "SEC private fund adviser rules",
     "summary": "The Fifth Circuit vacated the rules as exceeding the SEC's statutory authority.",
     "ids": ["fr:2023-18660"]},
    {"key": "noncompete", "issue": "major_questions", "court": "district", "authority": "ryan_ftc", "result": "unlawful",
     "kind": "statutory", "label": "FTC non-compete rule",
     "summary": "A federal district court set the rule aside nationwide as exceeding the FTC's rulemaking authority.",
     "ids": ["fr:2024-09171"]},
    {"key": "overtime_2024", "issue": "major_questions", "court": "district", "authority": "texas_dol_2024", "result": "unlawful",
     "kind": "statutory", "label": "Department of Labor overtime rule (2024)",
     "summary": "A federal district court vacated the rule as exceeding the Fair Labor Standards Act.",
     "ids": ["fr:2024-08038"]},
    {"key": "overtime_2016", "issue": "major_questions", "court": "district", "authority": "nevada_dol", "result": "unlawful",
     "kind": "statutory", "label": "Department of Labor overtime rule (2016)",
     "summary": "A federal district court held the rule invalid as exceeding the Fair Labor Standards Act.",
     "ids": ["fr:2016-11754"]},
    {"key": "joint_employer_2023", "issue": "major_questions", "court": "district", "authority": "chamber_nlrb", "result": "unlawful",
     "kind": "statutory", "label": "NLRB joint-employer rule (2023)",
     "summary": "A federal district court vacated the rule.",
     "ids": ["fr:2023-23573"]},
    {"key": "section_1557_2016", "issue": "free_exercise", "court": "district", "authority": "franciscan", "result": "unlawful",
     "kind": "statutory and constitutional", "label": "HHS Section 1557 rule (2016)",
     "summary": "A federal district court enjoined parts of the rule, finding them likely contrary to the statute and to RFRA as applied to religious health-care providers.",
     "ids": ["fr:2016-11458"]},
]

_BY_ID = {}
_BY_EO = {}
for _r in RULINGS:
    for _i in _r.get("ids", []):
        _BY_ID.setdefault(_i, []).append(_r)
    for _e in _r.get("eo", []):
        _BY_EO.setdefault(_e, []).append(_r)


def for_item(item):
    """Rulings about this specific action."""
    found = list(_BY_ID.get(item.get("id"), []))
    if item.get("eo_number"):
        found += _BY_EO.get(str(item["eo_number"]), [])
    return found


def export():
    return [{k: r[k] for k in ("key", "issue", "court", "authority", "result", "kind", "label", "summary")}
            | {"court_label": COURT_LABEL[r["court"]], "level": level_of(r), "count": len(r.get("ids", [])) + len(r.get("eo", []))}
            for r in RULINGS]


def level_of(ruling):
    return ruling.get("level") or LEVEL_BY_COURT[ruling["court"]]
