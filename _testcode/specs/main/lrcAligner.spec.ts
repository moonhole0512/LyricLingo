import { describe, it, expect } from 'vitest';
import { parseLrcLines, alignLrc, mergeReTranslatedLines, isUntranslated } from '../../../src/main/utils/lrcAligner';

describe('LRC Aligner & Missing Line Detector', () => {
  it('should parse timestamp lines correctly', () => {
    const lrc = `
[00:10.00] Line A
[00:20.50] Line B
    `;
    const lines = parseLrcLines(lrc);
    expect(lines).toHaveLength(2);
    expect(lines[0].timeTag).toBe('[00:10.00]');
    expect(lines[0].timeMs).toBe(10000);
    expect(lines[0].text).toBe('Line A');
  });

  it('should align 1:1 when all timestamps match', () => {
    const orig = `[00:10.00] Original A\n[00:20.00] Original B`;
    const trans = `[00:10.00] Translation A\n[00:20.00] Translation B`;

    const result = alignLrc(orig, trans);
    expect(result.missingLines).toHaveLength(0);
    expect(result.alignedLrc).toContain('[00:10.00] Translation A');
    expect(result.alignedLrc).toContain('[00:20.00] Translation B');
  });

  it('should detect missing lines when AI skips a timestamp', () => {
    const orig = `
[00:10.00] Line 1
[00:20.00] Line 2
[00:30.00] Line 3
`;
    // AI skipped line 2 timestamp [00:20.00]
    const trans = `
[00:10.00] 번역 1
[00:30.00] 번역 3
`;

    const result = alignLrc(orig, trans);
    expect(result.missingLines).toHaveLength(1);
    expect(result.missingLines[0].timeTag).toBe('[00:20.00]');
    expect(result.missingLines[0].text).toBe('Line 2');
  });

  it('should merge re-translated lines back into the LRC text', () => {
    const orig = `[00:10.00] Line 1\n[00:20.00] Line 2\n[00:30.00] Line 3`;
    const trans = `[00:10.00] 번역 1\n[00:20.00] \n[00:30.00] 번역 3`;
    const fixedMap = { 1: '재번역 2' };

    const merged = mergeReTranslatedLines(orig, trans, fixedMap);
    expect(merged).toContain('[00:10.00] 번역 1');
    expect(merged).toContain('[00:20.00] 재번역 2');
    expect(merged).toContain('[00:30.00] 번역 3');
  });

  it('should correctly detect untranslated LRC content', () => {
    const orig = `[00:10.00] いつか観ていた映画の中みたい\n[00:20.00] 工事中の駅前`;
    const copiedTrans = `[00:10.00] いつか観ていた映画の中みたい\n[00:20.00] 工事中の駅前`;
    const validTrans = `[00:10.00] 언젠가 보고 있던 영화 속 같아\n[00:20.00] 공사 중인 역 앞`;

    expect(isUntranslated(orig, copiedTrans)).toBe(true);
    expect(isUntranslated(orig, validTrans)).toBe(false);
  });
});
