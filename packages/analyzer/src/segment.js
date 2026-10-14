/**
 * Regular expressions for abbreviation and dialogue detection.
 */
const TITLE_ABBREVIATIONS = /\b(Mr|Mrs|Ms|Miss|Dr|Prof|Sr|Jr|St|Capt|Col|Gen|Lt|Rev|Rep|Sen|Gov|Pres)\.\s*$/i;
const INITIAL_PATTERN = /\b[A-Z]\.\s*$/;
const COMMON_ABBREVIATIONS = /\b(e\.g|i\.e|vs|approx|dept|est|fig|inc|co|corp|al|etc)\.\s*$/i;
const TIME_ABBREVIATIONS = /\b(a\.m|p\.m)\.\s*$/i;
const ELLIPSIS_PATTERN = /(\.{3,}|…)\s*$/;
const DIALOGUE_PUNCT_QUOTE = /[.?!,]["'”’»]\s*$/;
const TERMINAL_PUNCT = /[.?!]["'”’»]?\s*$/;

/**
 * Counts non-empty paragraphs in text.
 *
 * @param {string} text
 * @returns {number}
 */
export function countParagraphs(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return 0;
  }
  return text.split(/\n+/).filter((p) => p.trim().length > 0).length;
}

/**
 * Splits text into paragraphs.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitParagraphs(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }
  return text.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Determines whether the next segment should be merged with the current accumulated segment.
 *
 * @param {string} currentText - Current segment text (including trailing spaces)
 * @param {string} nextSegment - Next raw segment from Intl.Segmenter
 * @returns {boolean}
 */
function shouldMerge(currentText, nextSegment) {
  const currentTrimmed = currentText.trim();
  const nextTrimmed = nextSegment.trim();

  if (!nextTrimmed) {
    return true;
  }

  // Next segment starts with a closing quote that belongs to the current segment
  if (/^["'”’»]/.test(nextTrimmed) && /[.?!,]$/.test(currentTrimmed)) {
    return true;
  }

  // 1. Current ends with a title abbreviation (e.g. "Mr.", "Dr.") -> always merge
  if (TITLE_ABBREVIATIONS.test(currentText)) {
    return true;
  }

  // 2. Current ends with a single capital initial (e.g. "J.", "K.") -> always merge
  if (INITIAL_PATTERN.test(currentText)) {
    return true;
  }

  // 3. Current ends with time abbreviation and next word starts with lowercase
  if (TIME_ABBREVIATIONS.test(currentText) && /^[a-z]/.test(nextTrimmed)) {
    return true;
  }

  // 4. Current ends with common abbreviation (e.g. "e.g.", "i.e.")
  if (COMMON_ABBREVIATIONS.test(currentText)) {
    // If e.g. or i.e., almost always merge; otherwise merge if next starts with lowercase
    if (/\b(e\.g|i\.e)\.\s*$/i.test(currentText) || /^[a-z]/.test(nextTrimmed)) {
      return true;
    }
  }

  // 5. Current ends with ellipsis and next starts with lowercase or continuation
  if (ELLIPSIS_PATTERN.test(currentText) && /^[a-z]/.test(nextTrimmed)) {
    return true;
  }

  // 6. Dialogue tag continuation: quote after punctuation followed by lowercase tag (e.g. "Stop!" he cried.)
  if (DIALOGUE_PUNCT_QUOTE.test(currentText) && /^[a-z]/.test(nextTrimmed)) {
    return true;
  }

  // 7. Current segment does not end with terminal punctuation
  if (!TERMINAL_PUNCT.test(currentTrimmed)) {
    return true;
  }

  return false;
}

/**
 * Segments text into sentences with positional IDs (s0, s1, ...) and start/end offsets.
 *
 * @param {string} text - Input text
 * @returns {Array<{ id: string, start: number, end: number, text: string }>}
 */
export function segmentSentences(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const rawSegments = Array.from(segmenter.segment(text));

  if (rawSegments.length === 0) {
    return [];
  }

  /** @type {Array<{ rawText: string, rawStart: number }>} */
  const mergedChunks = [];

  for (const { segment, index } of rawSegments) {
    if (mergedChunks.length === 0) {
      mergedChunks.push({ rawText: segment, rawStart: index });
      continue;
    }

    const lastChunk = mergedChunks[mergedChunks.length - 1];
    if (shouldMerge(lastChunk.rawText, segment)) {
      lastChunk.rawText += segment;
    } else {
      mergedChunks.push({ rawText: segment, rawStart: index });
    }
  }

  const results = [];
  let idIndex = 0;

  for (const chunk of mergedChunks) {
    const trimmed = chunk.rawText.trim();
    if (trimmed.length === 0) {
      continue;
    }

    // Calculate exact start and end offsets of the trimmed text within the original document
    const leadingWhitespaceLen = chunk.rawText.indexOf(trimmed);
    const start = chunk.rawStart + leadingWhitespaceLen;
    const end = start + trimmed.length;

    results.push({
      id: `s${idIndex++}`,
      start,
      end,
      text: trimmed,
    });
  }

  return results;
}

/**
 * Full segmentation helper returning sentences and paragraph count.
 *
 * @param {string} text
 * @returns {{ sentences: Array<{ id: string, start: number, end: number, text: string }>, paragraphCount: number }}
 */
export function segment(text) {
  return {
    sentences: segmentSentences(text),
    paragraphCount: countParagraphs(text),
  };
}
