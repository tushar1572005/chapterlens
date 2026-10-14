"""
Reproducible reference score generator for ChapterLens P5 evals.
Calculates independent Flesch Reading Ease and Flesch-Kincaid Grade
using Python textstat (version 0.7.13, language en_US).
"""

import os
import json
import textstat

# Ensure US English syllable and hyphenation rules
textstat.set_lang("en_US")

PASSAGES_DIR = os.path.join(os.path.dirname(__file__), "passages")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "reference_scores.json")

def generate_reference_scores():
    files = sorted([f for f in os.listdir(PASSAGES_DIR) if f.endswith(".txt")])
    results = {}

    for fname in files:
        fpath = os.path.join(PASSAGES_DIR, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            text = f.read().strip()

        passage_id = os.path.splitext(fname)[0]
        fre = textstat.flesch_reading_ease(text)
        fkg = textstat.flesch_kincaid_grade(text)
        words = textstat.lexicon_count(text, removepunct=True)
        sentences = textstat.sentence_count(text)

        results[passage_id] = {
            "passageId": passage_id,
            "filename": fname,
            "referenceEngine": "textstat",
            "textstatVersion": textstat.__version__,
            "language": "en_US",
            "fleschReadingEase": round(float(fre), 2),
            "fleschKincaidGrade": round(float(fkg), 2),
            "wordCount": words,
            "sentenceCount": sentences
        }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"Generated reference scores for {len(results)} passages using textstat v{textstat.__version__}")
    for pid, r in results.items():
        print(f"  {pid:35s} | FRE: {r['fleschReadingEase']:6.2f} | FKG: {r['fleschKincaidGrade']:5.2f} | Words: {r['wordCount']}")

if __name__ == "__main__":
    generate_reference_scores()
