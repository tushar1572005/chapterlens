import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalize.js';

describe('normalize', () => {
  it('converts curly double quotes and guillemets to standard ASCII quotes', () => {
    const input = '“Hello world,” she said. «Yes!»';
    expect(normalize(input)).toBe('"Hello world," she said. "Yes!"');
  });

  it('converts curly single quotes and apostrophes to standard ASCII single quotes', () => {
    const input = "‘It’s a lovely day,’ he replied.";
    expect(normalize(input)).toBe("'It's a lovely day,' he replied.");
  });

  it('converts non-breaking and special spaces to standard spaces', () => {
    const input = 'Word1\u00A0Word2\u202FWord3\u2007Word4';
    expect(normalize(input)).toBe('Word1 Word2 Word3 Word4');
  });

  it('normalizes CRLF and CR line endings to LF', () => {
    const input = 'First line\r\nSecond line\rThird line\nFourth line';
    expect(normalize(input)).toBe('First line\nSecond line\nThird line\nFourth line');
  });

  it('handles empty strings and non-string inputs safely', () => {
    expect(normalize('')).toBe('');
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
    expect(normalize(123)).toBe('');
  });

  it('handles combined edge cases in dialogue passages', () => {
    const input = '“Don’t\u00A0stop,\r\nshe whispered,” ‘please.’';
    expect(normalize(input)).toBe('"Don\'t stop,\nshe whispered," \'please.\'');
  });
});
