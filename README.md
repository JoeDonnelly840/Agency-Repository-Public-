# RegCollect

RegCollect (formerly RegHunter and Agency Tracker) reports what the federal executive branch has done since you last checked. It sorts each action by agency, kind of action, outcome, and sanction; flags arguable constitutional issues; rates each one for **flagrance** (how clearly existing law condemns it) and **seriousness** (how much is at stake) by a published rubric; and says plainly what it did **not** find or could not check. History reaches back to January 1, 2015.

## How it works

1. **Daily collector** (`collector/run.py`, `.github/workflows/collect.yml`): a small Python program, standard library only, that GitHub runs each morning. It reads official interfaces and published feeds, sorts and flags what it finds, and saves the results in `docs/data/`.
2. **History backfill** (`collector/backfill.py`, `.github/workflows/backfill.yml`): every two hours, walks back one month at a time (about 280 requests per run) through the Federal Register, Regulations.gov, and openFDA until it reaches January 1, 2015. Progress is kept in `docs/data/backfill.json`. When every source shows `"done": true`, the workflow can be disabled under Actions.
3. **Website** (`docs/`): a static page served by GitHub Pages. No outside libraries, services, or trackers; the IBM Plex fonts are stored in `docs/fonts/` under the SIL Open Font License.
   - `app.js`: the directory, agency pages (Activity, Charts, Coverage), constitutional issues, research, methodology, what we track, the manual, and the tour.
   - `search.js`: the research engine (ranked search with a legal thesaurus, word stems, and typo tolerance).
   - `charts.js`: the per-agency chart builder, with PNG, SVG, and CSV export.
   - `assistant.js`: the built-in assistant. It is a set of rules that runs in the browser, operates the app, and answers questions from a help library. It does not use any outside AI service, and nothing typed into it leaves the browser.

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
- `docs/data/facts/YYYY-MM.json`: compact rows used for charts, so a chart of ten years does not download every summary.
- `docs/data/index.json`: the list of files, source health, recent runs, coverage notes, and backfill progress.
- `docs/data/taxonomy.json`: sanctions, outcomes, rating scales, and the doctrine library.

## Sources, and the rules the collector follows

| Source | What it is | Access rules followed |
|---|---|---|
| Federal Register API | Official daily journal of the U.S. government; public API built for programs | No key needed; one request at a time, 2 s apart |
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

`collector/doctrine.py` holds one memo per kind of constitutional issue: the question, the legal test broken into elements, counter-indicators, precedent tiers, authorities with decision dates, and open questions. `DOCTRINE.md` is the same library as a readable document (regenerate it with `python -m collector.doctrine_md`), and the app shows it on the Methodology page.

- **Flagrance** = precedent tier (3: the Supreme Court has held this specific practice unlawful; 2: close analogy or an appeals-court holding; 1: open) combined with the share of the test's elements found in the document. Flagrant needs tier 3 and every element; Substantial needs tier 2 or more and at least half. A counter-indicator caps the rating at Arguable. When the controlling decision came after the action, the rating at the time is also recorded.
- **Seriousness** = points for the sanction (up to 4), money (up to 3), and reach (up to 3). Severe is 6 or more; Significant is 3 to 5; Moderate is 2 or less.

The memos are marked "Draft, not yet reviewed" (`REVIEW_STATUS` in `doctrine.py`). Update that entry after a review.

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

- Flags and search read each document's title and summary, not the full text, so ratings err toward Arguable. A flag is not a legal conclusion, and the absence of a flag is not a clean bill of health.
- Enforcement coverage is partial. FTC and FCC press releases, NLRB decisions, and EPA, Department of Labor, FERC, and HHS-OIG enforcement are not yet connected; see *What we track* in the app for the full list.
- SEC and agency press feeds keep only recent items, so their history starts when RegCollect began reading them.
