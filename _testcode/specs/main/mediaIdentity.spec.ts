import { describe, expect, it } from 'vitest'
import { isAppleMusicSource, mediaKey, normalizeMediaData, shouldClearRejectedMedia } from '../../../src/main/utils/mediaIdentity'
import { mediaActionCode, mediaWorkerResult } from '../../../src/main/utils/mediaControl'

describe('media identity', () => {
  it('accepts Apple Music source variants but rejects browser media', () => {
    expect(isAppleMusicSource('Apple Music')).toBe(true)
    expect(isAppleMusicSource('AppleMusicWin')).toBe(true)
    expect(isAppleMusicSource('AppleInc.AppleMusicWin_nzyj5cx40ttqa!App')).toBe(true)
    expect(isAppleMusicSource('iTunes')).toBe(true)
    expect(isAppleMusicSource('YouTube')).toBe(false)
    expect(isAppleMusicSource('Google Chrome')).toBe(false)
    expect(isAppleMusicSource('')).toBe(false)
  })

  it('normalizes combined metadata without rewriting a supplied artist', () => {
    const combined = normalizeMediaData({ title: 'Song - Artist', source: 'Apple Music', playbackState: 'Playing' })
    expect(combined.title).toBe('Song')
    expect(combined.artist).toBe('Artist')
    expect(combined.state).toBe('playing')
    expect(combined.isAppleMusic).toBe(true)

    const explicitArtist = normalizeMediaData({ title: 'A - B', artist: 'Singer - Album', source: 'Apple Music' })
    expect(explicitArtist.title).toBe('A - B')
    expect(explicitArtist.artist).toBe('Singer - Album')
  })

  it('uses album as part of the stable track key', () => {
    expect(mediaKey({ title: 'Song', artist: 'Artist', album: 'A' })).not.toBe(mediaKey({ title: 'Song', artist: 'Artist', album: 'B' }))
  })

  it('clears an active song only after two consecutive rejected events', () => {
    expect(shouldClearRejectedMedia('song-key', 1)).toBe(false)
    expect(shouldClearRejectedMedia('song-key', 2)).toBe(true)
    expect(shouldClearRejectedMedia('', 3)).toBe(false)
  })

  it('maps controls and worker acknowledgements explicitly', () => {
    expect(mediaActionCode('playpause')).toBe(14)
    expect(mediaActionCode('next')).toBe(11)
    expect(mediaActionCode('prev')).toBe(12)
    expect(mediaWorkerResult('OK')).toEqual({ ok: true, reason: 'sent' })
    expect(mediaWorkerResult('NO_TARGET')).toEqual({ ok: false, reason: 'no-target' })
  })
})
