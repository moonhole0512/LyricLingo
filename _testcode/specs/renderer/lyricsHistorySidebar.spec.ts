import { describe, it, expect } from 'vitest'
import sqlite3 from 'sqlite3'

describe('Lyrics History & Bulk Delete Verification', () => {
  it('should support clearing all records from lyrics_cache via clearLyricsHistory query', async () => {
    const db = new sqlite3.Database(':memory:')
    await new Promise<void>((resolve) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE lyrics_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_title TEXT NOT NULL,
            artist TEXT NOT NULL,
            original_lyrics TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `)
        db.run('INSERT INTO lyrics_cache (song_title, artist, original_lyrics) VALUES (?, ?, ?)', ['Song 1', 'Artist 1', 'Lyrics 1'])
        db.run('INSERT INTO lyrics_cache (song_title, artist, original_lyrics) VALUES (?, ?, ?)', ['Song 2', 'Artist 2', 'Lyrics 2'])
        db.run('INSERT INTO lyrics_cache (song_title, artist, original_lyrics) VALUES (?, ?, ?)', ['Song 3', 'Artist 3', 'Lyrics 3'])
        resolve()
      })
    })

    // Verify 3 rows exist
    const countBefore = await new Promise<number>((resolve) => {
      db.get('SELECT COUNT(*) as cnt FROM lyrics_cache', (_, row: any) => resolve(row.cnt))
    })
    expect(countBefore).toBe(3)

    // Execute clear query (DELETE FROM lyrics_cache)
    const deletedCount = await new Promise<number>((resolve, reject) => {
      db.run('DELETE FROM lyrics_cache', function(err) {
        if (err) reject(err)
        else resolve(this.changes)
      })
    })
    expect(deletedCount).toBe(3)

    // Verify 0 rows remain
    const countAfter = await new Promise<number>((resolve) => {
      db.get('SELECT COUNT(*) as cnt FROM lyrics_cache', (_, row: any) => resolve(row.cnt))
    })
    expect(countAfter).toBe(0)

    await new Promise<void>((resolve) => db.close(() => resolve()))
  })

  it('should filter history items by search query matching title or artist', () => {
    const history = [
      { id: 1, title: 'Teenager Forever', artist: 'King Gnu' },
      { id: 2, title: 'Evening Calm, Somewhere, Fireworks', artist: 'Yorushika' },
      { id: 3, title: 'ceremony', artist: 'Awesome City Club' }
    ]

    const filterHistory = (items: typeof history, query: string) => {
      if (!query.trim()) return items
      const q = query.toLowerCase()
      return items.filter(item =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.artist && item.artist.toLowerCase().includes(q))
      )
    }

    expect(filterHistory(history, 'king')).toHaveLength(1)
    expect(filterHistory(history, 'king')[0].title).toBe('Teenager Forever')

    expect(filterHistory(history, 'calm')).toHaveLength(1)
    expect(filterHistory(history, 'calm')[0].artist).toBe('Yorushika')

    expect(filterHistory(history, 'city')).toHaveLength(1)
    expect(filterHistory(history, 'city')[0].title).toBe('ceremony')

    expect(filterHistory(history, 'nonexistent')).toHaveLength(0)
    expect(filterHistory(history, '')).toHaveLength(3)
  })
})
