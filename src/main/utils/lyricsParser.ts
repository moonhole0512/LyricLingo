export interface ParsedLyric {
  timeMs: number;
  text: string;
}

export function cleanLyricText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\]\s*/g, '') // remove leading redundant timestamp
    .replace(/^\[\d{1,2}:(?:\d{1,2})?\s*/g, '')           // remove broken/partial timestamp prefixes like '[00:' or '[0:'
    .replace(/\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\]/g, '')     // remove any stray embedded timestamps
    .trim();
}

export function parseLyrics(lrc: string): ParsedLyric[] {
  const lines = lrc.split('\n');
  const result: ParsedLyric[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const matches = [...line.matchAll(timeRegex)];
    if (matches.length > 0) {
      const rawText = line.replace(timeRegex, '').trim();
      const text = cleanLyricText(rawText);
      for (const match of matches) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const msStr = match[3] || '000';
        const milliseconds = parseInt(msStr.padEnd(3, '0'), 10);
        
        const timeMs = (minutes * 60 + seconds) * 1000 + milliseconds;
        result.push({ timeMs, text });
      }
    }
  }

  return result.sort((a, b) => a.timeMs - b.timeMs);
}

export function extractLrcDurationMs(lrc: string, lyrics?: ParsedLyric[]): number {
  if (!lrc) return 0;
  const lengthMatch = lrc.match(/\[length:\s*(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/i);
  if (lengthMatch) {
    const min = parseInt(lengthMatch[1], 10);
    const sec = parseInt(lengthMatch[2], 10);
    const ms = lengthMatch[3] ? parseInt(lengthMatch[3].padEnd(3, '0'), 10) : 0;
    return (min * 60 + sec) * 1000 + ms;
  }
  const secMatch = lrc.match(/\[length:\s*(\d+)(?:\.(\d+))?\]/i);
  if (secMatch) {
    return Math.round(parseFloat(secMatch[1]) * 1000);
  }

  if (lyrics && lyrics.length > 0) {
    return lyrics[lyrics.length - 1].timeMs + 5000;
  }

  const parsed = parseLyrics(lrc);
  if (parsed.length > 0) {
    return parsed[parsed.length - 1].timeMs + 5000;
  }

  return 0;
}

export interface SmartSyncResult {
  diffSec: number;
  recommendedOffsetMs: number;
  reverseOffsetMs: number;
  isDiffSignificant: boolean;
  recommendedDirection: 'earlier' | 'later' | 'none';
}

export function calculateSmartSyncOffset(
  musicDurationMs: number,
  lrcDurationMs: number,
  baseOffsetMs: number = 800
): SmartSyncResult {
  if (!musicDurationMs || !lrcDurationMs) {
    return {
      diffSec: 0,
      recommendedOffsetMs: baseOffsetMs,
      reverseOffsetMs: baseOffsetMs,
      isDiffSignificant: false,
      recommendedDirection: 'none'
    };
  }

  const diffMs = musicDurationMs - lrcDurationMs;
  const diffSec = parseFloat((diffMs / 1000).toFixed(1));
  const absDiffSec = Math.abs(diffSec);

  // 1.5초 미만은 엔코딩 허용 오차로 간주, 15초 초과는 다른 버전으로 간주
  if (absDiffSec < 1.5 || absDiffSec > 15) {
    return {
      diffSec,
      recommendedOffsetMs: baseOffsetMs,
      reverseOffsetMs: baseOffsetMs,
      isDiffSignificant: false,
      recommendedDirection: 'none'
    };
  }

  // 가사가 음악보다 더 김 (diffSec < 0) -> 가사가 늦게 나오므로 앞으로 당김 (+absDiffMs to syncOffset)
  if (diffSec < 0) {
    return {
      diffSec,
      recommendedOffsetMs: baseOffsetMs + Math.round(Math.abs(diffMs)),
      reverseOffsetMs: baseOffsetMs - Math.round(Math.abs(diffMs)),
      isDiffSignificant: true,
      recommendedDirection: 'earlier'
    };
  } else {
    // 음악이 가사보다 더 김 (diffSec > 0) -> 가사가 먼저 나오므로 뒤로 밈 (-diffMs from syncOffset)
    return {
      diffSec,
      recommendedOffsetMs: baseOffsetMs - Math.round(diffMs),
      reverseOffsetMs: baseOffsetMs + Math.round(diffMs),
      isDiffSignificant: true,
      recommendedDirection: 'later'
    };
  }
}
