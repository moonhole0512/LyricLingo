export interface KuromojiToken {
  surface_form: string;
  reading?: string;
  pos?: string;
  [key: string]: any;
}

/**
 * Merges split numeral/counter compounds and corrects lyric-specific morphological parsing.
 * For example:
 * - Kuromoji splits '二人' into '二'(ニ) + '人'(ニン) -> merges to '二人'(フタリ)
 * - Kuromoji splits '一人' into '一'(イチ) + '人'(ニン) -> merges to '一人'(ヒトリ)
 * - Date counters: '二' + '日' -> '二日'(フツカ), '三' + '日' -> '三日'(ミッカ), etc.
 */
export function postProcessJapaneseTokens(tokens: KuromojiToken[]): KuromojiToken[] {
  if (!tokens || tokens.length === 0) return [];

  const merged: KuromojiToken[] = [];
  let i = 0;

  while (i < tokens.length) {
    const curr = tokens[i];
    const next = tokens[i + 1];
    const nextNext = tokens[i + 2];

    const currSurface = curr.surface_form || '';
    const nextSurface = next?.surface_form || '';
    const nextNextSurface = nextNext?.surface_form || '';

    // Handle existing compound '二人' with reading 'ニニン'
    if (currSurface === '二人') {
      if (nextSurface !== '前' && nextSurface !== '三脚') {
        merged.push({
          ...curr,
          reading: 'フタリ'
        });
        i++;
        continue;
      }
    }

    // Handle existing compound '一人' with reading 'イチニン'
    if (currSurface === '一人') {
      if (nextSurface !== '前') {
        merged.push({
          ...curr,
          reading: 'ヒトリ'
        });
        i++;
        continue;
      }
    }

    // 二 + 人 -> 二人 (ふたり), unless followed by 前 (二人前) or 三脚 (二人三脚)
    if (currSurface === '二' && nextSurface === '人') {
      if (nextNextSurface === '前' || nextNextSurface === '三脚') {
        merged.push({ ...curr });
        i++;
        continue;
      }
      merged.push({
        ...curr,
        surface_form: '二人',
        reading: 'フタリ',
        pos: '名詞'
      });
      i += 2;
      continue;
    }

    // 一 + 人 -> 一人 (ひとり), unless followed by 前 (一人前)
    if (currSurface === '一' && nextSurface === '人') {
      if (nextNextSurface === '前') {
        merged.push({ ...curr });
        i++;
        continue;
      }
      merged.push({
        ...curr,
        surface_form: '一人',
        reading: 'ヒトリ',
        pos: '名詞'
      });
      i += 2;
      continue;
    }

    // 三 + 人 -> 三人 (さんにん)
    if (currSurface === '三' && nextSurface === '人') {
      merged.push({
        ...curr,
        surface_form: '三人',
        reading: 'サンニン',
        pos: '名詞'
      });
      i += 2;
      continue;
    }

    // 四 + 人 -> 四人 (よにん)
    if (currSurface === '四' && nextSurface === '人') {
      merged.push({
        ...curr,
        surface_form: '四人',
        reading: 'ヨニン',
        pos: '名詞'
      });
      i += 2;
      continue;
    }

    // Date counters: 二日, 三日, 四日, etc.
    const dateMap: Record<string, { surface: string; reading: string }> = {
      '二': { surface: '二日', reading: 'フツカ' },
      '三': { surface: '三日', reading: 'ミッカ' },
      '四': { surface: '四日', reading: 'ヨッカ' },
      '五': { surface: '五日', reading: 'イツカ' },
      '六': { surface: '六日', reading: 'ムイカ' },
      '七': { surface: '七日', reading: 'ナノカ' },
      '八': { surface: '八日', reading: 'ヨウカ' },
      '九': { surface: '九日', reading: 'ココノカ' },
      '十': { surface: '十日', reading: 'トオカ' }
    };

    if (nextSurface === '日' && dateMap[currSurface]) {
      merged.push({
        ...curr,
        surface_form: dateMap[currSurface].surface,
        reading: dateMap[currSurface].reading,
        pos: '名詞'
      });
      i += 2;
      continue;
    }

    // 昨 + 日 -> 昨日 (きのう)
    if (currSurface === '昨' && nextSurface === '日') {
      merged.push({
        ...curr,
        surface_form: '昨日',
        reading: 'キノウ',
        pos: '名詞'
      });
      i += 2;
      continue;
    }

    // 今 + 日 -> 今日 (きょう)
    if (currSurface === '今' && nextSurface === '日') {
      merged.push({
        ...curr,
        surface_form: '今日',
        reading: 'キョウ',
        pos: '名詞'
      });
      i += 2;
      continue;
    }

    merged.push({ ...curr });
    i++;
  }

  return merged;
}
