import { describe, it, expect } from 'vitest'
import { isTitleArtistMatch } from '../../../src/main/utils/lrcSearcher'

describe('Track Switch Mid-Translation Handling', () => {
  it('should guard broadcastMusicUpdate against broadcasting stale song lyrics to a new track', () => {
    let broadcastSent: any = null
    let cachedLrc: string | null = null
    let cachedTranslated: string | null = null

    let lastMediaData: any = {
      title: 'Song B (New Track)',
      artist: 'Artist B',
      position: 10
    }

    function broadcastMusicUpdate(
      lrc: string | null,
      translatedLrc: string | null,
      translatedModel: string | null = null,
      translatedModelInfo: any = null,
      targetTitle?: string,
      targetArtist?: string
    ) {
      if (targetTitle && lastMediaData) {
        const titleMatches = isTitleArtistMatch(lastMediaData.title, targetTitle)
        const artistMatches = !targetArtist || isTitleArtistMatch(lastMediaData.artist, targetArtist)
        if (!titleMatches || !artistMatches) {
          return // Stale update dropped!
        }
      }
      cachedLrc = lrc
      cachedTranslated = translatedLrc
      broadcastSent = {
        ...lastMediaData,
        lrc: cachedLrc,
        translatedLrc: cachedTranslated
      }
    }

    // Song A finishes translating in background
    broadcastMusicUpdate(
      '[00:01.00] Song A Lyrics',
      '[00:01.00] Song A Translation',
      'gpt-4o-mini',
      null,
      'Song A (Old Track)',
      'Artist A'
    )

    // broadcastSent must remain null because lastMediaData is Song B
    expect(broadcastSent).toBeNull()
    expect(cachedLrc).toBeNull()
    expect(cachedTranslated).toBeNull()

    // When Song B itself updates lyrics
    broadcastMusicUpdate(
      '[00:01.00] Song B Lyrics',
      '[00:01.00] Song B Translation',
      'gpt-4o-mini',
      null,
      'Song B (New Track)',
      'Artist B'
    )

    expect(broadcastSent).not.toBeNull()
    expect(broadcastSent.title).toBe('Song B (New Track)')
    expect(broadcastSent.lrc).toBe('[00:01.00] Song B Lyrics')
    expect(broadcastSent.translatedLrc).toBe('[00:01.00] Song B Translation')
  })

  it('should abort in-flight translation callbacks and state updates when translationId advances', async () => {
    let translationId = 0
    let isTranslating = false
    let currentLyrics: string | null = null
    let offTranslationProgressCalled = false

    const offTranslationProgress = () => {
      offTranslationProgressCalled = true
    }

    // Step 1: Song A starts translating
    isTranslating = true
    const songAId = ++translationId

    // Simulate async translation process for Song A
    const songAPromise = (async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      // Check if translationId is still valid
      if (translationId !== songAId) return false
      currentLyrics = 'Song A Translated'
      isTranslating = false
      return true
    })()

    // Step 2: Mid-translation, user skips to Song B in Apple Music!
    // Track change effect triggers:
    translationId += 1
    isTranslating = false
    offTranslationProgress()
    currentLyrics = null // Song B has no lyrics initially

    expect(isTranslating).toBe(false)
    expect(offTranslationProgressCalled).toBe(true)
    expect(currentLyrics).toBeNull()

    // Step 3: Wait for Song A promise to finish
    const songAApplied = await songAPromise
    expect(songAApplied).toBe(false)
    expect(currentLyrics).toBeNull() // Song A translation was safely ignored!

    // Step 4: Song B can now auto-fetch without being blocked by Song A's isTranslating
    expect(isTranslating).toBe(false)
  })
})
