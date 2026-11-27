"""Write DOCTRINE.md, the reviewable legal memo, from the doctrine library:
python -m collector.doctrine_md"""
import os

from . import doctrine

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "DOCTRINE.md")


def render():
    d = doctrine.export()["doctrine"]
    A = d["authorities"]
    lines = ["# RegCollect doctrine library and rating rubric", "",
             f"Rubric version {d['rubric_version']}. Status: **{d['review']['status']}**. Reviewer: {d['review']['reviewed_by'] or '(none yet)'}. "
             f"Last reviewed: {d['review']['last_reviewed'] or '(never)'}.", "",
             "This memo is generated from `collector/doctrine.py` and `collector/rulings.py`, which the app uses to rate every flag. "
             "Edit those files (not this one), then run `python -m collector.doctrine_md` and `python -m collector.reclassify`.",
             "Holdings are short paraphrases for screening purposes; verify every citation before relying on it.", "",
             "## How ratings are computed", "", "### Constitutionality", ""]
    lines += [f"- {x}" for x in d["rubric"]["constitutionality"]] + ["", "### Impact (context only)", ""]
    lines += [f"- {x}" for x in d["rubric"]["impact"]] + [""]
    lines += ["### Precedent strength", "", "Every memo sorts its precedent into the same three levels:", ""]
    lines += [f"- **{p['label']}**" for p in d["precedent_levels"]] + [""]
    lines += ["## Known rulings on specific actions", "", "| Action | Court | Result | Rating | Kind of holding | Case |", "|---|---|---|---|---|---|"]
    for r in d["rulings"]:
        lines.append(f"| {r['label']} | {r['court_label']} | {r['result']} | {r['level'] if r['result'] != 'upheld' else 'lowers one step'} | {r['kind']} | *{A[r['authority']]['cite']}* |")
    lines.append("")
    for i in d["issues"]:
        lines += [f"## {i['label']}", "", f"Group: {'structural' if i['group'] == 'structural' else 'individual rights'}. Code: `{i['code']}`.", "",
                  f"**Question.** {i['question']}", "", f"**Test.** {i['test']}", "", "**Elements checked in each document** (gate elements must all appear before the issue is rated):", ""]
        lines += [f"{n}. {e['text']}{' *(gate)*' if e['gate'] else ''}" for n, e in enumerate(i["elements"], 1)] + [""]
        if i["weighed"]:
            lines += ["**Weighed factors:**", ""] + [f"- {w['text']} ({'lowers the rating one step' if w['lowers'] else 'noted only'})" for w in i["weighed"]] + [""]
        lines += ["**Precedent (first rule that matches):**", ""]
        for level in ("direct", "analogy", "open"):
            rs = [r for r in i["precedent"] if r["level"] == level]
            label = {"direct": "Direct holding", "analogy": "Close analogy", "open": "Open question"}[level]
            if rs:
                lines += [f"- {label}: {r['note']} ({A[r['authority']]['cite']})" for r in rs]
            else:
                lines.append(f"- {label}: none yet for this kind of issue.")
        lines += ["", "**Authorities:**", ""]
        lines += [f"- *{A[k]['cite']}* (decided {A[k]['decided']}): {A[k]['held']}" for k in i["authorities"]] + [""]
        lines += ["**Open questions:**", ""] + [f"- {q}" for q in i["open_questions"]] + [""]
    return "\n".join(lines)


if __name__ == "__main__":
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(render())
    print(f"Wrote {OUT}")
