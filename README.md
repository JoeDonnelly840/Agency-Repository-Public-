# Agency Tracker

Agency Tracker reports what the federal executive branch has done since you last checked. It sorts actions by agency and by type (rulemaking, enforcement, adjudication), flags arguable constitutional problems with structural issues ranked first, and says plainly what it did **not** find or could not check.

## How it works

1. **Collector** (`collector/`): a small Python program, using only the standard library, that GitHub runs once a day (`.github/workflows/collect.yml`). It reads official government interfaces, sorts and flags what it finds, and saves the results in `docs/data/`.
2. **Website** (`docs/`): a static page served by GitHub Pages, with two modes:
   - **Classic** (`app.js`): what is new since your last visit, by agency. The original version is preserved under the git tag `classic-v1`.
   - **Research** (`research.js`): searches the full history. It offers search by type of sanction (results grouped by agency) and "ask in your own words" reports that can be regrouped, shown as a table, downloaded as CSV or saved as a link. It runs entirely in the browser.

## Sources, and the safety rules the collector follows

| Source | What it is | Access rules followed |
|---|---|---|
| Federal Register API | Official daily journal of the U.S. government; public API built for programs | No key needed; one request at a time, 2 s apart |
| Regulations.gov API (v4, read-only) | Documents posted to Regulations.gov but not to the Federal Register | Free api.data.gov key; read-only "documents" endpoint only; the Comment API is never used; 4 s between requests |
| SEC RSS feeds | Litigation releases and administrative proceedings | SEC fair-access policy: declared User-Agent with contact email, robots.txt checked, far below 10 requests/second (one request per feed per day, 5 s apart) |

Safety rules enforced in `collector/http_client.py` (and covered by the tests in `tests/`):

- Only the three hosts above can be contacted. Any other address is refused in code.
- GET requests only: nothing is ever submitted, posted or changed.
- One request at a time, with a pause between requests, and a hard ceiling of 300 requests per run. A normal daily run makes about 40.
- "Slow down" responses (429/503) are obeyed. A source that keeps failing is switched off for the rest of the run.
- robots.txt is checked before reading ordinary web pages.
- FINRA's and other agencies' websites are not read. FINRA, PCAOB and MSRB actions are identified from SEC notices in the Federal Register.

## One-time setup

1. **Turn on the website:** go to Settings → Pages → "Deploy from a branch", choose branch `main` and folder `/docs`, then click Save. The site appears at `https://joedonnelly840.github.io/Agency-Repository-Public-/`.
2. **Add secrets:** go to Settings → Secrets and variables → Actions → New repository secret, and add:
   - `REGULATIONS_GOV_API_KEY`: your api.data.gov key.
   - `SEC_CONTACT_EMAIL` (optional): an email the SEC can contact if there's ever a problem. It is sent only in request headers and never published. Without it, the SEC feeds are skipped and the app says so.
3. **First run:** go to Actions → "Collect agency data" → Run workflow. The first run looks back 30 days. After that, it runs automatically every morning.

## Changing things

- **Add an agency:** add an entry to `AGENCIES` in `collector/config.py`. You need its Federal Register slug (the last part of `federalregister.gov/agencies/<slug>`) and its Regulations.gov agency ID. If a slug is wrong, the app shows a configuration error for that agency rather than failing silently.
- **Tune the flags:** edit `collector/flags.py`. Each rule lists its trigger words, explanation and leading cases.
- **Re-sort stored data after changing the rules:** `python -m collector.reclassify`
- **Run the tests:** `python -m unittest discover tests`

## Limitations

- Flags come from an automated keyword screen of each document's title and summary. A flag is not a legal conclusion, and the absence of a flag is not a clean bill of health.
- Enforcement and adjudication coverage is partial. Most agencies announce enforcement actions only on their own websites, and most ALJ and board decisions are not published in the Federal Register. The app's "What we checked" page lists these gaps.
