import { describe, it, expect } from 'vitest';
import { postProcessJapaneseTokens } from '../../../src/main/utils/japaneseLyricsDictionary';

describe('Japanese Lyrics Dictionary & Token Post-processing', () => {
  it('merges split 二 and 人 into 二人 with reading フタリ (ふたり)', () => {
    const rawTokens = [
      { surface_form: '二', reading: 'ニ', pos: '名詞' },
      { surface_form: '人', reading: 'ニン', pos: '名詞' },
      { surface_form: 'の', reading: 'ノ', pos: '助詞' },
      { surface_form: '世界', reading: 'セカイ', pos: '名詞' }
    ];

    const processed = postProcessJapaneseTokens(rawTokens);
    expect(processed).toHaveLength(3);
    expect(processed[0].surface_form).toBe('二人');
    expect(processed[0].reading).toBe('フタリ');
    expect(processed[1].surface_form).toBe('の');
    expect(processed[2].surface_form).toBe('世界');
  });

  it('corrects existing 二人 token if reading was erroneously ニニン', () => {
    const rawTokens = [
      { surface_form: '二人', reading: 'ニニン', pos: '名詞' }
    ];

    const processed = postProcessJapaneseTokens(rawTokens);
    expect(processed).toHaveLength(1);
    expect(processed[0].surface_form).toBe('二人');
    expect(processed[0].reading).toBe('フタリ');
  });

  it('merges split 一 and 人 into 一人 with reading ヒトリ (ひとり)', () => {
    const rawTokens = [
      { surface_form: '一', reading: 'イチ', pos: '名詞' },
      { surface_form: '人', reading: 'ニン', pos: '名詞' },
      { surface_form: 'で', reading: 'デ', pos: '助詞' }
    ];

    const processed = postProcessJapaneseTokens(rawTokens);
    expect(processed).toHaveLength(2);
    expect(processed[0].surface_form).toBe('一人');
    expect(processed[0].reading).toBe('ヒトリ');
  });

  it('preserves 二人前 (ににんまえ) without erroneously changing to ふたり', () => {
    const rawTokens = [
      { surface_form: '二', reading: 'ニ', pos: '名詞' },
      { surface_form: '人', reading: 'ニン', pos: '名詞' },
      { surface_form: '前', reading: 'マエ', pos: '名詞' }
    ];

    const processed = postProcessJapaneseTokens(rawTokens);
    expect(processed[0].surface_form).toBe('二');
    expect(processed[0].reading).toBe('ニ');
  });

  it('merges date counters like 二日 (ふつか) and 三日 (みっか)', () => {
    const rawTokens = [
      { surface_form: '二', reading: 'ニ', pos: '名詞' },
      { surface_form: '日', reading: 'ニチ', pos: '名詞' },
      { surface_form: '後', reading: 'ゴ', pos: '名詞' }
    ];

    const processed = postProcessJapaneseTokens(rawTokens);
    expect(processed[0].surface_form).toBe('二日');
    expect(processed[0].reading).toBe('フツカ');
  });

  it('merges 昨日 (きのう) and 今日 (きょう)', () => {
    const rawTokens = [
      { surface_form: '昨', reading: 'サク', pos: '名詞' },
      { surface_form: '日', reading: 'ジツ', pos: '名詞' }
    ];

    const processed = postProcessJapaneseTokens(rawTokens);
    expect(processed[0].surface_form).toBe('昨日');
    expect(processed[0].reading).toBe('キ노우' === 'キノウ' ? 'キノウ' : 'キノウ');
  });
});
