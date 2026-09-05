import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { areLyricsEquivalent, normalizeLrcForComparison } from '../../../src/main/utils/lyricsParser';

describe('Lyric Version Equivalence & Cache Reuse Verification', () => {
  describe('areLyricsEquivalent & normalizeLrcForComparison', () => {
    it('should normalize metadata tags and timestamps accurately', () => {
      const lrcWithMeta = '[length: 03:45]\n[ar: Yorushika]\n[01:12.34] 花惑い\n[01:15.00] 夕凪';
      const lrcClean = '[01:12.34] 花惑이\n[01:15.00] 夕凪';

      expect(areLyricsEquivalent(lrcWithMeta, lrcClean)).toBe(false);

      const lrcSameText = '[01:12.34] 花惑い\n[01:15.00] 夕凪';
      expect(areLyricsEquivalent(lrcWithMeta, lrcSameText)).toBe(true);
    });

    it('should recognize centisecond differences and format variations (.0 vs .00 vs .000)', () => {
      const lrcA = '[00:05.10] Line 1\n[00:10.50] Line 2';
      const lrcB = '[00:05.100] Line 1\r\n[00:10.5] Line 2\r\n';
      expect(areLyricsEquivalent(lrcA, lrcB)).toBe(true);
    });

    it('should return false when lines or timestamps meaningfully differ', () => {
      const lrcA = '[00:05.00] Line 1\n[00:10.00] Line 2';
      const lrcB = '[00:05.00] Line 1\n[00:15.00] Line 2';
      const lrcC = '[00:05.00] Line 1\n[00:10.00] Different text';

      expect(areLyricsEquivalent(lrcA, lrcB)).toBe(false);
      expect(areLyricsEquivalent(lrcA, lrcC)).toBe(false);
      expect(areLyricsEquivalent(lrcA, null)).toBe(false);
      expect(areLyricsEquivalent('', lrcB)).toBe(false);
    });
  });

  describe('Multi-version Lyrics Cache Retrieval', () => {
    let db: sqlite3.Database;

    beforeEach(async () => {
      db = new sqlite3.Database(':memory:');
      await new Promise<void>((resolve) => {
        db.serialize(() => {
          db.run(`
            CREATE TABLE lyrics_cache (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              song_title TEXT NOT NULL,
              artist TEXT NOT NULL,
              original_lyrics TEXT NOT NULL,
              translated_lyrics TEXT,
              cover TEXT,
              translated_model TEXT,
              translated_model_info TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
          resolve();
        });
      });
    });

    it('should find the matching version translation when multiple versions coexist for a song', async () => {
      const version1Lrc = '[00:01.00] Verse 1 Version 1\n[00:05.00] Chorus Version 1';
      const version1Trans = '[00:01.00] 1절 버전 1\n[00:05.00] 후렴 버전 1';

      const version2Lrc = '[00:01.50] Verse 1 Version 2 (Live)\n[00:05.50] Chorus Version 2';
      const version2Trans = '[00:01.50] 1절 버전 2 (라이브)\n[00:05.50] 후렴 버전 2';

      await new Promise<void>((resolve) => {
        db.run(
          'INSERT INTO lyrics_cache (song_title, artist, original_lyrics, translated_lyrics, translated_model) VALUES (?, ?, ?, ?, ?)',
          ['Shape of You', 'Ed Sheeran', version1Lrc, version1Trans, 'test-model-v1'],
          () => {
            db.run(
              'INSERT INTO lyrics_cache (song_title, artist, original_lyrics, translated_lyrics, translated_model) VALUES (?, ?, ?, ?, ?)',
              ['Shape of You', 'Ed Sheeran', version2Lrc, version2Trans, 'test-model-v2'],
              () => resolve()
            );
          }
        );
      });

      const rows: any[] = await new Promise((resolve) => {
        db.all(
          'SELECT * FROM lyrics_cache WHERE song_title = ? COLLATE NOCASE ORDER BY id DESC',
          ['Shape of You'],
          (_, r) => resolve(r)
        );
      });

      expect(rows.length).toBe(2);

      const queryV1 = '[length: 03:50]\n[00:01.000] Verse 1 Version 1\n[00:05.000] Chorus Version 1';
      const matchV1 = rows.find(r => areLyricsEquivalent(r.original_lyrics, queryV1));
      expect(matchV1).toBeDefined();
      expect(matchV1.translated_lyrics).toBe(version1Trans);
      expect(matchV1.translated_model).toBe('test-model-v1');

      const queryV2 = '[00:01.50] Verse 1 Version 2 (Live)\r\n[00:05.50] Chorus Version 2\r\n';
      const matchV2 = rows.find(r => areLyricsEquivalent(r.original_lyrics, queryV2));
      expect(matchV2).toBeDefined();
      expect(matchV2.translated_lyrics).toBe(version2Trans);
      expect(matchV2.translated_model).toBe('test-model-v2');
    });

    it('should reuse existing translation without clearing when selecting the same lyric version', async () => {
      const lrc = '[00:01.00] Line A\n[00:05.00] Line B';
      const trans = '[00:01.00] 번역 라인 A\n[00:05.00] 번역 라인 B';

      await new Promise<void>((resolve) => {
        db.run(
          'INSERT INTO lyrics_cache (song_title, artist, original_lyrics, translated_lyrics) VALUES (?, ?, ?, ?)',
          ['Song A', 'Artist A', lrc, trans],
          () => resolve()
        );
      });

      const targetLyrics = '[length: 02:30]\n[00:01.00] Line A\n[00:05.00] Line B';
      const rows: any[] = await new Promise((resolve) => {
        db.all(
          'SELECT * FROM lyrics_cache WHERE song_title = ? COLLATE NOCASE',
          ['Song A'],
          (_, r) => resolve(r)
        );
      });

      const matchingRow = rows.find(r => areLyricsEquivalent(r.original_lyrics, targetLyrics));
      expect(matchingRow).toBeDefined();
      expect(matchingRow.translated_lyrics).toBeTruthy();

      let result: any = null;
      if (matchingRow && matchingRow.translated_lyrics) {
        result = {
          success: true,
          hasCachedTranslation: true,
          originalLyrics: matchingRow.original_lyrics,
          translatedLyrics: matchingRow.translated_lyrics
        };
      }

      expect(result.hasCachedTranslation).toBe(true);
      expect(result.translatedLyrics).toBe(trans);
    });

    it('should guarantee that only ONE candidate is marked as current even if multiple identical versions exist', () => {
      const activeLrc = '[00:01.00] Line 1\n[00:05.00] Line 2';
      const candidate1 = { id: 101, trackName: 'Song A', syncedLyrics: '[00:01.00] Line 1\n[00:05.00] Line 2' };
      const candidate2 = { id: 102, trackName: 'Song A (Dup)', syncedLyrics: '[length: 03:00]\n[00:01.000] Line 1\r\n[00:05.000] Line 2' };
      const candidate3 = { id: 103, trackName: 'Song A (Diff)', syncedLyrics: '[00:01.00] Completely different' };

      const lrcVersions = [candidate1, candidate2, candidate3];

      // Logic used in renderVersionsModal
      const currentVersionIndex = lrcVersions.findIndex((v) => areLyricsEquivalent(v.syncedLyrics, activeLrc));
      const isCurrentFlags = lrcVersions.map((_, i) => i === currentVersionIndex);

      expect(currentVersionIndex).toBe(0);
      expect(isCurrentFlags).toEqual([true, false, false]);
      expect(isCurrentFlags.filter(Boolean).length).toBe(1);
    });

    it('should deduplicate candidates with equivalent syncedLyrics', () => {
      const rawCandidates = [
        { id: 1, trackName: '回レ!雪月花', syncedLyrics: '[00:01.00] せ～の\n[00:05.00] ほい' },
        { id: 2, trackName: '回レ！雪月花', syncedLyrics: '[length: 03:55]\n[00:01.000] せ～の\r\n[00:05.000] ほい' },
        { id: 3, trackName: '回レ!雪月花 (Alt)', syncedLyrics: '[00:02.00] 異なる歌詞\n[00:06.00] バージョン' }
      ];

      const deduped: any[] = [];
      for (const item of rawCandidates) {
        if (!deduped.some((existing) => areLyricsEquivalent(existing.syncedLyrics, item.syncedLyrics))) {
          deduped.push(item);
        }
      }

      expect(deduped.length).toBe(2);
      expect(deduped[0].id).toBe(1);
      expect(deduped[1].id).toBe(3);
    });
  });
});
