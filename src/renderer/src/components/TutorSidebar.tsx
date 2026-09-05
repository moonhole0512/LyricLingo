import { useEffect, useRef, useState } from 'react'
import type { VocabularyRecord } from '../../../../src/shared/types'

export default function TutorSidebar({
  selectedLyric,
  songInfo,
  selectedModel,
  onClose
}: {
  selectedLyric: { text: string, timeMs: number, clickedWord?: string } | null
  songInfo: any
  selectedModel: string
  onClose: () => void
}) {
  const [word, setWord] = useState('')
  const [analysis, setAnalysis] = useState<VocabularyRecord | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [editReading, setEditReading] = useState('')
  const [editMeaning, setEditMeaning] = useState('')
  const [editUsage, setEditUsage] = useState('')
  
  const [autoSave, setAutoSave] = useState<boolean>(() => {
    const saved = localStorage.getItem('lyriclingo-auto-save-vocab')
    return saved !== null ? saved === 'true' : true
  })

  const toggleAutoSave = () => {
    const next = !autoSave
    setAutoSave(next)
    localStorage.setItem('lyriclingo-auto-save-vocab', String(next))
  }

  const analysisRequestId = useRef(0)
  const analysisSongKey = useRef('')

  const songKey = [songInfo?.title, songInfo?.artist, songInfo?.album].map(value => String(value || '')).join('|')

  const handleAnalyze = async (requestedWord = word) => {
    const target = requestedWord.trim()
    if (!target || !selectedLyric) return
    const requestId = ++analysisRequestId.current
    const requestSongKey = songKey
    setWord(target)
    setIsAnalyzing(true)
    setError('')
    try {
      // Check existing vocabulary first
      try {
        const existingList = await window.api.getVocabulary({ query: target })
        const found = existingList.find((v: any) => v.word_or_sentence === target || v.normalized_word === target)
        if (found && (requestId === analysisRequestId.current && requestSongKey === analysisSongKey.current)) {
          setAnalysis(found)
          setIsSaved(true)
          setEditReading(found.reading || '')
          setEditMeaning(found.contextualMeaning || found.literalMeaning || '')
          setEditUsage(found.usageNote || '')
          setIsAnalyzing(false)
          return
        }
      } catch {}

      const result = await window.api.analyzeVocabulary({
        word: target,
        context: selectedLyric.text,
        surroundingContext: selectedLyric.text,
        title: songInfo?.title,
        artist: songInfo?.artist,
        lyricsTimeMs: selectedLyric.timeMs,
        model: selectedModel
      })
      if (requestId !== analysisRequestId.current || requestSongKey !== analysisSongKey.current) return

      if (autoSave) {
        const saved = await window.api.addVocabulary({
          ...result,
          context: selectedLyric.text,
          title: songInfo?.title,
          artist: songInfo?.artist,
          lyricsTimeMs: selectedLyric.timeMs
        })
        if (requestId !== analysisRequestId.current || requestSongKey !== analysisSongKey.current) return
        const savedRecord = saved as VocabularyRecord
        setAnalysis(savedRecord)
        setIsSaved(true)
        setEditReading(savedRecord.reading || '')
        setEditMeaning(savedRecord.contextualMeaning || savedRecord.literalMeaning || '')
        setEditUsage(savedRecord.usageNote || '')
      } else {
        const tempRecord: any = {
          ...result,
          contextSentence: selectedLyric.text,
          title: songInfo?.title,
          artist: songInfo?.artist,
          lyricsTimeMs: selectedLyric.timeMs,
          status: 'learning'
        }
        setAnalysis(tempRecord)
        setIsSaved(false)
        setEditReading(tempRecord.reading || '')
        setEditMeaning(tempRecord.contextualMeaning || tempRecord.literalMeaning || '')
        setEditUsage(tempRecord.usageNote || '')
      }
    } catch (e) {
      if (requestId !== analysisRequestId.current) return
      setError(String(e).includes('LM Studio') || String(e).includes('FreeToken') || String(e).includes('연결') ? 'FreeToken 또는 LM Studio를 연결하면 자동 분석할 수 있습니다.' : '단어 분석에 실패했습니다. 다시 시도해주세요.')
    } finally {
      if (requestId === analysisRequestId.current) setIsAnalyzing(false)
    }
  }

  useEffect(() => {
    analysisRequestId.current += 1
    analysisSongKey.current = songKey
    setAnalysis(null)
    setIsSaved(false)
    setIsEditing(false)
    setError('')
    const selectedWord = selectedLyric?.clickedWord?.trim() || selectedLyric?.text?.trim() || ''
    setWord(selectedWord)
    if (selectedWord) void handleAnalyze(selectedWord)
    // The selected lyric is the intentional trigger for a new analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLyric, songKey])

  const handleSave = async () => {
    if (isSaved || !analysis || isActionLoading) return
    setIsActionLoading(true)
    setError('')
    try {
      const saved = await window.api.addVocabulary({
        ...analysis,
        context: selectedLyric?.text || '',
        title: songInfo?.title,
        artist: songInfo?.artist,
        lyricsTimeMs: selectedLyric?.timeMs
      })
      setAnalysis(saved as VocabularyRecord)
      setIsSaved(true)
    } catch {
      setError('단어장 저장에 실패했습니다.')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!analysis?.id || isActionLoading) return
    setIsActionLoading(true)
    setError('')
    try {
      // @ts-ignore
      if (window.api.deleteVocabulary) {
        // @ts-ignore
        await window.api.deleteVocabulary(analysis.id)
      } else {
        await window.api.deleteVocabularyItem(analysis.id)
      }
      setIsSaved(false)
    } catch {
      setError('단어장에서 삭제하지 못했습니다.')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleEditSave = async () => {
    if (!analysis) return
    try {
      if (analysis.id) {
        const updated = await window.api.updateVocabulary(analysis.id, {
          reading: editReading,
          contextualMeaning: editMeaning,
          usageNote: editUsage
        })
        setAnalysis(updated)
      } else {
        setAnalysis((prev: any) => ({
          ...prev,
          reading: editReading,
          contextualMeaning: editMeaning,
          usageNote: editUsage
        }))
      }
      setIsEditing(false)
    } catch {
      setError('수정 내용을 저장하지 못했습니다.')
    }
  }

  return (
    <div className="w-96 max-w-[calc(100vw-1rem)] bg-white border-l border-gray-200 shadow-2xl flex flex-col h-full animate-slide-in-right z-20">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/90">
        <div>
          <h3 className="font-bold text-gray-800">단어 학습 카드</h3>
          <p className="text-xs text-gray-500 mt-0.5">문맥에 맞춰 실시간으로 단어와 표현을 학습합니다.</p>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-gray-600 font-bold p-1 rounded-lg hover:bg-gray-100 transition-colors" 
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* Auto-save Option Switch */}
      <div className="px-4 py-2 bg-rose-50/40 border-b border-rose-100/60 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5">
          <span className="font-semibold text-gray-700">선택 시 바로 저장</span>
          <span className="text-[11px] text-gray-400 font-normal">
            {autoSave ? '(드래그 시 즉시 등록)' : '(버튼 클릭 시 등록)'}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleAutoSave}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            autoSave ? 'bg-rose-500' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={autoSave}
          title="가사 드래그/클릭 시 단어장에 바로 자동 등록할지 여부를 설정합니다."
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              autoSave ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3 text-sm text-gray-700 leading-relaxed">
          <div className="text-[11px] font-bold text-rose-500 mb-1">가사 문맥</div>
          {selectedLyric?.text || '가사에서 단어나 문장을 선택해주세요.'}
        </div>

        {!analysis && !isAnalyzing && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500">분석할 단어 또는 표현</label>
            <div className="flex gap-2">
              <input
                value={word}
                onChange={e => setWord(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleAnalyze()}
                placeholder="단어 입력"
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-500"
              />
              <button 
                onClick={() => void handleAnalyze()} 
                disabled={!word.trim() || isAnalyzing} 
                className="px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold disabled:opacity-40 transition-colors"
              >
                분석
              </button>
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500 space-y-2">
            <div className="w-6 h-6 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin mx-auto"></div>
            <p>문맥·요미가나·사용 예를 분석하는 중입니다…</p>
          </div>
        )}

        {error && <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">{error}</div>}

        {analysis && !isAnalyzing && (
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-2xl p-4 shadow-sm bg-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-2xl font-black text-gray-900">{analysis.word}</h4>
                  {isEditing ? (
                    <input 
                      value={editReading} 
                      onChange={e => setEditReading(e.target.value)} 
                      placeholder="요미가나" 
                      className="mt-1 border-b border-rose-300 text-rose-500 font-bold outline-none" 
                    />
                  ) : (
                    <p className="text-rose-500 font-bold mt-1">{analysis.reading || '요미가나 없음'}</p>
                  )}
                </div>
                {isSaved ? (
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full whitespace-nowrap animate-in fade-in zoom-in duration-200">
                    ✓ 저장됨
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200/60 px-2.5 py-1 rounded-full whitespace-nowrap animate-in fade-in zoom-in duration-200">
                    미저장
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">{analysis.partOfSpeech || '표현'} · {analysis.difficulty !== 'unknown' ? analysis.difficulty : '난이도 미정'}</p>

              <div className="mt-4">
                <div className="text-[11px] font-bold text-gray-400 mb-1">문맥상 의미</div>
                {isEditing ? (
                  <textarea 
                    value={editMeaning} 
                    onChange={e => setEditMeaning(e.target.value)} 
                    className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-rose-400" 
                    rows={2} 
                  />
                ) : (
                  <p className="text-lg font-bold text-gray-800">{analysis.contextualMeaning || analysis.literalMeaning}</p>
                )}
              </div>

              {analysis.naturalTranslation && (
                <div className="mt-3 bg-gray-50 rounded-xl p-3 text-sm text-gray-700">
                  <span className="font-bold text-gray-500">자연스러운 해석 · </span>{analysis.naturalTranslation}
                </div>
              )}

              <div className="tutor-response mt-4 bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-sm text-gray-700 leading-relaxed">
                <div className="text-xs font-bold text-indigo-600 mb-1">기억에 도움이 되는 사용법</div>
                {isEditing ? (
                  <textarea 
                    value={editUsage} 
                    onChange={e => setEditUsage(e.target.value)} 
                    className="w-full border border-indigo-200 rounded-lg p-2 text-sm bg-white focus:outline-none focus:border-indigo-400" 
                    rows={4} 
                  />
                ) : (
                  analysis.usageNote
                )}
              </div>
            </div>

            {analysis.examples?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-gray-500 mb-2">사용 예</h4>
                <div className="space-y-2">
                  {analysis.examples.map((example, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <p className="font-semibold text-gray-800">{example.original}</p>
                      {example.reading && <p className="text-xs text-rose-500 mt-0.5">{example.reading}</p>}
                      <p className="text-sm text-gray-600 mt-1">{example.translation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Action Buttons with Smooth Animation */}
            <div className="flex gap-2 pt-1">
              {isSaved ? (
                <button 
                  onClick={() => void handleDelete()} 
                  disabled={isActionLoading}
                  className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100/80 text-rose-600 border border-rose-200 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
                  title="단어장에서 이 항목을 삭제합니다."
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>단어장에서 삭제</span>
                </button>
              ) : (
                <button 
                  onClick={() => void handleSave()} 
                  disabled={isActionLoading}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center space-x-1.5 shadow-sm shadow-emerald-200 active:scale-95 disabled:opacity-50"
                  title="단어장에 이 단어를 저장합니다."
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>단어장에 추가</span>
                </button>
              )}
              <button 
                onClick={isEditing ? () => void handleEditSave() : () => setIsEditing(true)} 
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
              >
                {isEditing ? '수정 저장' : '수정'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
