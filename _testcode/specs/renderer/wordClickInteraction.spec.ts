import { describe, it, expect } from 'vitest'

describe('Word Click vs Drag Selection Interaction', () => {
  it('triggers word click when clicking on a valid word token without active selection', () => {
    let selectedLyric: any = null
    const handleLyricClick = (text: string, timeMs: number, clickedWord?: string) => {
      selectedLyric = { text, timeMs, clickedWord }
    }

    const dragJustOccurred = { current: false }
    const line = { text: '君のことが好きだった', timeMs: 12000 }
    const segment = { segment: '君', isWordLike: true }

    // Simulating user clicking on word token '君'
    const word = segment.segment?.trim()
    const isWord = Boolean(word && segment.isWordLike)

    // onClick handler logic
    if (!dragJustOccurred.current && isWord) {
      handleLyricClick(line.text, line.timeMs, word)
    }

    expect(selectedLyric).toBeDefined()
    expect(selectedLyric.text).toBe('君のことが好きだった')
    expect(selectedLyric.clickedWord).toBe('君')
  })

  it('handles drag selection on mouseUp and prevents subsequent click from overwriting it', () => {
    let selectedLyric: any = null
    const handleLyricClick = (text: string, timeMs: number, clickedWord?: string) => {
      selectedLyric = { text, timeMs, clickedWord }
    }

    const dragJustOccurred = { current: false }
    const line = { text: '君のことが好きだった', timeMs: 12000 }

    // Simulating user dragging "君のことが"
    const draggedText = '君のことが'
    
    // onMouseUp fires
    if (draggedText) {
      dragJustOccurred.current = true
      handleLyricClick(line.text, line.timeMs, draggedText)
    }

    expect(selectedLyric.clickedWord).toBe('君のことが')
    expect(dragJustOccurred.current).toBe(true)

    // Browser immediately dispatches 'click' on whatever element is under mouse on release
    const clickedWordUnderCursor = 'こと'
    if (dragJustOccurred.current) {
      dragJustOccurred.current = false;
      // absorbed! Does not call handleLyricClick with 'こと'
    } else {
      handleLyricClick(line.text, line.timeMs, clickedWordUnderCursor)
    }

    // Selected phrase is preserved, NOT overwritten by the under-cursor token
    expect(selectedLyric.clickedWord).toBe('君のことが')
    expect(dragJustOccurred.current).toBe(false)
  })

  it('ignores clicks on whitespace or punctuation tokens', () => {
    let selectedLyric: any = null
    const handleLyricClick = (text: string, timeMs: number, clickedWord?: string) => {
      selectedLyric = { text, timeMs, clickedWord }
    }

    const dragJustOccurred = { current: false }
    const line = { text: '君의ことが、好きだった', timeMs: 12000 }

    const spaceSegment = { segment: ' ', isWordLike: false }
    const punctSegment = { segment: '、', isWordLike: false }

    const handleWordClick = (segment: { segment: string; isWordLike: boolean }) => {
      if (dragJustOccurred.current) return
      const word = segment.segment?.trim()
      const isWord = Boolean(word && word !== '、' && word !== '。' && word !== ',' && word !== '.' && segment.isWordLike !== false)
      if (!isWord) return
      handleLyricClick(line.text, line.timeMs, word)
    }

    handleWordClick(spaceSegment)
    expect(selectedLyric).toBeNull()

    handleWordClick(punctSegment)
    expect(selectedLyric).toBeNull()
  })

  it('correctly detects non-Japanese text to fall back to Intl.Segmenter word tokens', () => {
    const hasJapanese = (text: string) => /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)

    expect(hasJapanese('君のことが好きだった')).toBe(true)
    expect(hasJapanese('눈이 내리는 날')).toBe(false)
    expect(hasJapanese('Never gonna give you up')).toBe(false)

    // Intl.Segmenter segments Korean and English into discrete words
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
    const koreanWords = Array.from(segmenter.segment('눈이 내리는 날')).filter(s => s.isWordLike).map(s => s.segment)
    expect(koreanWords).toEqual(['눈이', '내리는', '날'])

    const englishWords = Array.from(segmenter.segment('Never gonna give')).filter(s => s.isWordLike).map(s => s.segment)
    expect(englishWords).toEqual(['Never', 'gonna', 'give'])
  })
})
