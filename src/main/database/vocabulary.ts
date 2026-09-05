import { getDb } from './db'
import { calculateNextReview } from '../utils/sm2Algorithm'
import type { VocabularyInput, VocabularyRecord, VocabularyStats } from '../../shared/types'

function run(sql: string, params: unknown[] = []): Promise<{ changes: number, lastID?: number }> {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (this: { changes: number, lastID: number }, err: Error | null) {
      if (err) reject(err)
      else resolve({ changes: this.changes, lastID: this.lastID })
    })
  })
}

function get<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err: Error | null, row: T) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}

function normalizeWord(word: string): string {
  return word.normalize('NFKC').trim().toLocaleLowerCase()
}

function hydrate(row: any): VocabularyRecord {
  let examples = []
  try {
    examples = row.examples_json ? JSON.parse(row.examples_json) : []
  } catch {
    examples = []
  }

  return {
    ...row,
    word: row.word_or_sentence,
    context: row.context_sentence || '',
    title: row.song_title || '',
    artist: row.artist || '',
    reading: row.reading || '',
    lemma: row.lemma || row.word_or_sentence,
    partOfSpeech: row.part_of_speech || '',
    literalMeaning: row.literal_meaning || row.meaning || '',
    contextualMeaning: row.contextual_meaning || row.meaning || '',
    naturalTranslation: row.natural_translation || '',
    usageNote: row.usage_note || row.ai_explanation || '',
    examples,
    difficulty: row.difficulty || 'unknown',
    lyricsTimeMs: row.lyrics_time_ms ?? undefined,
    userNote: row.user_note || ''
  }
}

export async function addVocabulary(input: VocabularyInput): Promise<VocabularyRecord> {
  const word = input.word.trim()
  const title = input.title || ''
  const artist = input.artist || ''
  const context = input.context || ''
  const normalized = normalizeWord(word)

  const existingRows = await all<any>(
    `SELECT * FROM vocabulary
       WHERE normalized_word = ? COLLATE NOCASE
         AND COALESCE(song_title, '') = ? COLLATE NOCASE
         AND COALESCE(artist, '') = ? COLLATE NOCASE`,
    [normalized, title, artist]
  )
  const existing = existingRows.find(row => (row.context_sentence || '').trim() === context.trim())
  if (existing) return hydrate(existing)

  const result = await run(`
    INSERT INTO vocabulary (
      word_or_sentence, normalized_word, reading, lemma, part_of_speech,
      meaning, literal_meaning, contextual_meaning, natural_translation,
      usage_note, examples_json, context_sentence, lyrics_time_ms,
      ai_explanation, song_title, artist, user_note, difficulty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    word,
    normalized,
    input.reading || '',
    input.lemma || word,
    input.partOfSpeech || '',
    input.contextualMeaning || input.literalMeaning || '',
    input.literalMeaning || '',
    input.contextualMeaning || '',
    input.naturalTranslation || '',
    input.usageNote || '',
    JSON.stringify(input.examples || []),
    context,
    input.lyricsTimeMs ?? null,
    input.usageNote || '',
    title,
    artist,
    input.userNote || '',
    input.difficulty || 'unknown'
  ])

  const created = await get<any>('SELECT * FROM vocabulary WHERE id = ?', [result.lastID])
  if (!created) throw new Error('Vocabulary record was not created')
  return hydrate(created)
}

export async function getVocabulary(options: { filter?: 'all' | 'due' | 'new', query?: string } = {}): Promise<VocabularyRecord[]> {
  const where: string[] = ['1 = 1']
  const params: unknown[] = []
  const filter = options.filter || 'all'

  if (filter === 'due') where.push("datetime(next_review_date) <= datetime('now')")
  if (filter === 'new') where.push('repetitions = 0')

  if (options.query?.trim()) {
    const query = `%${options.query.trim()}%`
    where.push(`(
      word_or_sentence LIKE ? COLLATE NOCASE OR reading LIKE ? COLLATE NOCASE OR
      contextual_meaning LIKE ? COLLATE NOCASE OR song_title LIKE ? COLLATE NOCASE
    )`)
    params.push(query, query, query, query)
  }

  const order = filter === 'due'
    ? 'ORDER BY datetime(next_review_date) ASC, created_at ASC'
    : 'ORDER BY datetime(created_at) DESC'
  const rows = await all<any>(`SELECT * FROM vocabulary WHERE ${where.join(' AND ')} ${order}`, params)
  return rows.map(hydrate)
}

export async function getVocabularyStats(): Promise<VocabularyStats> {
  const row = await get<any>(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN datetime(next_review_date) <= datetime('now') THEN 1 ELSE 0 END) AS due,
      SUM(CASE WHEN repetitions = 0 THEN 1 ELSE 0 END) AS new,
      SUM(CASE WHEN repetitions > 0 THEN 1 ELSE 0 END) AS learned
    FROM vocabulary
  `)
  return {
    total: Number(row?.total || 0),
    due: Number(row?.due || 0),
    new: Number(row?.new || 0),
    learned: Number(row?.learned || 0)
  }
}

