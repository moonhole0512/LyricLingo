import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron';

const isDev = !app.isPackaged;
const dbDir = isDev ? process.cwd() : app.getPath('userData');
const dbPath = path.join(dbDir, 'lyriclingo.db');

export function initDatabase(): sqlite3.Database {
  const db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS lyrics_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          song_title TEXT NOT NULL,
          artist TEXT NOT NULL,
          original_lyrics TEXT NOT NULL,
          translated_lyrics TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS vocabulary (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          word_or_sentence TEXT NOT NULL,
          normalized_word TEXT,
          reading TEXT,
          lemma TEXT,
          part_of_speech TEXT,
          meaning TEXT NOT NULL,
          literal_meaning TEXT,
          contextual_meaning TEXT,
          natural_translation TEXT,
          usage_note TEXT,
          examples_json TEXT,
          context_sentence TEXT,
          lyrics_time_ms INTEGER,
          song_title TEXT,
          artist TEXT,
          user_note TEXT,
          difficulty TEXT DEFAULT 'unknown',
          interval_days INTEGER DEFAULT 1,
          ease_factor REAL DEFAULT 2.5,
          repetitions INTEGER DEFAULT 0,
          next_review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'learning',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_reviewed_at TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS learning_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          study_date DATE UNIQUE NOT NULL,
          words_added_count INTEGER DEFAULT 0,
          words_reviewed_count INTEGER DEFAULT 0,
          correct_answers_count INTEGER DEFAULT 0
      )
    `);

    // Migrations
    db.run("ALTER TABLE lyrics_cache ADD COLUMN source_type TEXT DEFAULT 'local_ai'", () => {});
    db.run("ALTER TABLE lyrics_cache ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN ai_explanation TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN normalized_word TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN reading TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN lemma TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN part_of_speech TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN literal_meaning TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN contextual_meaning TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN natural_translation TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN usage_note TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN examples_json TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN lyrics_time_ms INTEGER", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN user_note TEXT", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN difficulty TEXT DEFAULT 'unknown'", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", () => {});
    db.run("ALTER TABLE vocabulary ADD COLUMN last_reviewed_at TIMESTAMP", () => {});
    db.run("ALTER TABLE lyrics_cache ADD COLUMN cover TEXT", () => {});
    db.run("ALTER TABLE lyrics_cache ADD COLUMN translated_model TEXT", () => {});
    db.run("ALTER TABLE lyrics_cache ADD COLUMN translated_model_info TEXT", () => {});

    // Indexes for Performance
    db.run("CREATE INDEX IF NOT EXISTS idx_lyrics_cache_song_artist ON lyrics_cache(song_title, artist)", () => {});
    db.run("CREATE INDEX IF NOT EXISTS idx_vocabulary_song_artist ON vocabulary(song_title, artist)", () => {});
    db.run("CREATE INDEX IF NOT EXISTS idx_vocabulary_review_date ON vocabulary(next_review_date)", () => {});
    db.run("CREATE INDEX IF NOT EXISTS idx_vocabulary_normalized_word ON vocabulary(normalized_word)", () => {});

    // Clean up corrupted UTF-8 cache rows containing replacement characters
    db.run("DELETE FROM lyrics_cache WHERE INSTR(original_lyrics, char(65533)) > 0", () => {});
    // Clean up test dummy records and corrupted vocabulary entries
    db.run("DELETE FROM vocabulary WHERE word_or_sentence IN ('모의 단어', '모의 가사') OR song_title IN ('Test Song', 'Visual Song') OR INSTR(word_or_sentence, char(65533)) > 0", () => {});
  });

  return db;
}

let dbInstance: sqlite3.Database | null = null;
export function getDb() {
  if (!dbInstance) {
    dbInstance = initDatabase();
  }
  return dbInstance;
}
