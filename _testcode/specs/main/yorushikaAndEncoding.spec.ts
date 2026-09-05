import { describe, it, expect } from 'vitest';
import { searchLrcCandidates } from '../../../src/main/utils/lrcSearcher';
import { normalizeMediaData } from '../../../src/main/utils/mediaIdentity';

describe('Yorushika & Encoding Verification', () => {
  it('should normalize Evening Calm, Somewhere, Fireworks with album and artist', () => {
    const raw = {
      title: 'Evening Calm, Somewhere, Fireworks 요루시카 — Elma',
      artist: '요루시카',
      album: 'Elma',
      source: 'AppleMusic'
    };
    const normalized = normalizeMediaData(raw);
    expect(normalized.title).toBe('Evening Calm, Somewhere, Fireworks');
    expect(normalized.artist).toBe('요루시카');
    expect(normalized.album).toBe('Elma');
  });

  it('should find LRCLib candidates for Evening Calm, Somewhere, Fireworks by Yorushika', async () => {
    const candidates = await searchLrcCandidates('Evening Calm, Somewhere, Fireworks', '요루시카');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].syncedLyrics).toBeDefined();
  }, 20000);

  it('should properly preserve Japanese multi-byte characters like 差 in ceremony without corrupting to ufffd', async () => {
    const candidates = await searchLrcCandidates('ceremony', 'Awesome City Club');
    expect(candidates.length).toBeGreaterThan(0);
    const lyrics = candidates[0].syncedLyrics || '';
    expect(lyrics).toContain('眼差し');
    expect(lyrics).not.toContain('\ufffd');
  }, 20000);
});
