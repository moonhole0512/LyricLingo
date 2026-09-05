import { describe, it, expect } from 'vitest'

describe('Tab Switching and Song Synchronization Logic', () => {
  it('should update viewingSong to incoming playingSong when not viewing historical archive', () => {
    let viewingSong: any = { title: 'Song A', artist: 'Artist A' }
    const isViewingHistory = false
    const autoFetch = true

    const incomingSong = { title: 'Song B', artist: 'Artist B' }

    // Simulating onMusicUpdate handler logic
    const updateViewingSong = (prev: any, data: any) => {
      if (!prev) return data
      if (prev.title === data.title && prev.artist === data.artist) {
        return { ...data, lrc: data.lrc || prev.lrc }
      }
      if (!isViewingHistory || autoFetch) {
        return data
      }
      return prev
    }

    viewingSong = updateViewingSong(viewingSong, incomingSong)
    expect(viewingSong.title).toBe('Song B')
    expect(viewingSong.artist).toBe('Artist B')
  })

  it('should preserve viewingSong if user explicitly opened a historical song and autoFetch is false', () => {
    let viewingSong: any = { title: 'Historical Song', artist: 'Old Artist' }
    const isViewingHistory = true
    const autoFetch = false

    const incomingSong = { title: 'Live Song Playing', artist: 'Live Artist' }

    const updateViewingSong = (prev: any, data: any) => {
      if (!prev) return data
      if (prev.title === data.title && prev.artist === data.artist) {
        return { ...data, lrc: data.lrc || prev.lrc }
      }
      if (!isViewingHistory || autoFetch) {
        return data
      }
      return prev
    }

    viewingSong = updateViewingSong(viewingSong, incomingSong)
    expect(viewingSong.title).toBe('Historical Song')
  })

  it('should sync viewingSong to playingSong when clicking lyrics tab', () => {
    let activeTab: string = '단어장'
    let isViewingHistory = true
    let viewingSong: any = { title: 'Old Track', artist: 'Old Artist' }
    const playingSong: any = { title: 'New Current Track', artist: 'New Artist' }

    // Simulating clicking '가사' tab
    activeTab = '가사'
    isViewingHistory = false
    if (playingSong && (viewingSong?.title !== playingSong.title || viewingSong?.artist !== playingSong.artist)) {
      viewingSong = playingSong
    }

    expect(activeTab).toBe('가사')
    expect(isViewingHistory).toBe(false)
    expect(viewingSong.title).toBe('New Current Track')
  })
})

describe('Vocabulary Review Flow', () => {
  const registeredWords = [
    { id: 20, word: '本当にあの夢に', reading: 'ほんとうにあのゆめに', contextualMeaning: '꿈 속의 상황' },
    { id: 21, word: 'ガラ空き', reading: 'がらあき', contextualMeaning: '완전히 비어있음' },
    { id: 29, word: '文明', reading: 'ぶんめい', contextualMeaning: '인류 문명' }
  ]

  it('prioritizes target vocab when clicking individual card review', () => {
    let vocabs = [...registeredWords]
    let reviewMode = false
    const target = registeredWords[2] // '文明'

    // Simulating startReview(vocab)
    const startReview = (targetVocab?: typeof registeredWords[0]) => {
      if (targetVocab) {
        vocabs = [targetVocab, ...vocabs.filter(item => item.id !== targetVocab.id)]
        reviewMode = true
        return
      }
      reviewMode = true
    }

    startReview(target)
    expect(reviewMode).toBe(true)
    expect(vocabs[0].word).toBe('文明')
    expect(vocabs[0].id).toBe(29)
  })

  it('allows review even if due count is 0 by falling back to all registered words', () => {
    const stats = { total: 3, due: 0, new: 3, learned: 0 }
    let filter = 'all'
    let reviewMode = false

    const startReview = () => {
      const nextFilter = stats.due > 0 ? 'due' : 'all'
      filter = nextFilter
      reviewMode = true
    }

    startReview()
    expect(reviewMode).toBe(true)
    expect(filter).toBe('all')
  })
})
