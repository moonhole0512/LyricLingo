import { describe, it, expect } from 'vitest';
import { parseLyrics } from '../../../src/main/utils/lyricsParser';

describe('Lyrics Parser', () => {
  it('should parse valid LRC strings into an array of objects with time in ms and text', () => {
    const lrc = `
[00:12.00] Line 1
[01:05.50] Line 2
[03:45.12] Line 3
    `;
    const result = parseLyrics(lrc);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ timeMs: 12000, text: 'Line 1' });
    expect(result[1]).toEqual({ timeMs: 65500, text: 'Line 2' });
    expect(result[2]).toEqual({ timeMs: 225120, text: 'Line 3' });
  });

  it('should ignore invalid lines', () => {
    const lrc = `
[00:10.00] Valid
Invalid line
[00:15.00] Also valid
    `;
    const result = parseLyrics(lrc);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Valid');
    expect(result[1].text).toBe('Also valid');
  });

  it('should handle multiple timestamps for the same lyric', () => {
    const lrc = `[00:10.00][00:20.00] Repeated Line`;
    const result = parseLyrics(lrc);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ timeMs: 10000, text: 'Repeated Line' });
    expect(result[1]).toEqual({ timeMs: 20000, text: 'Repeated Line' });
  });
});
