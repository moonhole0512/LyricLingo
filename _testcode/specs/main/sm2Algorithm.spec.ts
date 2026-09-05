import { describe, it, expect } from 'vitest';
import { calculateNextReview } from '../../../src/main/utils/sm2Algorithm';

describe('SM-2 Algorithm (SuperMemo-2)', () => {
  it('should increase interval to 1 day on first correct answer', () => {
    // interval: 0, repetitions: 0, easeFactor: 2.5
    const result = calculateNextReview(0, 0, 2.5, 4); // score 4 = correct
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
  });

  it('should increase interval to 6 days on second correct answer (default SM2)', () => {
    const result = calculateNextReview(1, 1, 2.5, 4);
    expect(result.intervalDays).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it('should reset interval to 1 day on incorrect answer (score < 3)', () => {
    const result = calculateNextReview(6, 2, 2.5, 2); // score 2 = incorrect
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(0); // reset repetitions
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  it('should correctly calculate future review date', () => {
    const now = new Date('2026-07-15T00:00:00Z');
    const result = calculateNextReview(1, 1, 2.5, 4, now);
    expect(result.nextReviewDate.toISOString()).toBe('2026-07-21T00:00:00.000Z'); // +6 days
  });
});
