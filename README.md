# RegCollect

RegCollect (formerly RegHunter and Agency Tracker) reports what the federal executive branch has done since you last checked. It sorts each action by agency, kind of action, outcome, and sanction; reads the full text of the most important documents; rates each legal issue on one scale, **lawfulness** (almost certainly, very likely, or likely unlawful under today's law: unconstitutional, or beyond the powers the Constitution and Congress grant), by a published rubric and known court rulings; lists weaker matches as possible issues, so public-interest lawyers can find leads worth a closer look; notes **impact** for context without letting it affect the rating; and says plainly what it did **not** find or could not check. History reaches back to January 1, 2015.

## How it works

1. **Daily collector** (`collector/run.py`, `.github/workflows/collect.yml`): a small Python program, standard library only, that GitHub runs each morning. It reads official interfaces and published feeds, sorts and flags what it finds, and saves the results in `docs/data/`.
2. **History backfill** (`collector/backfill.py`, `.github/workflows/backfill.yml`): every two hours, walks back one month at a time (about 280 requests per run) through the Federal Register, Regulations.gov, and openFDA until it reaches January 1, 2015. Progress is kept in `docs/data/backfill.json`. Leftover requests, and every run once history is complete, go to full-text reading of history (`collector/deepread.py`, progress in `docs/data/deepread.json`). Keep this workflow enabled until both are complete.
3. **Full-text reading** (`collector/fulltext.py`): the Federal Register's own full-text search is asked about about 30 legal terms (IEEPA, Chevron, RFRA, the Seventh Amendment, and others), and the plain text of presidential documents, flagged actions, and significant rules is read in full. Only short passages around the phrases the legal tests look for are kept, in `docs/data/evidence/<YYYY-MM>.json`.
4. **Website** (`docs/`): a static page served by GitHub Pages. No outside libraries, services, or trackers; the IBM Plex fonts are stored in `docs/fonts/` under the SIL Open Font License.
   - `app.js`: the directory, agency pages (Activity, Charts, Coverage), constitutional issues, research, methodology, what we track, the manual, and the tour.
   - `search.js`: the research engine (ranked search with a legal thesaurus, word stems, and typo tolerance).
   - `charts.js`: the per-agency chart builder (stacked bars or lines over time by day, week, month, quarter, or year; totals; share), with a two-tier date axis, partial periods marked, and PNG, SVG, and CSV export that carry the chart's own title, legend, and notes.
   - `assistant.js` and `curt-script.js`: Curt, the built-in assistant, in a chat bubble that can be minimized. He reads a question into a structured query (agencies, period, kind of action, rating, legal issue, sanction, statute, case name, topic words) and answers from the data: counts with breakdowns, lists of the latest or most likely unlawful actions, which agency has the most, comparisons, summaries, period digests ("what happened this week?"), starting points for a challenge, and why an action or a court-ruled action was rated. He keeps context for follow-ups ("what about the FTC?", "and in 2022?"), operates the app (pages, filters, charts, dates, the tour), handles small things (the date, arithmetic), and answers questions about the app, the rubric, and the law from a long prepared script plus entries generated from the doctrine library. Long-period questions are answered from the compact fact rows, so they don't download the whole archive. He uses no outside AI service, never reads other websites, and nothing typed into him leaves the browser. To teach him something, add an entry to `curt-script.js`.

## Dates

Every action is dated by the agency's own action, never by when RegCollect collected it:

| Source | Action date | Also kept |
|---|---|---|
| Federal Register | Signing date when the Federal Register records one (for example, executive orders); otherwise the publication date | Publication date |
| Regulations.gov | Posted date | |
| SEC and agency feeds | Release date | |
| openFDA recalls | FDA's classification date | Report date |

Each item has `date` (the action date), `date_basis` (signed, posted, released, classified, or published), and `published`. Items are filed by publication date so they never move between files.

## Storage

- `docs/data/days/YYYY-MM-DD.json`: the last 70 days, one file per publication day.
- `docs/data/months/YYYY-MM.json`: older items, one compact file per month.
- `docs/data/facts/YYYY-MM.json`: compact rows (date, bodies, kind, type, outcome, sanctions, rated issues, rating, impact, routine, possible issues) used for charts and for Curt's counts, so a chart or count over ten years does not download every summary.
- `docs/data/index.json`: the list of files, source health, recent runs, coverage notes, and backfill progress.
- `docs/data/taxonomy.json`: sanctions, outcomes, rating scales, the doctrine library, and known rulings.
- `docs/data/evidence/YYYY-MM.json`: short passages from full texts, loaded only when you open "Why flagged".

## Sources, and the rules the collector follows

| Source | What it is | Access rules followed |
|---|---|---|
| Federal Register API | Official daily journal of the U.S. government; public API built for programs | No key needed; one request at a time, 2 s apart |
| Federal Register full text | Full-text search (`conditions[term]`) and each document's plain-text version (`raw_text_url`) | Same host and pauses; robots.txt checked before plain-text reads; only short passages are kept |
| Regulations.gov API (v4, read-only) | Documents posted to Regulations.gov | Free api.data.gov key; read-only "documents" endpoint only; 4 s between requests |
| SEC RSS feeds | Litigation releases and administrative proceedings | SEC fair-access policy: declared User-Agent with contact email, robots.txt checked, one request per feed per day |
| openFDA | FDA recall enforcement reports | Official public API; a few requests a day, 3 s apart; data is public domain |
| Agency website feeds | NLRB, FDA, and CFPB press releases | Only RSS feeds the agencies publish for subscribers; robots.txt checked first; one request per feed per day, 6 s apart; items kept only if they describe an action |

The FTC and FCC feeds were removed because those sites refuse automated readers. The NLRB decision feeds are switched off (`"enabled": False` in `config.py`) until their addresses are confirmed.

Safety rules enforced in `collector/http_client.py` and covered by the tests in `tests/`:

- Only the hosts listed in `ALLOWED_HOSTS` (`collector/config.py`) can be contacted. Any other address, including FINRA's site, is refused in code.
- GET requests only: nothing is ever submitted, posted, or changed.
- One request at a time, with a pause between requests, a request ceiling per run, and an 8 MB cap on any response.
- "Slow down" responses (429 and 503) are obeyed. A source that keeps failing is switched off for the rest of the run.
- robots.txt is checked before any ordinary web page or feed is read; if a site disallows it, the source is skipped and the app says so.

## Ratings and the doctrine library

`collector/doctrine.py` holds one memo per kind of legal issue: the question, the legal test broken into elements (with "gate" elements that must appear before an issue is rated), precedent rules sorted into three levels (direct holding, close analogy, open question), weighed factors, authorities with decision dates, and open questions. `collector/rulings.py` lists court rulings on specific actions (for example, the IEEPA tariff orders, the Clean Power Plan, and the CDC eviction moratorium). `DOCTRINE.md` is the same library as a readable document (regenerate it with `python -m collector.doctrine_md`), and the app shows it on the Methodology page.

- **Lawfulness** is the only rating, shown as Likely unlawful, Very likely unlawful, or Near certain (almost certainly unlawful). It covers constitutional violations and actions taken without power the Constitution or Congress granted; it does not screen ordinary statutory or procedural claims.
  - Near certain: a direct holding and every element; very likely: a direct holding with at least half the elements, or a close analogy with every element; likely: any other rated issue. The two higher levels need the key elements in the document's summary or operative text (the regulatory text, or the order itself); elements found only in passages elsewhere in the full text support at most Likely.
  - Issues without their gate elements, or with only weak elements, are listed as possible issues and not rated. So is a practice the Supreme Court has upheld (for example FCC forfeitures after FCC v. AT&T), with the reason.
  - Weighed factors (such as a contrary holding) lower a rating one step but never below Likely; settlements are noted only. Ratifications by a properly appointed official are treated as cures, not defects.
  - Rules that rested on Chevron deference are rated no higher than Likely, with a note that they were lawful under the precedent at the time (Loper Bright, 2024). Due-process issues are screened only for actions against particular parties, and physical-access takings for rules (Cedar Point). Executive lawmaking is screened for explicit suspension or non-enforcement of a statute or a claimed power the statute lacks; waivers Congress authorized are excluded.
  - A court ruling on the action itself sets the rating (Supreme Court 3, court of appeals 2, district court 1) and the flag shows what the court held; rulings that only stayed an action or came from a lower court carry a caution.
  - Ratings apply today's law, with a note when the action may have been lawful under the precedent at the time.
- **Impact** = points for the sanction (up to 4), money (up to 3), and reach (up to 3): Lower Impact 1 to 3, Significant Impact 4 to 6, Serious Impact 7 or more. It is context only: it is not color-coded and never affects the rating or the order of results.
- Rating names are set in one place, `SCALES` in `collector/flags.py`.
- When the rating rules change (`RUBRIC_VERSION` in `doctrine.py`), the next daily run re-rates every stored item automatically.

The memos are marked "Draft, not yet reviewed" (`REVIEW_STATUS` in `doctrine.py`). Update that entry after a review.

### Reviews

Open "Why flagged" on any action to record your view of a rating. Download your reviews from the Methodology page and save them as `review/labels.json`; each daily run reports how often the current rubric agrees with them (`python -m collector.reviews`).

## One-time setup

1. **Website:** Settings → Pages → "Deploy from a branch", branch `main`, folder `/docs`.
2. **Secrets:** Settings → Secrets and variables → Actions:
   - `REGULATIONS_GOV_API_KEY`: your api.data.gov key.
   - `SEC_CONTACT_EMAIL` (optional): sent only in request headers to the SEC, never published.
   - `DOL_API_KEY` (later): for Department of Labor enforcement data once that source is added.
3. **First run:** Actions → "Collect agency data" → Run workflow. The backfill starts on its own schedule; it can also be started from Actions → "Fill history back to 2015".

## Changing things

- **Add an agency:** add an entry to `AGENCIES` in `collector/config.py`.
- **Add a state agency later:** items carry `"jurisdiction": "federal"`, and `JURISDICTIONS` in `config.py` lists the planned `state` group.
- **Tune ratings:** `collector/doctrine.py`. **Tune sanction types and outcomes:** `collector/taxonomy.py`.
- **Re-sort stored data after changing the rules:** `python -m collector.reclassify`
- **Run the tests:** `python -m unittest discover tests`

## Limitations

- Full texts are read for Federal Register documents only, most important first; Regulations.gov attachments, press releases, and recall reports are rated from titles and summaries. A flag is not a legal conclusion, and the absence of a flag is not a clean bill of health.
- Enforcement coverage is partial. FTC and FCC press releases, NLRB decisions, and EPA, Department of Labor, FERC, and HHS-OIG enforcement are not yet connected; see *What we track* in the app for the full list.
- SEC and agency press feeds keep only recent items, so their history starts when RegCollect began reading them.
