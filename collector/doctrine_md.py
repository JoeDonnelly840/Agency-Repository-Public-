"""Write DOCTRINE.md, the reviewable legal memo, from the doctrine library:
python -m collector.doctrine_md"""
import os

from . import doctrine

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "DOCTRINE.md")


def render():
    d = doctrine.export()["doctrine"]
    A = d["authorities"]
    lines = ["# RegCollect doctrine library and rating rubric", "",
             f"Status: **{d['review']['status']}**. Reviewer: {d['review']['reviewed_by'] or '(none yet)'}. "
             f"Last reviewed: {d['review']['last_reviewed'] or '(never)'}.", "",
             "This memo is generated from `collector/doctrine.py`, which the app uses to rate every flag. "
             "Edit that file (not this one), then run `python -m collector.doctrine_md` and `python -m collector.reclassify`.",
             "Holdings are short paraphrases for screening purposes; verify every citation before relying on it.", "",
             "## How ratings are computed", "", "### Flagrance", ""]
    lines += [f"- {x}" for x in d["rubric"]["flagrance"]] + ["", "### Seriousness", ""]
    lines += [f"- {x}" for x in d["rubric"]["seriousness"]] + [""]
    for i in d["issues"]:
        lines += [f"## {i['label']}", "", f"Group: {'structural' if i['group'] == 'structural' else 'individual rights'}. Code: `{i['code']}`.", "",
                  f"**Question.** {i['question']}", "", f"**Test.** {i['test']}", "", "**Elements checked in each document:**", ""]
        lines += [f"{n}. {e['text']}" for n, e in enumerate(i["elements"], 1)] + [""]
        if i["counters"]:
            lines += ["**Counter-indicators (cap the rating at Arguable):**", ""] + [f"- {c['text']}" for c in i["counters"]] + [""]
        lines += ["**Precedent tier (first rule that matches):**", ""]
        lines += [f"- Tier {r['tier']}: {r['note']} ({A[r['authority']]['cite']})" for r in i["tiers"]] + ["", "**Authorities:**", ""]
        lines += [f"- *{A[k]['cite']}* (decided {A[k]['decided']}): {A[k]['held']}" for k in i["authorities"]] + [""]
        lines += ["**Open questions:**", ""] + [f"- {q}" for q in i["open_questions"]] + [""]
    return "\n".join(lines)


if __name__ == "__main__":
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(render())
    print(f"Wrote {OUT}")
