import { describe, it, expect } from 'vitest';

/**
 * Logic test for auto-fetch guard to ensure lyrics are only requested ONCE per song
 * when online lyrics are missing, preventing infinite request loops.
 */
describe('Auto-fetch Guard Logic', () => {
  it('should only trigger autoFetch once per unique song when lyrics are absent', () => {
    let attemptedKey = '';
    let fetchCount = 0;

    const simulateEffect = (song: { title: string; artist: string; lrc: string | null }, isTranslating: boolean) => {
      const songKey = `${song.title}|${song.artist}`;
      if (!songKey || songKey === '|') return;

      if (!song.lrc && !isTranslating && attemptedKey !== songKey) {
        attemptedKey = songKey;
        fetchCount++;
      }
    };

    const songNutmeg = { title: 'Nutmeg', artist: 'PURPLE BUBBLE', lrc: null };

    // 1. Initial play: triggers fetch once
    simulateEffect(songNutmeg, false);
    expect(fetchCount).toBe(1);

    // 2. While fetching (isTranslating = true)
    simulateEffect(songNutmeg, true);
    expect(fetchCount).toBe(1);

    // 3. Fetch finishes with failure (lrc remains null, isTranslating = false)
    simulateEffect(songNutmeg, false);
    expect(fetchCount).toBe(1); // Must NOT re-trigger!

    // 4. Repeated position updates arrive from Apple Music (lrc still null)
    simulateEffect(songNutmeg, false);
    simulateEffect(songNutmeg, false);
    expect(fetchCount).toBe(1); // Still 1, no infinite loop!

    // 5. Track changes to Song B
    const songB = { title: 'Dried Flower', artist: 'Yuuri', lrc: null };
    simulateEffect(songB, false);
    expect(fetchCount).toBe(2); // Triggers once for new song!

    // 6. Song B also fails or updates: does not re-trigger
    simulateEffect(songB, false);
    expect(fetchCount).toBe(2);
  });
});