export async function reviewVocabulary(id: number, score: number): Promise<VocabularyRecord> {
  const current = await get<any>('SELECT * FROM vocabulary WHERE id = ?', [id])
  if (!current) throw new Error('Vocabulary record not found')

  const result = calculateNextReview(
    Number(current.interval_days || 1),
    Number(current.repetitions || 0),
    Number(current.ease_factor || 2.5),
    Math.max(0, Math.min(5, Number(score)))
  )
  const reviewedAt = new Date().toISOString()
  await run(`
    UPDATE vocabulary
    SET interval_days = ?, repetitions = ?, ease_factor = ?,
        next_review_date = ?, last_reviewed_at = ?,
        status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    result.intervalDays,
    result.repetitions,
    result.easeFactor,
    result.nextReviewDate.toISOString(),
    reviewedAt,
    result.repetitions === 0 ? 'learning' : 'reviewing',
    id
  ])

  await run(`
    INSERT INTO learning_stats (study_date, words_reviewed_count, correct_answers_count)
    VALUES (date('now'), 1, ?)
    ON CONFLICT(study_date) DO UPDATE SET
      words_reviewed_count = words_reviewed_count + 1,
      correct_answers_count = correct_answers_count + excluded.correct_answers_count
  `, [Number(score) >= 3 ? 1 : 0])

  const updated = await get<any>('SELECT * FROM vocabulary WHERE id = ?', [id])
  if (!updated) throw new Error('Vocabulary record was not updated')
  return hydrate(updated)
}

export async function updateVocabulary(id: number, input: Partial<VocabularyInput>): Promise<VocabularyRecord> {
  const current = await get<any>('SELECT * FROM vocabulary WHERE id = ?', [id])
  if (!current) throw new Error('Vocabulary record not found')

  const word = input.word?.trim() || current.word_or_sentence
  const values = {
    word,
    normalized: normalizeWord(word),
    reading: input.reading ?? current.reading ?? '',
    lemma: input.lemma ?? current.lemma ?? word,
    partOfSpeech: input.partOfSpeech ?? current.part_of_speech ?? '',
    literalMeaning: input.literalMeaning ?? current.literal_meaning ?? '',
    contextualMeaning: input.contextualMeaning ?? current.contextual_meaning ?? current.meaning ?? '',
    naturalTranslation: input.naturalTranslation ?? current.natural_translation ?? '',
    usageNote: input.usageNote ?? current.usage_note ?? current.ai_explanation ?? '',
    examples: input.examples ?? (current.examples_json ? JSON.parse(current.examples_json) : []),
    context: input.context ?? current.context_sentence ?? '',
    userNote: input.userNote ?? current.user_note ?? '',
    difficulty: input.difficulty ?? current.difficulty ?? 'unknown'
  }

  await run(`
    UPDATE vocabulary SET
      word_or_sentence = ?, normalized_word = ?, reading = ?, lemma = ?, part_of_speech = ?,
      meaning = ?, literal_meaning = ?, contextual_meaning = ?, natural_translation = ?,
      usage_note = ?, ai_explanation = ?, examples_json = ?, context_sentence = ?,
      user_note = ?, difficulty = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    values.word, values.normalized, values.reading, values.lemma, values.partOfSpeech,
    values.contextualMeaning, values.literalMeaning, values.contextualMeaning,
    values.naturalTranslation, values.usageNote, values.usageNote,
    JSON.stringify(values.examples), values.context, values.userNote, values.difficulty, id
  ])

  const updated = await get<any>('SELECT * FROM vocabulary WHERE id = ?', [id])
  if (!updated) throw new Error('Vocabulary record was not updated')
  return hydrate(updated)
}

export async function deleteVocabulary(id: number): Promise<number> {
  const result = await run('DELETE FROM vocabulary WHERE id = ?', [id])
  return result.changes
}

export async function clearVocabulary(): Promise<number> {
  const result = await run('DELETE FROM vocabulary')
  return result.changes
}
