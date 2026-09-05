import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'
import { appendDebugLog, logError, logInfo } from '../../../src/main/utils/logger'

describe('Database Schema & Migration Verification', () => {
  let db: sqlite3.Database

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:')
    await new Promise<void>((resolve) => {
      db.serialize(() => {
        // Create table as it was in legacy schema (without updated_at)
        db.run(`
          CREATE TABLE lyrics_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_title TEXT NOT NULL,
            artist TEXT NOT NULL,
            original_lyrics TEXT NOT NULL,
            translated_lyrics TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `)
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => db.close(() => resolve()))
  })

  it('should successfully add updated_at column without non-constant default error and support UPDATE queries', async () => {
    // 1. In SQLite, adding column with CURRENT_TIMESTAMP fails.
    // Verify that adding column without non-constant default succeeds.
    await new Promise<void>((resolve, reject) => {
      db.run('ALTER TABLE lyrics_cache ADD COLUMN updated_at TIMESTAMP', (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // 2. Insert test row
    await new Promise<void>((resolve, reject) => {
      db.run(
        'INSERT INTO lyrics_cache (song_title, artist, original_lyrics) VALUES (?, ?, ?)',
        ['Teenager Forever', 'King Gnu', '[00:01.00] Test Lyric'],
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })

    // 3. Perform update query using updated_at = CURRENT_TIMESTAMP
    await new Promise<void>((resolve, reject) => {
      db.run(
        'UPDATE lyrics_cache SET translated_lyrics = ?, updated_at = CURRENT_TIMESTAMP WHERE song_title = ?',
        ['[00:01.00] 번역 가사', 'Teenager Forever'],
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })

    // 4. Verify updated_at is populated and queryable
    const row = await new Promise<any>((resolve, reject) => {
      db.get('SELECT id, song_title, translated_lyrics, updated_at FROM lyrics_cache WHERE song_title = ?', ['Teenager Forever'], (err, r) => {
        if (err) reject(err)
        else resolve(r)
      })
    })

    expect(row).toBeDefined()
    expect(row.song_title).toBe('Teenager Forever')
    expect(row.translated_lyrics).toBe('[00:01.00] 번역 가사')
    expect(row.updated_at).toBeDefined()
    expect(row.updated_at).not.toBeNull()
  })

  it('should write logs to _testcode/debug/debug.log and terminal without throwing', () => {
    const testMsg = `Verification test log entry: ${Date.now()}`
    appendDebugLog(testMsg)
    logInfo('TestTag', 'Test Info Message')
    logError('TestTag', new Error('Simulated Database Error'))

    const logPath = path.resolve(process.cwd(), '_testcode/debug/debug.log')
    expect(fs.existsSync(logPath)).toBe(true)
    const logContent = fs.readFileSync(logPath, 'utf8')
    expect(logContent).toContain(testMsg)
    expect(logContent).toContain('Simulated Database Error')
  })
})
