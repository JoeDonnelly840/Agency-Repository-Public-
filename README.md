# RegHunter

RegHunter (formerly Agency Tracker) reports what the federal executive branch has done since you last checked. It sorts each action by agency, kind of action, outcome and sanction, flags arguable constitutional problems, rates each one for **clarity** (how flagrant) and **seriousness** (how much is at stake) on a red–orange–yellow scale, and says plainly what it did **not** find or could not check.

## How it works

1. **Collector** (`collector/`): a small Python program, standard library only, that GitHub runs once a day (`.github/workflows/collect.yml`). It reads official interfaces and published feeds, sorts and flags what it finds, and saves the results in `docs/data/`.
2. **Website** (`docs/`): a static page served by GitHub Pages. No outside libraries, fonts or trackers.
   - `app.js`: the directory home screen, agency pages (Activity, Charts, Coverage), constitutional issues, What we track, the manual and the tour.
   - `search.js`: the research engine (ranked search with a legal thesaurus, word stems and typo tolerance). Runs in the browser.
   - `charts.js`: the per-agency chart builder, with PNG, SVG and CSV export.

## Sources, and the rules the collector follows

| Source | What it is | Access rules followed |
|---|---|---|
| Federal Register API | Official daily journal of the U.S. government; public API built for programs | No key needed; one request at a time, 2 s apart |
| Regulations.gov API (v4, read-only) | Documents posted to Regulations.gov but not to the Federal Register | Free api.data.gov key; read-only "documents" endpoint only; 4 s between requests |
| SEC RSS feeds | Litigation releases and administrative proceedings | SEC fair-access policy: declared User-Agent with contact email, robots.txt checked, one request per feed per day |
| openFDA (new in 2.0) | FDA recall enforcement reports | Official public API; 3 requests a day, 3 s apart (limit is 240/minute); data is public domain |
| Agency website feeds (new in 2.0) | FTC press releases (consumer protection, competition); NLRB Board decisions, ALJ decisions and press releases; FCC Enforcement Bureau documents and notices of apparent liability; FDA press releases; CFPB newsroom | Only RSS feeds the agencies publish for subscribers; robots.txt checked before each site is used; one request per feed per day, 6 s apart; where a feed's address must be looked up, only the agency's own "RSS feeds" page is read and only a link on the same site is followed; press-release items are kept only if they describe an action |

Safety rules enforced in `collector/http_client.py` and covered by the tests in `tests/`:

- Only the hosts listed in `ALLOWED_HOSTS` (`collector/config.py`) can be contacted. Any other address, including FINRA's site, is refused in code.
- GET requests only: nothing is ever submitted, posted or changed.
- One request at a time, with a pause between requests, a 300-request ceiling per run and an 8 MB cap on any response. A normal daily run makes about 50 requests.
- "Slow down" responses (429/503) are obeyed. A source that keeps failing is switched off for the rest of the run.
- robots.txt is checked before any ordinary web page or feed is read; if a site disallows it, the source is skipped and the app says so.

## Ratings

Each flagged issue gets two ratings, each 3 (red), 2 (orange) or 1 (yellow):

- **Clarity**: Flagrant (fits a pattern the Supreme Court has squarely held unlawful), Substantial (strong argument under existing precedent), Arguable (open question).
- **Seriousness**: Severe (penalties, bars, loss of property or livelihood, economy-wide or presidential action), Significant (binding obligations on an industry), Moderate (narrower effects).

The kind of issue (jury trial, appointments, delegation, speech...) is kept as a sub-category. Every kind, its usual ratings, what moves them and the leading authorities are in `collector/flags.py` and shown in the app under *What we track*.

## One-time setup

1. **Website:** Settings → Pages → "Deploy from a branch", branch `main`, folder `/docs`.
2. **Secrets:** Settings → Secrets and variables → Actions:
   - `REGULATIONS_GOV_API_KEY`: your api.data.gov key.
   - `SEC_CONTACT_EMAIL` (optional): sent only in request headers to the SEC, never published. Without it, the SEC feeds are skipped and the app says so.
3. **First run:** Actions → "Collect agency data" → Run workflow.

## Changing things

- **Add an agency:** add an entry to `AGENCIES` in `collector/config.py` (name, short name, description, Federal Register slug, Regulations.gov ID).
- **Add a state agency later:** items already carry `"jurisdiction": "federal"`, and `JURISDICTIONS` in `config.py` lists the planned `state` group. A state source would set `jurisdiction` to the state's code and the directory would gain a section for it.
- **Tune flags and ratings:** `collector/flags.py`. **Tune sanction types and outcomes:** `collector/taxonomy.py`.
- **Re-sort stored data after changing the rules:** `python -m collector.reclassify`
- **Run the tests:** `python -m unittest discover tests`

## Limitations

- Flags and search read each document's title and summary, not the full text. A flag is not a legal conclusion, and the absence of a flag is not a clean bill of health.
- Enforcement and adjudication coverage is partial. EPA, Department of Labor, FERC and HHS-OIG enforcement are not yet connected; see *What we track* in the app for the full list.
