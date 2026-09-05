import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { initDatabase } from '../../../src/main/database/db';
import { translateLyrics } from '../../../src/main/ai';
import { extractLrcDurationMs, calculateSmartSyncOffset, cleanLyricText, parseLyrics } from '../../../src/main/utils/lyricsParser';
import { rankLrcCandidates } from '../../../src/main/utils/lrcSearcher';

describe('New Features Verification', () => {
  let db: sqlite3.Database;

  beforeEach(() => {
    db = new sqlite3.Database(':memory:');
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS lyrics_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_title TEXT NOT NULL,
            artist TEXT NOT NULL,
            original_lyrics TEXT NOT NULL,
            translated_lyrics TEXT,
            cover TEXT,
            translated_model TEXT,
            translated_model_info TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
  });

  afterEach(() => {
    db.close();
  });

  it('should save and retrieve translated_model and translated_model_info in SQLite', async () => {
    const songTitle = 'Test Track';
    const artist = 'Test Artist';
    const originalLyrics = '[00:10.00] Hello World';
    const translatedLyrics = '[00:10.00] 안녕 세계';
    const model = 'qwen2.5-7b-instruct';
    const modelInfo = {
      model: 'qwen2.5-7b-instruct',
      provider: 'lmstudio',
      baseUrl: 'http://127.0.0.1:1234/v1',
      elapsedSeconds: '2.5',
      tps: '45.0',
      targetLanguage: 'Korean',
      timestamp: new Date().toISOString()
    };

    await new Promise<void>((resolve) => {
      db.run(
        `INSERT INTO lyrics_cache (song_title, artist, original_lyrics, translated_lyrics, translated_model, translated_model_info) VALUES (?, ?, ?, ?, ?, ?)`,
        [songTitle, artist, originalLyrics, translatedLyrics, model, JSON.stringify(modelInfo)],
        () => resolve()
      );
    });

    const row = await new Promise<any>((resolve) => {
      db.get(`SELECT * FROM lyrics_cache WHERE song_title = ?`, [songTitle], (_, r) => resolve(r));
    });

    expect(row).toBeDefined();
    expect(row.translated_model).toBe('qwen2.5-7b-instruct');
    const parsedInfo = JSON.parse(row.translated_model_info);
    expect(parsedInfo.tps).toBe('45.0');
    expect(parsedInfo.targetLanguage).toBe('Korean');
  });

  it('should sort LRC versions by song duration closeness using rankLrcCandidates', () => {
    const targetDurationSec = 200; // 3m 20s
    const mockMatches = [
      { id: 1, trackName: 'Song A (Far)', duration: 120, syncedLyrics: 'Short' }, // diff = 80s
      { id: 2, trackName: 'Song B (Exact)', duration: 200.2, syncedLyrics: 'Medium length lyrics' }, // diff = 0.2s
      { id: 3, trackName: 'Song C (5s off with many kanji)', duration: 205.5, syncedLyrics: 'Very long text with 漢字 and 歌詞' }  // diff = 5.5s
    ];

    const ranked = rankLrcCandidates(mockMatches, targetDurationSec);

    expect(ranked[0].trackName).toBe('Song B (Exact)');
    expect(ranked[1].trackName).toBe('Song C (5s off with many kanji)');
    expect(ranked[2].trackName).toBe('Song A (Far)');
  });

  it('should format model performance metrics and real-time tokens correctly', async () => {
    const fs = require('fs');
    const path = require('path');
    const e2ePath = path.join(process.cwd(), '.e2e');
    const createdE2E = !fs.existsSync(e2ePath);
    if (createdE2E) fs.writeFileSync(e2ePath, 'true');

    let receivedProgress: any = null;

    try {
      const res = await translateLyrics('[00:01.00] Test', 'test-model', (p) => {
        receivedProgress = p;
      });
      expect(res).toBeDefined();
      expect(res.model).toBe('test-model');
      expect(res.modelInfo).toBeDefined();
      expect(res.modelInfo.model).toBe('test-model');
      expect(res.modelInfo.elapsedSeconds).toBeDefined();
      expect(res.modelInfo.tps).toBeDefined();
      expect(res.modelInfo.promptTokens).toBeDefined();
      expect(res.modelInfo.completionTokens).toBeDefined();
      expect(res.modelInfo.totalTokens).toBeDefined();

      expect(receivedProgress).toBeDefined();
      expect(receivedProgress.promptTokens).toBeDefined();
      expect(receivedProgress.completionTokens).toBeDefined();
      expect(receivedProgress.tps).toBeDefined();
    } finally {
      if (createdE2E && fs.existsSync(e2ePath)) {
        fs.unlinkSync(e2ePath);
      }
    }
  });

  it('should extract lrc duration correctly from tag or last line timestamp', () => {
    const lrcWithTag = `[length: 03:03.50]\n[00:05.00] Line 1\n[02:58.00] Line 2`;
    expect(extractLrcDurationMs(lrcWithTag)).toBe(183500);

    const lrcWithoutTag = `[00:05.00] Line 1\n[02:50.00] Last line`;
    expect(extractLrcDurationMs(lrcWithoutTag)).toBe(175000); // 170000 + 5000ms
  });

  it('should calculate smart sync offset based on duration difference', () => {
    // Case 1: Lyrics is 3.0 seconds longer than music (180s vs 183s) -> Shift earlier (+3000ms offset)
    const resEarlier = calculateSmartSyncOffset(180000, 183000, 800);
    expect(resEarlier.isDiffSignificant).toBe(true);
    expect(resEarlier.diffSec).toBe(-3.0);
    expect(resEarlier.recommendedDirection).toBe('earlier');
    expect(resEarlier.recommendedOffsetMs).toBe(3800); // 800 + 3000
    expect(resEarlier.reverseOffsetMs).toBe(-2200);

    // Case 2: Music is 3.0 seconds longer than lyrics (183s vs 180s) -> Shift later (-3000ms offset)
    const resLater = calculateSmartSyncOffset(183000, 180000, 800);
    expect(resLater.isDiffSignificant).toBe(true);
    expect(resLater.diffSec).toBe(3.0);
    expect(resLater.recommendedDirection).toBe('later');
    expect(resLater.recommendedOffsetMs).toBe(-2200); // 800 - 3000
    expect(resLater.reverseOffsetMs).toBe(3800);

    // Case 3: Negligible difference (< 1.5s) -> Not significant
    const resMinor = calculateSmartSyncOffset(180000, 180800, 800);
    expect(resMinor.isDiffSignificant).toBe(false);
    expect(resMinor.recommendedOffsetMs).toBe(800);
  });

  it('should accurately convert Japanese furigana readings between hiragana and katakana', () => {
    const katakanaToHiragana = (str: string) => str.replace(/[\u30A1-\u30F6]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60));
    const hiraganaToKatakana = (str: string) => str.replace(/[\u3041-\u3096]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60));

    const kuromojiReading = 'ナイモノネダリ'; // Kuromoji reading default
    const asHiragana = katakanaToHiragana(kuromojiReading);
    const asKatakana = hiraganaToKatakana(asHiragana);

    expect(asHiragana).toBe('ないものねだり');
    expect(asKatakana).toBe('ナイモノネダリ');

    const loveReading = 'アイシテル';
    expect(katakanaToHiragana(loveReading)).toBe('あいしてる');
    expect(hiraganaToKatakana('あいしてる')).toBe('アイシテル');
  });

  it('should clean broken timestamp prefixes such as [00: from lyrics', () => {
    expect(cleanLyricText('[00: 어떻게 생각해?')).toBe('어떻게 생각해?');
    expect(cleanLyricText('[01: 어떻게 생각해?')).toBe('어떻게 생각해?');
    expect(cleanLyricText('[00:05.12] 어떻게 생각해?')).toBe('어떻게 생각해?');
    expect(cleanLyricText('정상 가사 라인')).toBe('정상 가사 라인');
    expect(cleanLyricText('[Music]')).toBe('[Music]');

    // Verify parseLyrics sanitizes broken prefix while parsing valid timestamp
    const brokenLrc = '[00:05.12] [00: 어떻게 생각해?\n[00:10.50] [01: 그래 좋아';
    const parsed = parseLyrics(brokenLrc);
    expect(parsed[0].timeMs).toBe(5120);
    expect(parsed[0].text).toBe('어떻게 생각해?');
    expect(parsed[1].timeMs).toBe(10500);
    expect(parsed[1].text).toBe('그래 좋아');
  });
});
