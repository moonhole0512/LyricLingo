import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCircle2, Pencil, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react'
import type { VocabularyRecord, VocabularyStats } from '../../../../src/shared/types'

type Filter = 'all' | 'due' | 'new'

const emptyStats: VocabularyStats = { total: 0, due: 0, new: 0, learned: 0 }

export default function Dashboard() {
  const [vocabs, setVocabs] = useState<VocabularyRecord[]>([])
  const [stats, setStats] = useState<VocabularyStats>(emptyStats)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reviewMode, setReviewMode] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ reading: '', contextualMeaning: '', usageNote: '', userNote: '' })

  const fetchVocabulary = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [data, nextStats] = await Promise.all([
        window.api.getVocabulary({ filter, query }),
        window.api.getVocabularyStats()
      ])
      setVocabs(data || [])
      setStats(nextStats || emptyStats)
    } catch {
      setLoadError('단어장을 불러오지 못했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }, [filter, query])

  useEffect(() => { void fetchVocabulary() }, [fetchVocabulary])

  const startReview = (targetVocab?: VocabularyRecord) => {
    if (targetVocab) {
      setVocabs(prev => [targetVocab, ...prev.filter(item => item.id !== targetVocab.id)])
      setReviewMode(true)
      setRevealed(false)
      return
    }
    const nextFilter: Filter = stats.due > 0 ? 'due' : 'all'
    setFilter(nextFilter)
    setReviewMode(true)
    setRevealed(false)
  }

  const currentReview = reviewMode ? vocabs[0] : null

  const handleReview = async (score: number) => {
    if (!currentReview) return
    try {
      await window.api.reviewVocabulary(currentReview.id, score)
      setVocabs(prev => prev.filter(item => item.id !== currentReview.id))
      setRevealed(false)
      const nextStats = await window.api.getVocabularyStats()
      setStats(nextStats)
    } catch {
      setLoadError('복습 결과를 저장하지 못했습니다.')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 단어를 삭제할까요?')) return
    try {
      await window.api.deleteVocabularyItem(id)
      setVocabs(prev => prev.filter(item => item.id !== id))
      setStats(await window.api.getVocabularyStats())
    } catch {
      setLoadError('단어를 삭제하지 못했습니다.')
    }
  }

  const handleClearAll = async () => {
    if (!stats.total) return
    if (!confirm('단어장의 모든 데이터를 삭제할까요? 이 작업은 취소할 수 없습니다.')) return
    try {
      await window.api.clearVocabulary()
      setVocabs([])
      setStats(emptyStats)
    } catch {
      setLoadError('단어장을 비우지 못했습니다.')
    }
  }

  const startEdit = (vocab: VocabularyRecord) => {
    setEditingId(vocab.id)
    setEditForm({
      reading: vocab.reading || '',
      contextualMeaning: vocab.contextualMeaning || vocab.literalMeaning || '',
      usageNote: vocab.usageNote || '',
      userNote: vocab.userNote || ''
    })
  }

  const saveEdit = async (id: number) => {
    try {
      const updated = await window.api.updateVocabulary(id, editForm)
      setVocabs(prev => prev.map(item => item.id === id ? updated : item))
      setEditingId(null)
    } catch {
      setLoadError('수정 내용을 저장하지 못했습니다.')
    }
  }

  const reviewEmptyMessage = useMemo(() => {
    if (filter === 'due') return '오늘 복습할 단어가 없습니다.'
    if (filter === 'new') return '아직 새 단어가 없습니다.'
    return '저장된 단어가 없습니다.'
  }, [filter])

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto p-6 overflow-y-auto relative">
      <div className="flex flex-col gap-4 pb-5 mb-5 border-b border-gray-200/60 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">나만의 단어장</h2>
              <span className="bg-rose-100 text-rose-600 font-extrabold text-xs px-2.5 py-1 rounded-full border border-rose-200">{stats.total}개</span>
            </div>
            <p className="text-gray-500 text-sm mt-1 font-medium">가사에서 발견한 단어를 문맥과 사용 예로 복습하세요.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => startReview()} disabled={!stats.total} className="px-4 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">오늘 복습 {stats.due > 0 ? `· ${stats.due}` : (stats.total > 0 ? `· 전체 ${stats.total}` : '')}</button>
            <button onClick={() => void handleClearAll()} disabled={!stats.total} className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold disabled:opacity-40" title="단어장의 모든 단어 삭제"><Trash2 className="w-3.5 h-3.5" />전체 비우기</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 max-w-lg">
          <div className="rounded-xl bg-rose-50 p-3"><div className="text-xs text-rose-500 font-bold">오늘 복습</div><div className="text-xl font-black text-rose-700">{stats.due}</div></div>
          <div className="rounded-xl bg-indigo-50 p-3"><div className="text-xs text-indigo-500 font-bold">새 단어</div><div className="text-xl font-black text-indigo-700">{stats.new}</div></div>
          <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-500 font-bold">학습 완료</div><div className="text-xl font-black text-gray-700">{stats.learned}</div></div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="단어, 요미가나, 뜻, 곡명 검색" className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-rose-400" />
          </div>
          <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
            {([['all', '전체'], ['due', '오늘 복습'], ['new', '새 단어']] as const).map(([value, label]) => (
              <button key={value} onClick={() => { setFilter(value); setReviewMode(false) }} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === value && !reviewMode ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500'}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {loadError && <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">{loadError}</div>}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-400"><div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mb-3" /><p className="text-sm font-medium">단어장을 불러오는 중...</p></div>
      ) : reviewMode ? (
        <div className="max-w-xl w-full mx-auto flex-1 flex flex-col justify-center pb-12">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setReviewMode(false)}
              className="text-xs font-bold text-gray-500 hover:text-gray-900 bg-white/80 hover:bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm transition-colors cursor-pointer"
            >
              ← 단어 목록으로 돌아가기
            </button>
            <div className="text-xs font-bold text-rose-500">
              {vocabs.length}개 남음
            </div>
          </div>
          {!currentReview ? (
            <div className="text-center bg-green-50 border border-green-100 rounded-3xl p-10"><CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" /><h3 className="text-2xl font-black text-gray-800">오늘 복습 완료</h3><p className="text-sm text-gray-500 mt-2">새 단어를 추가하거나 내일 다시 만나보세요.</p><button onClick={() => setReviewMode(false)} className="mt-5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-50">전체 단어 보기</button></div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-8 text-center">
              <div className="text-xs font-bold text-rose-500 mb-5">{currentReview.title ? `🎵 ${currentReview.title}` : '단어 복습'} · 남은 단어: {vocabs.length}개</div>
              <div className="flashcard-word text-4xl font-black text-gray-900">{currentReview.word}</div>
              {currentReview.reading && <div className="text-lg text-rose-500 font-bold">{currentReview.reading}</div>}
              <p className="text-sm text-gray-500 mt-5 bg-gray-50 rounded-xl p-3">{currentReview.context}</p>
              {!revealed ? <button onClick={() => setRevealed(true)} className="mt-8 w-full py-3 bg-gray-900 text-white rounded-xl font-bold">뜻 보기</button> : (
                <div className="mt-6 text-left space-y-3">
                  <div><div className="text-xs font-bold text-gray-400">문맥상 의미</div><div className="text-xl font-black text-gray-800">{currentReview.contextualMeaning || currentReview.literalMeaning}</div></div>
                  <div className="ai-explanation bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-sm text-gray-700">{currentReview.usageNote}</div>
                  {currentReview.examples?.[0] && <div className="bg-gray-50 rounded-xl p-3 text-sm"><b>{currentReview.examples[0].original}</b><div className="text-gray-600 mt-1">{currentReview.examples[0].translation}</div></div>}
                  <div className="grid grid-cols-4 gap-2 pt-3"><button onClick={() => void handleReview(1)} className="py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold">다시</button><button onClick={() => void handleReview(2)} className="py-2 rounded-xl bg-orange-50 text-orange-600 text-xs font-bold">어려움</button><button onClick={() => void handleReview(4)} className="py-2 rounded-xl bg-green-50 text-green-600 text-xs font-bold">기억남</button><button onClick={() => void handleReview(5)} className="py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold">쉬움</button></div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : vocabs.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 px-4 text-center"><div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-5 border border-rose-100"><BookOpen className="w-10 h-10" /></div><h3 className="text-2xl font-bold text-gray-800 mb-2">{reviewEmptyMessage}</h3><p className="text-gray-500 max-w-md text-sm leading-relaxed">가사에서 궁금한 단어를 클릭하면 문맥에 맞는 뜻과 사용 예를 자동으로 저장할 수 있습니다.</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 pb-12">
          {vocabs.map(vocab => (
            <div key={vocab.id} className="bg-white p-5 border border-gray-200/80 rounded-2xl shadow-sm hover:shadow-md transition-all relative">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0"><h3 className="text-2xl font-black text-gray-900 tracking-tight">{vocab.word}</h3><p className="text-rose-500 font-bold text-sm mt-0.5">{vocab.reading || '요미가나 미등록'}</p>{(vocab.title || vocab.artist) && <p className="text-xs font-semibold text-gray-400 mt-1">🎵 {vocab.title} {vocab.artist ? `• ${vocab.artist}` : ''}</p>}</div>
                <div className="flex items-center gap-2"><span className="text-xs font-extrabold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100">{vocab.repetitions === 0 ? '새 단어' : `${vocab.repetitions}회 복습`}</span><button onClick={() => startEdit(vocab)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="단어 수정" aria-label="단어 수정"><Pencil className="w-4 h-4" /></button><button onClick={() => void handleDelete(vocab.id)} className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg" title="이 단어 삭제" aria-label="이 단어 삭제"><Trash2 className="w-4 h-4" /></button></div>
              </div>

              {editingId === vocab.id ? (
                <div className="mt-4 space-y-2"><input value={editForm.reading} onChange={e => setEditForm({ ...editForm, reading: e.target.value })} placeholder="요미가나" className="w-full border rounded-lg p-2 text-sm" /><textarea value={editForm.contextualMeaning} onChange={e => setEditForm({ ...editForm, contextualMeaning: e.target.value })} placeholder="문맥상 의미" className="w-full border rounded-lg p-2 text-sm" rows={2} /><textarea value={editForm.usageNote} onChange={e => setEditForm({ ...editForm, usageNote: e.target.value })} placeholder="사용법·기억 메모" className="w-full border rounded-lg p-2 text-sm" rows={3} /><textarea value={editForm.userNote} onChange={e => setEditForm({ ...editForm, userNote: e.target.value })} placeholder="나의 메모" className="w-full border rounded-lg p-2 text-sm" rows={2} /><div className="flex justify-end gap-2"><button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-lg text-xs font-bold text-gray-500">취소</button><button onClick={() => void saveEdit(vocab.id)} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold">저장</button></div></div>
              ) : (
                <>
                  <p className="text-lg font-bold text-gray-700 mt-4">{vocab.contextualMeaning || vocab.literalMeaning || '뜻 미등록'}</p>
                  {vocab.naturalTranslation && <p className="text-sm text-gray-500 mt-1">{vocab.naturalTranslation}</p>}
                  {vocab.context && <div className="bg-gray-50/80 p-3 rounded-xl text-sm text-gray-600 italic border-l-4 border-rose-400 mt-3">“{vocab.context}”</div>}
                  {vocab.usageNote && <div className="ai-explanation mt-3 text-sm text-gray-700 bg-indigo-50/40 p-3 rounded-xl border border-indigo-100/80"><div className="font-bold text-indigo-700 mb-1 flex items-center gap-1.5 text-xs"><Sparkles className="w-4 h-4 text-indigo-500" />사용법·기억 포인트</div>{vocab.usageNote}</div>}
                  {vocab.examples?.[0] && <div className="mt-3 bg-gray-50 rounded-xl p-3 text-sm"><div className="font-semibold text-gray-800">{vocab.examples[0].original}</div><div className="text-gray-600 mt-1">{vocab.examples[0].translation}</div></div>}
                </>
              )}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400"><span>다음 복습: {new Date(vocab.next_review_date).toLocaleDateString()}</span><button onClick={() => startReview(vocab)} className="text-rose-500 font-bold hover:text-rose-700 cursor-pointer"><RotateCcw className="inline w-3 h-3 mr-1" />이 단어 복습</button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
