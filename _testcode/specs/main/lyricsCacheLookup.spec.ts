import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';

describe('Lyrics Cache Persistence and Retrieval Verification', () => {
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        resolve();
      });
    });
  });

  it('should retrieve existing translated lyrics without discarding them as corrupt', async () => {
    const orig = '[00:01.00] 誰かのために生きていく';
    const trans = '[00:01.00] 누군가를 위해 살아가고 있어';

    await new Promise<void>((resolve) => {
      db.run(
        'INSERT INTO lyrics_cache (song_title, artist, original_lyrics, translated_lyrics, translated_model) VALUES (?, ?, ?, ?, ?)',
        ['Test Song', 'Test Artist', orig, trans, 'test-model'],
        () => resolve()
      );
    });

    const row = await new Promise<any>((resolve) => {
      db.get(
        'SELECT original_lyrics, translated_lyrics, translated_model FROM lyrics_cache WHERE song_title = ? COLLATE NOCASE',
        ['Test Song'],
        (_, r) => resolve(r)
      );
    });

    expect(row).toBeDefined();
    expect(row.original_lyrics).toBe(orig);
    expect(row.translated_lyrics).toBe(trans);
    expect(row.original_lyrics.includes('\uFFFD')).toBe(false);
  });

  it('should only purge rows actually containing char(65533) and keep valid songs', async () => {
    const validOrig = '[00:01.00] 正常な歌詞';
    const corruptOrig = `[00:01.00] 破損した歌詞 ${String.fromCharCode(65533)}`;

    await new Promise<void>((resolve) => {
      db.run('INSERT INTO lyrics_cache (song_title, artist, original_lyrics) VALUES (?, ?, ?)', ['Valid', 'Artist', validOrig], () => {
        db.run('INSERT INTO lyrics_cache (song_title, artist, original_lyrics) VALUES (?, ?, ?)', ['Corrupt', 'Artist', corruptOrig], () => resolve());
      });
    });

    // Execute the exact cleanup query used in db.ts
    await new Promise<void>((resolve) => {
      db.run('DELETE FROM lyrics_cache WHERE INSTR(original_lyrics, char(65533)) > 0', () => resolve());
    });

    const remaining = await new Promise<any[]>((resolve) => {
      db.all('SELECT song_title FROM lyrics_cache', (_, rows) => resolve(rows));
    });

    expect(remaining.length).toBe(1);
    expect(remaining[0].song_title).toBe('Valid');
  });
});
