export interface NormalizedMediaData {
  title: string
  artist: string
  album: string
  cover: string | null
  position: number
  duration: number
  state: string
  source: string
  isAppleMusic: boolean
}

export function shouldClearRejectedMedia(activeKey: string, rejectedEvents: number): boolean {
  return Boolean(activeKey) && rejectedEvents >= 2
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

export function isAppleMusicSource(source: unknown): boolean {
  const normalized = clean(source).toLocaleLowerCase().replace(/[\s_.-]/g, '')
  if (!normalized) return false
  if (normalized.includes('applemusic') || normalized.includes('appleincapplemusic') || normalized.includes('comapplemusic')) {
    return true
  }
  return new Set(['applemusic', 'applemusicwin', 'applemusicwin32', 'appleincapplemusic', 'itunes']).has(normalized)
}

export function normalizeMediaData(data: any): NormalizedMediaData {
  let title = clean(data?.title)
  let artist = clean(data?.artist)
  let album = clean(data?.album)

  // Split combined SMTC title when artist metadata is absent or combined
  if (!artist && title.includes(' — ')) {
    const parts = title.split(' — ')
    title = parts.shift()?.trim() || ''
    artist = parts.join(' — ').split(' - ')[0].trim()
  } else if (!artist && title.includes(' - ')) {
    const parts = title.split(' - ')
    if (parts.length === 2) {
      title = parts[0].trim()
      artist = parts[1].trim()
    }
  }

  // Handle cases where artist contains album: e.g. "Awesome City Club — Grower" or "요루시카 — Elma"
  if (artist && artist.includes(' — ')) {
    const parts = artist.split(' — ')
    artist = parts[0].trim()
    if (!album && parts[1]) album = parts[1].trim()
  }

  // If title contains " — AlbumName", strip the album from the title
  if (album && title.includes(' — ')) {
    const parts = title.split(' — ')
    if (parts[parts.length - 1].trim().toLowerCase() === album.toLowerCase()) {
      parts.pop()
      title = parts.join(' — ').trim()
    }
  }

  // If title ends with the artist name, e.g. "SongTitle ArtistName"
  if (artist && title.toLowerCase().endsWith(` ${artist.toLowerCase()}`)) {
    title = title.slice(0, -(artist.length + 1)).trim()
  }

  title = title.replace(/\s-\s(?:EP|Single)$/i, '').trim()
  return {
    title,
    artist,
    album,
    cover: data?.cover || null,
    position: Number(data?.position || 0),
    duration: Number(data?.duration || 0),
    state: clean(data?.playbackState || data?.playbackstate || 'Unknown').toLocaleLowerCase(),
    source: clean(data?.source),
    isAppleMusic: isAppleMusicSource(data?.source)
  }
}

export function mediaKey(media: Pick<NormalizedMediaData, 'title' | 'artist' | 'album'>): string {
  return [media.title, media.artist, media.album].map(value => value.trim().toLocaleLowerCase()).join('\u001f')
}
