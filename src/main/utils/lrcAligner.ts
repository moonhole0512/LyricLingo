import { cleanLyricText } from './lyricsParser';

export interface LrcLine {
  index: number;
  timeTag: string;
  timeMs: number;
  text: string;
}

export interface AlignmentResult {
  alignedLrc: string;
  missingLines: LrcLine[];
  matchedCount: number;
  totalCount: number;
}

const TIME_REGEX = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

export function parseLrcLines(lrc: string): LrcLine[] {
  const lines = lrc.split('\n');
  const result: LrcLine[] = [];
  let index = 0;

  for (const line of lines) {
    const matches = [...line.matchAll(TIME_REGEX)];
    if (matches.length > 0) {
      const rawText = line.replace(TIME_REGEX, '').trim();
      const text = cleanLyricText(rawText);
      for (const match of matches) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const msStr = match[3] || '000';
        const milliseconds = parseInt(msStr.padEnd(3, '0'), 10);
        const timeMs = (minutes * 60 + seconds) * 1000 + milliseconds;
        const timeTag = match[0];
        
        result.push({
          index: index++,
          timeTag,
          timeMs,
          text
        });
      }
    }
  }

  return result.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Align translated LRC with original LRC based on timestamps and line positions.
 * Detects missing or untranslated lines.
 */
export function alignLrc(originalLrc: string, translatedLrc: string): AlignmentResult {
  const originalLines = parseLrcLines(originalLrc);
  if (originalLines.length === 0) {
    return {
      alignedLrc: translatedLrc,
      missingLines: [],
      matchedCount: 0,
      totalCount: 0
    };
  }

  const translatedLines = parseLrcLines(translatedLrc);
  const rawTranslatedLines = translatedLrc
    .split('\n')
    .map(l => cleanLyricText(l.replace(TIME_REGEX, '').trim()))
    .filter(l => l.length > 0);

  const missingLines: LrcLine[] = [];
  const alignedMap = new Map<number, string>(); // original line index -> translated text

  // Strategy 1: Match by timestamp tag (tolerance within 500ms)
  for (const orig of originalLines) {
    // If original line is empty (e.g. musical break ♪), keep it empty
    if (!orig.text.trim() || orig.text.includes('♪') || orig.text.includes('🎵')) {
      alignedMap.set(orig.index, orig.text);
      continue;
    }

    const matchedTrans = translatedLines.find(t => Math.abs(t.timeMs - orig.timeMs) <= 500 && t.text.trim().length > 0);
    if (matchedTrans) {
      alignedMap.set(orig.index, cleanLyricText(matchedTrans.text));
    } else {
      missingLines.push(orig);
    }
  }

  // Strategy 2: If timestamp matching missed lines, but line counts of raw text match
  if (missingLines.length > 0 && rawTranslatedLines.length === originalLines.length) {
    missingLines.length = 0; // Clear missing lines
    originalLines.forEach((orig, idx) => {
      alignedMap.set(orig.index, cleanLyricText(rawTranslatedLines[idx]));
    });
  }

  // Reconstruct aligned LRC string
  const alignedLrcLines: string[] = [];
  for (const orig of originalLines) {
    const transText = cleanLyricText(alignedMap.get(orig.index) || '');
    alignedLrcLines.push(`${orig.timeTag} ${transText}`);
  }

  return {
    alignedLrc: alignedLrcLines.join('\n'),
    missingLines,
    matchedCount: originalLines.length - missingLines.length,
    totalCount: originalLines.length
  };
}

/**
 * Merge re-translated lines back into aligned LRC.
 */
export function mergeReTranslatedLines(
  originalLrc: string,
  existingAlignedLrc: string,
  fixedMap: Record<number, string>
): string {
  const originalLines = parseLrcLines(originalLrc);
  const existingLines = parseLrcLines(existingAlignedLrc);
  const existingMap = new Map<number, string>();
  
  existingLines.forEach(l => existingMap.set(l.index, l.text));

  const finalLines: string[] = [];
  for (const orig of originalLines) {
    let text = existingMap.get(orig.index) || '';
    if (fixedMap[orig.index] !== undefined && fixedMap[orig.index].trim().length > 0) {
      text = cleanLyricText(fixedMap[orig.index].trim());
    }
    finalLines.push(`${orig.timeTag} ${text}`);
  }

  return finalLines.join('\n');
}

/**
 * Detect if translated LRC is untranslated (i.e. LLM echoed original foreign text or returned identical lines).
 */
export function isUntranslated(originalLrc: string, translatedLrc: string): boolean {
  if (!translatedLrc) return true;
  const parseText = (lrc: string) => lrc.split('\n').map(l => cleanLyricText(l.replace(TIME_REGEX, '').trim())).filter(l => l.length > 0);
  const origTexts = parseText(originalLrc);
  const transTexts = parseText(translatedLrc);

  if (origTexts.length === 0 || transTexts.length === 0) return true;

  let matchCount = 0;
  let japaneseCharCount = 0;
  let koreanCharCount = 0;

  transTexts.forEach((t, i) => {
    if (origTexts[i] && t === origTexts[i]) {
      matchCount++;
    }
    const jpMatches = t.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
    const krMatches = t.match(/[\uAC00-\uD7AF]/g);
    if (jpMatches) japaneseCharCount += jpMatches.length;
    if (krMatches) koreanCharCount += krMatches.length;
  });

  const identicalRatio = matchCount / origTexts.length;
  if (identicalRatio > 0.4 || (japaneseCharCount > 10 && koreanCharCount < 5)) {
    return true;
  }
  return false;
}
