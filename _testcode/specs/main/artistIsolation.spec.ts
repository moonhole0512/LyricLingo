import { describe, it, expect } from 'vitest';
import { searchLrcCandidates } from '../../../src/main/utils/lrcSearcher';

describe('Artist Isolation in LRC Search', () => {
  it('should NOT return unrelated artist matches when a specific artist is searched (Nutmeg by PURPLE BUBBLE)', async () => {
    const candidates = await searchLrcCandidates('Nutmeg', 'PURPLE BUBBLE', 199);
    // Since LRCLib has no songs by PURPLE BUBBLE, it must return 0 candidates
    // and NEVER return songs by Ghostface Killah or other artists.
    expect(candidates).toHaveLength(0);
  }, 20000);

  it('should still successfully find matches when artist matches (Evening Calm by Yorushika)', async () => {
    const candidates = await searchLrcCandidates('Evening Calm, Somewhere, Fireworks', '요루시카');
    expect(candidates.length).toBeGreaterThan(0);
    const hasYorushika = candidates.some(c => 
      c.artistName.toLowerCase().includes('yorushika') || 
      c.artistName.includes('ヨルシカ') ||
      c.artistName.includes('요루시카')
    );
    expect(hasYorushika).toBe(true);
  }, 20000);

  it('should still successfully find matches for ceremony by Awesome City Club', async () => {
    const candidates = await searchLrcCandidates('ceremony', 'Awesome City Club');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].artistName).toBe('Awesome City Club');
  }, 20000);
});
