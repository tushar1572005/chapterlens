import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../packages/analyzer/src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASSAGES_DIR = path.join(__dirname, 'passages');
const EXPECTED_DIR = path.join(__dirname, 'expected');
const REF_FILE = path.join(__dirname, 'reference_scores.json');

if (!fs.existsSync(EXPECTED_DIR)) {
  fs.mkdirSync(EXPECTED_DIR, { recursive: true });
}

const refScores = JSON.parse(fs.readFileSync(REF_FILE, 'utf8'));
const files = fs.readdirSync(PASSAGES_DIR).filter((f) => f.endsWith('.txt')).sort();

console.log(`Generating golden files for ${files.length} passages...`);

for (const file of files) {
  const id = path.parse(file).name;
  const rawText = fs.readFileSync(path.join(PASSAGES_DIR, file), 'utf8');
  const result = analyze(rawText);
  const ref = refScores[id];

  if (!ref) {
    throw new Error(`Missing reference score for passage: ${id}`);
  }

  const freDiff = Number(Math.abs(result.readability.fleschRE - ref.fleschReadingEase).toFixed(2));
  const fkgDiff = Number(Math.abs(result.readability.fkGrade - ref.fleschKincaidGrade).toFixed(2));
  const sentenceCountDiff = result.stats.sentences - ref.sentenceCount;
  const segmentationAligned = Math.abs(sentenceCountDiff) <= 1;

  let notes = 'Sentence segmentation aligned closely with reference.';
  if (!segmentationAligned) {
    notes = `Sentence count diverged (our Intl.Segmenter: ${result.stats.sentences}, textstat regex: ${ref.sentenceCount}) due to dialogue quotes/abbreviations.`;
  }

  const goldenData = {
    id,
    filename: file,
    reference: {
      engine: ref.referenceEngine,
      version: ref.textstatVersion,
      language: ref.language,
      fleschReadingEase: ref.fleschReadingEase,
      fleschKincaidGrade: ref.fleschKincaidGrade,
      words: ref.wordCount,
      sentences: ref.sentenceCount,
    },
    golden: {
      readability: result.readability,
      stats: result.stats,
      top5SentenceIds: result.hardest.map((s) => s.id),
      hardest: result.hardest.map((s) => ({
        id: s.id,
        score: s.score,
        metrics: s.metrics,
        text: s.text,
      })),
    },
    comparison: {
      freDiff,
      fkgDiff,
      sentenceCountDiff,
      segmentationAligned,
      notes,
    },
  };

  const outPath = path.join(EXPECTED_DIR, `${id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(goldenData, null, 2), 'utf8');
  console.log(`Saved ${outPath}`);
}

console.log('Golden JSON generation complete.');
