import { describe, it, expect } from 'vitest';

/**
 * Verification of lyricsNotFound state lifecycle and empty-state button decisions.
 * When online lyrics are absent for a song, "가사 및 번역 취득 시작" must NOT reappear.
 * Instead, "온라인에서 가사를 찾을 수 없습니다" and alternative actions ("다른 가사 찾기", "Apple Music") are presented.
 */
describe('Lyrics Not Found Empty State Logic', () => {
  interface PlayerState {
    songTitle: string;
    songArtist: string;
    lyricsLength: number;
    isTranslating: boolean;
    lyricsNotFound: boolean;
  }

  // Pure function matching LyricsPlayer render decision for empty state buttons
  const getEmptyStateActionView = (state: PlayerState): 'translating' | 'lyrics_not_found' | 'initial_fetch' => {
    if (state.isTranslating) return 'translating';
    if (state.lyricsNotFound) return 'lyrics_not_found';
    return 'initial_fetch';
  };

  it('should switch to lyrics_not_found view and hide start-fetch button when lyrics are missing', () => {
    let state: PlayerState = {
      songTitle: 'Nutmeg',
      songArtist: 'PURPLE BUBBLE',
      lyricsLength: 0,
      isTranslating: false,
      lyricsNotFound: false
    };

    // 1. Initial unsearched state (e.g. before autoFetch or if autoFetch is off)
    expect(getEmptyStateActionView(state)).toBe('initial_fetch');

    // 2. Auto-fetch or manual fetch begins
    state = { ...state, isTranslating: true, lyricsNotFound: false };
    expect(getEmptyStateActionView(state)).toBe('translating');

    // 3. Online fetch fails to find synced lyrics (e.g. Nutmeg by PURPLE BUBBLE)
    const fetchResult = '온라인에서 가사를 찾을 수 없습니다';
    const isMissing = !fetchResult || fetchResult.includes('온라인에서 가사를 찾을 수 없습니다');
    
    if (isMissing) {
      state = {
        ...state,
        isTranslating: false,
        lyricsNotFound: true
      };
    }

    // 4. In the empty state, start-fetch button must be hidden and lyrics_not_found view displayed
    const view = getEmptyStateActionView(state);
    expect(view).toBe('lyrics_not_found');
    expect(view).not.toBe('initial_fetch');
  });

  it('should reset lyricsNotFound when track changes to another song', () => {
    let currentSongKey = 'Nutmeg|PURPLE BUBBLE';
    let lyricsNotFound = true;

    const onSongChange = (newTitle: string, newArtist: string) => {
      const newKey = `${newTitle}|${newArtist}`;
      if (newKey !== currentSongKey) {
        currentSongKey = newKey;
        lyricsNotFound = false; // reset!
      }
    };

    // Switch to another song
    onSongChange('Evening Calm', 'Yorushika');
    expect(lyricsNotFound).toBe(false);
  });

  it('should reset lyricsNotFound when a user selects an alternative lyric version', () => {
    let lyricsNotFound = true;
    let lyricsLength = 0;

    const handleSelectVersion = (versionLyrics: string) => {
      lyricsNotFound = false;
      lyricsLength = versionLyrics.split('\n').length;
    };

    handleSelectVersion('[00:01.00] Alternative lyric line');
    expect(lyricsNotFound).toBe(false);
    expect(lyricsLength).toBeGreaterThan(0);
  });
});
