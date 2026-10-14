/**
 * Normalizes input text: converts smart quotes and apostrophes to ASCII,
 * non-breaking spaces to standard spaces, and CRLF/CR to LF.
 *
 * @param {string} text - Raw input text
 * @returns {string} Normalized text
 */
export function normalize(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text
    // Normalize line endings to \n
    .replace(/\r\n|\r/g, '\n')
    // Normalize non-breaking and special unicode spaces to standard space
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    // Normalize curly/smart double quotes and guillemets to standard "
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    // Normalize curly/smart single quotes and apostrophes to standard '
    .replace(/[\u2018\u2019\u201A\u02BB\u02BC]/g, "'");
}
