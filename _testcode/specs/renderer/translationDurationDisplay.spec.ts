import { describe, it, expect } from 'vitest';

export function formatCompletedBadgeStats(
  translatedModelInfo?: {
    completionTokens?: number;
    totalTokens?: number;
    tps?: string;
    elapsedSeconds?: string;
  } | null,
  liveElapsedSeconds?: string
): string | null {
  const elapsed = translatedModelInfo?.elapsedSeconds
    ? `${translatedModelInfo.elapsedSeconds}s`
    : liveElapsedSeconds
    ? `${liveElapsedSeconds}s`
    : '';
  const tokens = translatedModelInfo?.completionTokens
    ? `${translatedModelInfo.completionTokens}tok`
    : '';
  const tps = translatedModelInfo?.tps ? `${translatedModelInfo.tps} t/s` : '';
  const stats = [tokens, tps, elapsed].filter(Boolean).join(' · ');
  return stats || null;
}

export function formatHistoryBadgeStats(info?: {
  completionTokens?: number;
  tps?: string;
  elapsedSeconds?: string;
} | null): string {
  const stats = [
    info?.completionTokens ? `${info.completionTokens}tok` : '',
    info?.tps ? `${info.tps} t/s` : '',
    info?.elapsedSeconds ? `${info.elapsedSeconds}s` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  return stats;
}

describe('Translation Duration Display in Completed Badges', () => {
  it('formats badge stats with tokens, tps, and elapsedSeconds when modelInfo is complete', () => {
    const modelInfo = {
      completionTokens: 45,
      tps: '18.2',
      elapsedSeconds: '2.5'
    };
    const result = formatCompletedBadgeStats(modelInfo);
    expect(result).toBe('45tok · 18.2 t/s · 2.5s');
  });

  it('falls back to liveElapsedSeconds if modelInfo has no elapsedSeconds', () => {
    const modelInfo = {
      completionTokens: 30,
      tps: '15.0'
    };
    const result = formatCompletedBadgeStats(modelInfo, '3.4');
    expect(result).toBe('30tok · 15.0 t/s · 3.4s');
  });

  it('displays only elapsed seconds if tokens and tps are not available', () => {
    const modelInfo = {
      elapsedSeconds: '1.8'
    };
    const result = formatCompletedBadgeStats(modelInfo);
    expect(result).toBe('1.8s');
  });

  it('displays liveElapsedSeconds even when modelInfo is null', () => {
    const result = formatCompletedBadgeStats(null, '4.2');
    expect(result).toBe('4.2s');
  });

  it('formats history sidebar badge stats with elapsed duration included', () => {
    const historyInfo = {
      completionTokens: 52,
      tps: '21.0',
      elapsedSeconds: '2.4'
    };
    const result = formatHistoryBadgeStats(historyInfo);
    expect(result).toBe('52tok · 21.0 t/s · 2.4s');
  });

  it('handles history sidebar badge with only elapsed seconds gracefully', () => {
    const historyInfo = {
      elapsedSeconds: '5.1'
    };
    const result = formatHistoryBadgeStats(historyInfo);
    expect(result).toBe('5.1s');
  });
});
