import { describe, it, expect } from 'vitest';
import { segmentSentences, countParagraphs, splitParagraphs, segment } from '../src/segment.js';

describe('segmentSentences', () => {
  it('keeps "Mr. Smith said..." as 1 sentence', () => {
    const text = 'Mr. Smith said hello to everyone in the room.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('Mr. Smith said hello to everyone in the room.');
    expect(sentences[0].id).toBe('s0');
  });

  it('assigns sequential positional IDs: s0, s1, s2', () => {
    const text = 'First sentence. Second sentence! Third sentence?';
    const sentences = segmentSentences(text);
    expect(sentences.map((s) => s.id)).toEqual(['s0', 's1', 's2']);
    expect(sentences).toHaveLength(3);
  });

  it('accurately sets start and end character offsets', () => {
    const text = '   First sentence here.   Second sentence here!   ';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(2);
    expect(text.slice(sentences[0].start, sentences[0].end)).toBe(sentences[0].text);
    expect(text.slice(sentences[1].start, sentences[1].end)).toBe(sentences[1].text);
  });

  it('handles multiple honorific titles: Dr. and Prof.', () => {
    const text = 'Dr. Watson and Prof. Moriarty met at the station.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('Dr. Watson and Prof. Moriarty met at the station.');
  });

  it('handles name initials without splitting', () => {
    const text = 'J. K. Rowling wrote fantasy novels for years.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('J. K. Rowling wrote fantasy novels for years.');
  });

  it('keeps dialogue with exclamation and lowercase speech tag as 1 sentence', () => {
    const text = '"Stop!" he cried in alarm.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('"Stop!" he cried in alarm.');
  });

  it('keeps dialogue with question mark and lowercase speech tag as 1 sentence', () => {
    const text = '"Are you sure?" she asked.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('"Are you sure?" she asked.');
  });

  it('splits dialogue followed by a new independent sentence', () => {
    const text = '"I am ready." He walked quietly out the door.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('"I am ready."');
    expect(sentences[1].text).toBe('He walked quietly out the door.');
  });

  it('keeps dialogue ending in comma as 1 sentence', () => {
    const text = '"Hello," said John with a warm smile.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('"Hello," said John with a warm smile.');
  });

  it('keeps ellipsis followed by lowercase continuation as 1 sentence', () => {
    const text = 'He waited... and waited patiently for the dawn.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('He waited... and waited patiently for the dawn.');
  });

  it('keeps e.g. and i.e. within a sentence intact', () => {
    const text = 'He bought fruits, e.g. apples and oranges, from the market.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('He bought fruits, e.g. apples and oranges, from the market.');
  });

  it('handles time abbreviations (p.m. / a.m.) followed by lowercase words', () => {
    const text = 'The express train departed at 5 p.m. yesterday without delay.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].text).toBe('The express train departed at 5 p.m. yesterday without delay.');
  });

  it('splits when time abbreviation is followed by a capitalized new sentence', () => {
    const text = 'The ceremony concluded at 8 p.m. Next came the grand banquet.';
    const sentences = segmentSentences(text);
    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('The ceremony concluded at 8 p.m.');
    expect(sentences[1].text).toBe('Next came the grand banquet.');
  });

  it('handles empty and whitespace-only text gracefully', () => {
    expect(segmentSentences('')).toEqual([]);
    expect(segmentSentences('   \n\t  ')).toEqual([]);
    expect(segmentSentences(null)).toEqual([]);
  });
});

describe('paragraph splitting and counting', () => {
  it('counts paragraphs accurately across multiple newlines', () => {
    const text = 'Paragraph 1.\n\nParagraph 2.\n\n\nParagraph 3.';
    expect(countParagraphs(text)).toBe(3);
    expect(splitParagraphs(text)).toEqual(['Paragraph 1.', 'Paragraph 2.', 'Paragraph 3.']);
  });

  it('returns 0 paragraphs for empty or whitespace text', () => {
    expect(countParagraphs('')).toBe(0);
    expect(countParagraphs('   \n\n   ')).toBe(0);
    expect(countParagraphs(null)).toBe(0);
  });

  it('segment() returns both sentences and paragraph count', () => {
    const text = 'Paragraph one sentence one. Sentence two.\n\nParagraph two.';
    const result = segment(text);
    expect(result.paragraphCount).toBe(2);
    expect(result.sentences).toHaveLength(3);
    expect(result.sentences[0].id).toBe('s0');
    expect(result.sentences[1].id).toBe('s1');
    expect(result.sentences[2].id).toBe('s2');
  });
});
