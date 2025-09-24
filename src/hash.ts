import crypto from 'node:crypto';

export function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\u200B/g, '') // Remove zero-width spaces
    .trim();
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function applyScrubPatterns(text: string, patterns?: Array<{pattern: string, flags?: string}>): string {
  if (!patterns || patterns.length === 0) {
    return text;
  }

  let scrubbedText = text;
  for (const { pattern, flags } of patterns) {
    try {
      const regex = new RegExp(pattern, flags || '');
      scrubbedText = scrubbedText.replace(regex, '');
    } catch (err) {
      console.warn(`Invalid scrub pattern: ${pattern} with flags: ${flags}`, err);
    }
  }

  return scrubbedText;
}

/**
 * Combined text processing: apply scrub patterns then normalize
 * This reduces redundant string operations
 */
export function processText(text: string, scrubPatterns?: Array<{pattern: string, flags?: string}>): string {
  // Apply scrub patterns first
  let processedText = text;
  if (scrubPatterns && scrubPatterns.length > 0) {
    for (const { pattern, flags } of scrubPatterns) {
      try {
        const regex = new RegExp(pattern, flags || '');
        processedText = processedText.replace(regex, '');
      } catch (err) {
        console.warn(`Invalid scrub pattern: ${pattern} with flags: ${flags}`, err);
      }
    }
  }
  
  // Then normalize
  return processedText
    .replace(/\s+/g, ' ')
    .replace(/\u200B/g, '') // Remove zero-width spaces
    .trim();
}
