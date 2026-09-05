import { useState, useEffect, useRef } from 'react'
import { parseLyrics, ParsedLyric, extractLrcDurationMs, calculateSmartSyncOffset, areLyricsEquivalent } from '../../../../src/main/utils/lyricsParser'
import TutorSidebar from './TutorSidebar'
import type { DisplaySettings } from '../../../shared/types'
import { SkipBack, Play, Pause, SkipForward, ExternalLink, AlertTriangle, FileQuestion, Search } from 'lucide-react'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

export default function LyricsPlayer({
  songInfo,
  playingSong,
  selectedModel,
  setSongInfo,
  autoFetch = true,
  displaySettings
}: {
  songInfo: any
  playingSong?: any
  selectedModel: string
  setSongInfo: any
  autoFetch?: boolean
  displaySettings?: DisplaySettings
}) {
  const [lyrics, setLyrics] = useState<ParsedLyric[]>([])
  const [translatedLyrics, setTranslatedLyrics] = useState<ParsedLyric[]>([])
  const [tokenizedLyrics, setTokenizedLyrics] = useState<Record<number, { segment: string, furiganaHtml: string }[]>>({})
  const [isTranslating, setIsTranslating] = useState(false)
  const [liveTranslationText, setLiveTranslationText] = useState('')
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState('')
  const [liveTps, setLiveTps] = useState('')
  const [livePromptTokens, setLivePromptTokens] = useState(0)
  const [liveCompletionTokens, setLiveCompletionTokens] = useState(0)
  const [liveTotalTokens, setLiveTotalTokens] = useState(0)

  const [selectedLyric, setSelectedLyric] = useState<{ text: string, timeMs: number, clickedWord?: string } | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showVersionsModal, setShowVersionsModal] = useState(false)
  const [lrcVersions, setLrcVersions] = useState<any[]>([])
  const [isSearchingVersions, setIsSearchingVersions] = useState(false)
  const [controlBusy, setControlBusy] = useState(false)
  const [controlError, setControlError] = useState('')
  const [lyricsNotFound, setLyricsNotFound] = useState(false)

  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean
    type: 'retrieval' | 'translation'
    title: string
    message: string
  } | null>(null)

  const tokenizationGeneration = useRef(0)
  const tokenizationSongKey = useRef('')
  const dragStartPos = useRef<{ x: number; y: number; time: number } | null>(null)
  const dragJustOccurred = useRef(false)
  const lastSongTitleArtist = useRef('')
  const attemptedAutoFetchKey = useRef('')
  const translationIdRef = useRef<number>(0)

  const getSelectedTextExcludingRuby = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
    try {
      const range = sel.getRangeAt(0);
      const cloned = range.cloneContents();
      const div = document.createElement('div');
      div.appendChild(cloned);
      div.querySelectorAll('rt, rp').forEach(el => el.remove());
      return div.textContent?.trim() || '';
    } catch {
      return '';
    }
  };

  const handleMediaControl = async (action: 'playpause' | 'next' | 'prev') => {
    if (controlBusy) return
    setControlBusy(true)
    setControlError('')
    try {
      const result = await (window as any).api.mediaControl(action)
      if (!result?.ok) setControlError(action === 'next' ? '다음 곡으로 넘기지 못했습니다.' : action === 'prev' ? '이전 곡으로 이동하지 못했습니다.' : 'Apple Music을 제어하지 못했습니다.')
    } catch {
      setControlError('Apple Music 제어에 실패했습니다.')
    } finally {
      setControlBusy(false)
    }
  }

  const formatTime = (ms: number) => {
    if (isNaN(ms) || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      // @ts-ignore
      if (window.api && window.api.offTranslationProgress) window.api.offTranslationProgress()
    }
  }, [])

  useEffect(() => {
    if (songInfo && songInfo.lrc) {
      setLyricsNotFound(false)
      const parsed = parseLyrics(songInfo.lrc)
      setLyrics(parsed)
      const generation = ++tokenizationGeneration.current
      const songKey = [songInfo.title, songInfo.artist, songInfo.album, songInfo.lrc, displaySettings?.furiganaScript].map(value => String(value || '')).join('|')
      tokenizationSongKey.current = songKey
      setTokenizedLyrics({})
      
      // Async tokenization for Japanese Furigana
      // @ts-ignore
      if (window.api && window.api.tokenizeJapanese) {
        Promise.allSettled(parsed.map(async (line, i) => {
          if (tokenizationGeneration.current !== generation || tokenizationSongKey.current !== songKey) return
          // @ts-ignore
          const tokens = await window.api.tokenizeJapanese({
            text: line.text,
            script: displaySettings?.furiganaScript || 'hiragana'
          })
          if (tokenizationGeneration.current !== generation || tokenizationSongKey.current !== songKey) return
          setTokenizedLyrics(prev => ({
            ...prev,
            [i]: tokens
          }))
        }))
      }

      if (songInfo.translatedLrc) {
        setTranslatedLyrics(parseLyrics(songInfo.translatedLrc))
      } else {
        setTranslatedLyrics([])
      }
    } else if (songInfo && !songInfo.lrc) {
      tokenizationGeneration.current += 1
      setLyrics([])
      setTranslatedLyrics([])
      setTokenizedLyrics({})
      setIsTranslating(false)
    }
  }, [songInfo?.title, songInfo?.artist, songInfo?.album, songInfo?.lrc, songInfo?.translatedLrc, displaySettings?.furiganaScript])

  useEffect(() => {
    const key = `${songInfo?.title || ''}|${songInfo?.artist || ''}`;
    if (lastSongTitleArtist.current && lastSongTitleArtist.current !== key) {
      translationIdRef.current += 1;
      setIsTranslating(false);
      // @ts-ignore
      if (window.api && window.api.offTranslationProgress) {
        // @ts-ignore
        window.api.offTranslationProgress();
      }
      setLiveElapsedSeconds('');
      setLiveTps('');
      setLivePromptTokens(0);
      setLiveCompletionTokens(0);
      setLiveTotalTokens(0);
      setLiveTranslationText('');
      setLyricsNotFound(false);
      if (!songInfo?.lrc) {
        setLyrics([]);
        setTranslatedLyrics([]);
        setTokenizedLyrics({});
      }
    }
    lastSongTitleArtist.current = key;
  }, [songInfo?.title, songInfo?.artist, songInfo?.lrc])

  // Auto-fetch lyrics when entering the empty state (only once per song)
  useEffect(() => {
    const songKey = `${songInfo?.title || ''}|${songInfo?.artist || ''}`;
    if (!songKey || songKey === '|') return;

    if (
      autoFetch &&
      songInfo &&
      !songInfo.lrc &&
      !songInfo.isLoading &&
      !isTranslating &&
      lyrics.length === 0 &&
      attemptedAutoFetchKey.current !== songKey
    ) {
      attemptedAutoFetchKey.current = songKey;
      handleSyncClick();
    }
  }, [autoFetch, songInfo?.title, songInfo?.artist, songInfo?.lrc, lyrics.length, isTranslating])

  const handleLyricClick = (text: string, timeMs: number, clickedWord?: string) => {
    setSelectedLyric({ text, timeMs, clickedWord })
    setShowSidebar(true)
  }

  const getDurationSec = () => {
    if (durationMs > 0) return durationMs / 1000
    const rawDur = songInfo?.duration || playingSong?.duration || 0
    if (rawDur > 10000000) return rawDur / 10000000
    if (rawDur > 10000) return rawDur / 1000
    return rawDur
  }

  const handleSearchVersions = async () => {
    if (!songInfo) return
    setShowVersionsModal(true)
    setIsSearchingVersions(true)
    try {
      const durSec = getDurationSec()
      const versions = await (window as any).api.searchLrcVersions({
        title: songInfo.title,
        artist: songInfo.artist,
        duration: durSec
      })
      setLrcVersions(versions)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSearchingVersions(false)
    }
  }

  const handleSelectVersion = async (rawLyrics: string, duration?: number) => {
    if (!songInfo) return
    let newLyrics = rawLyrics
    if (duration && duration > 0 && !newLyrics.includes('[length:')) {
      const mm = Math.floor(duration / 60);
      const ss = Math.floor(duration % 60);
      newLyrics = `[length: ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}]\n` + newLyrics;
    }

    const isCurrent = Boolean(songInfo?.lrc && areLyricsEquivalent(newLyrics, songInfo.lrc));
    if (isCurrent && songInfo.translatedLrc) {
      setShowVersionsModal(false);
      return;
    }

    setShowVersionsModal(false);

    const result = await (window as any).api.updateOriginalLyrics({
      title: songInfo.title,
      artist: songInfo.artist,
      newLyrics
    });

    if (result && result.hasCachedTranslation && result.translatedLyrics) {
      setSongInfo((prev: any) => prev ? {
        ...prev,
        lrc: newLyrics,
        translatedLrc: result.translatedLyrics,
        translatedModel: result.translatedModel || prev?.translatedModel,
        translatedModelInfo: result.translatedModelInfo || prev?.translatedModelInfo
      } : prev);
      setLyricsNotFound(false);
      return;
    }

    setSongInfo((prev: any) => prev ? {
      ...prev,
      lrc: newLyrics,
      translatedLrc: null,
      translatedModel: null,
      translatedModelInfo: null
    } : prev);

    setTimeout(() => {
      handleSyncClick(false, newLyrics);
    }, 100);
  }

  const handleSyncClick = async (force: boolean = false, overrideLrc?: string) => {
    if (!songInfo) return
    const currentId = ++translationIdRef.current;
    const startedAt = Date.now()
    
    // 1. Check DB cache first if not explicitly force-retranslating
    if (!force) {
      try {
        // @ts-ignore
        if (window.api && window.api.getLyricsCache) {
          // @ts-ignore
          const cached = await window.api.getLyricsCache({
            title: songInfo.title,
            artist: songInfo.artist,
            originalLyrics: overrideLrc || songInfo.lrc
          });
          if (cached && cached.lrc && cached.translatedLrc) {
            if (translationIdRef.current === currentId) {
              setLyricsNotFound(false);
              setSongInfo((prev: any) => ({
                ...prev,
                lrc: cached.lrc,
                translatedLrc: cached.translatedLrc,
                cover: cached.cover || prev?.cover,
                translatedModel: cached.translatedModel || prev?.translatedModel,
                translatedModelInfo: cached.translatedModelInfo || prev?.translatedModelInfo
              }));
            }
            return;
          }
        }
      } catch (e) {
        console.warn('Cache lookup failed:', e);
      }
    }

    if (translationIdRef.current !== currentId) return;

    setIsTranslating(true)
    setLyricsNotFound(false)
    setLiveTranslationText('')
    setLiveElapsedSeconds('')
    setLiveTps('')
    setLivePromptTokens(0)
    setLiveCompletionTokens(0)
    setLiveTotalTokens(0)
    
    // @ts-ignore
    if (window.api && window.api.onTranslationProgress) {
      // @ts-ignore
      window.api.offTranslationProgress()
      // @ts-ignore
      window.api.onTranslationProgress((progressData: any) => {
        if (translationIdRef.current === currentId) {
          if (typeof progressData === 'object' && progressData !== null) {
            setLiveTranslationText(prev => prev + (progressData.chunk || ''))
            if (progressData.elapsedSeconds) setLiveElapsedSeconds(progressData.elapsedSeconds)
            if (progressData.tps) setLiveTps(progressData.tps)
            if (typeof progressData.promptTokens === 'number') setLivePromptTokens(progressData.promptTokens)
            if (typeof progressData.completionTokens === 'number') setLiveCompletionTokens(progressData.completionTokens)
            if (typeof progressData.totalTokens === 'number') setLiveTotalTokens(progressData.totalTokens)
          } else {
            setLiveTranslationText(prev => prev + String(progressData || ''))
          }
        }
      })
    }

    try {
      const durSec = getDurationSec()
      // @ts-ignore
      const originalLrc = overrideLrc || songInfo.lrc || await window.api.fetchLrcManual({ title: songInfo.title, artist: songInfo.artist, duration: durSec })
      
      if (translationIdRef.current !== currentId) return;

      if (!originalLrc || originalLrc.includes('온라인에서 가사를 찾을 수 없습니다')) {
        if (translationIdRef.current === currentId) {
          setIsTranslating(false);
          setLyricsNotFound(true);
        }
        return;
      }

      setLyricsNotFound(false);
      // 우선 원문 가사 표시
      if (translationIdRef.current === currentId) {
        setSongInfo((prev: any) => {
          if (prev && prev.title === songInfo.title && prev.artist === songInfo.artist) {
            return { ...prev, lrc: originalLrc };
          }
          return prev;
        });
      }
      
      if (translationIdRef.current !== currentId) return;

      // 번역 진행
      // @ts-ignore
      const res = await window.api.translateLyrics({ 
        originalLyrics: originalLrc, 
        model: selectedModel, 
        title: songInfo.title, 
        artist: songInfo.artist,
        cover: songInfo.cover,
        targetLanguage: displaySettings?.targetLanguage || 'Korean'
      });

      if (translationIdRef.current !== currentId) return;
      
      const translatedLrc = typeof res === 'string' ? res : res.translated;
      const translatedModel = typeof res === 'object' ? res.model : selectedModel;
      const translatedModelInfo = typeof res === 'object' ? res.modelInfo : null;

      if (translationIdRef.current === currentId) {
        if (translatedModelInfo?.elapsedSeconds) {
          setLiveElapsedSeconds(translatedModelInfo.elapsedSeconds);
        }
        setSongInfo((prev: any) => {
          if (prev && prev.title === songInfo.title && prev.artist === songInfo.artist) {
            return { ...prev, lrc: originalLrc, translatedLrc, translatedModel, translatedModelInfo };
          }
          return prev;
        });
      }
    } catch (e: any) {
      if (translationIdRef.current === currentId) {
        setIsTranslating(false);
        if (!String(e).includes('ABORTED') && !String(e).includes('abort')) {
          const errStr = String(e?.message || e);
          if (errStr.includes('찾을 수 없습니다') || errStr.includes('가사 취득')) {
            setLyricsNotFound(true);
          } else {
            setErrorModal({
              isOpen: true,
              type: 'translation',
              title: 'AI 가사 번역 실패',
              message: errStr.replace(/^Error:\s*/, '')
            });
          }
        }
      }
    } finally {
      if (translationIdRef.current === currentId) {
        const remaining = 800 - (Date.now() - startedAt)
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining))
        setIsTranslating(false)
        // @ts-ignore
        if (window.api && window.api.offTranslationProgress) {
          // @ts-ignore
          window.api.offTranslationProgress()
        }
      }
    }
  }

  const lyricsContainerRef = useRef<HTMLDivElement>(null)

  // position 단위 자동 감지 및 버그 픽스 (duration 기반 안전 보정)
  let baseTimeMs = 0
  let durationMs = 0
  
  if (songInfo?.duration) {
    if (songInfo.duration > 10000000) {
      durationMs = songInfo.duration / 10000
    } else if (songInfo.duration > 10000) {
      durationMs = songInfo.duration
    } else {
      durationMs = songInfo.duration * 1000
    }
  }

  if (durationMs === 0 && lyrics.length > 0) {
    durationMs = lyrics[lyrics.length - 1].timeMs + 10000; // 마지막 가사보다 10초 더 긴 것을 총 길이로 어림잡음
  }

  if (songInfo?.position !== undefined) {
    if (songInfo.duration && songInfo.duration > 10000) {
      baseTimeMs = songInfo.position > 10000000 ? songInfo.position / 10000 : songInfo.position
    } else {
      baseTimeMs = songInfo.position > 10000000 ? songInfo.position / 10000 : 
                      songInfo.position > 10000 ? songInfo.position : songInfo.position * 1000
    }
  }

  // SMTC의 느린 갱신 주기(예: 1~3초) 및 지연 수신(Position Jitter)으로 인한 뒤쳐짐/튀김 방지 보간 로직
  const [currentInterpolatedTime, setCurrentInterpolatedTime] = useState(0)
  const lastUpdateRef = useRef(Date.now())
  const interpolatedTimeRef = useRef(0)

  useEffect(() => {
    const now = Date.now()
    const prevTime = interpolatedTimeRef.current
    
    // SMTC 미세 시간 뒤쳐짐 (0 ~ 2500ms 지연 수신)인 경우 재생 시간 역전 방지
    const isMinorBackwardJitter = songInfo?.state === 'playing' && prevTime > 0 && (prevTime - baseTimeMs > 0) && (prevTime - baseTimeMs < 2500)

    if (isMinorBackwardJitter) {
      lastUpdateRef.current = now - (prevTime - baseTimeMs)
    } else {
      lastUpdateRef.current = now
      interpolatedTimeRef.current = baseTimeMs
      setCurrentInterpolatedTime(baseTimeMs)
    }
  }, [baseTimeMs, songInfo?.state])

  useEffect(() => {
    if (songInfo?.state !== 'playing') return
    const interval = setInterval(() => {
      const computed = baseTimeMs + (Date.now() - lastUpdateRef.current)
      if (computed >= interpolatedTimeRef.current) {
        interpolatedTimeRef.current = computed
        setCurrentInterpolatedTime(computed)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [songInfo?.state, baseTimeMs])

  // 가사 싱크 조절 상태 (기본값: 기존의 800ms)
  const [syncOffset, setSyncOffset] = useState(800)
  const [showSyncSlider, setShowSyncSlider] = useState(false)

  // 가사 총 길이 및 스마트 싱크 보정값 계산
  const lrcDurationMs = extractLrcDurationMs(songInfo?.lrc || '', lyrics)
  const smartSync = calculateSmartSyncOffset(durationMs, lrcDurationMs, 800)

  // 곡이 바뀌거나 새로운 가사가 로드되었을 때 자동 싱크 보정 적용
  const lastSyncTrackKey = useRef('')
  useEffect(() => {
    const trackKey = `${songInfo?.title || ''}|${songInfo?.artist || ''}|${songInfo?.lrc?.length || 0}`
    if (trackKey !== lastSyncTrackKey.current && songInfo?.lrc) {
      lastSyncTrackKey.current = trackKey
      if (displaySettings?.autoSyncByDuration !== false && smartSync.isDiffSignificant) {
        setSyncOffset(smartSync.recommendedOffsetMs)
      } else {
        setSyncOffset(800)
      }
    }
  }, [songInfo?.title, songInfo?.artist, songInfo?.lrc, smartSync.isDiffSignificant, smartSync.recommendedOffsetMs, displaySettings?.autoSyncByDuration])

  // 가사 싱크가 실음악보다 약간 느리다는 피드백을 반영하여 보정값 적용
  const currentTimeMs = currentInterpolatedTime + syncOffset

  let activeIndex = -1
  if (lyrics.length > 0) {
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTimeMs >= lyrics[i].timeMs) {
        activeIndex = i
        break
      }
    }
  }

  // 활성 가사가 바뀔 때마다 스크롤 이동
  const isMouseDownRef = useRef(false);

  useEffect(() => {
    const onMouseDown = () => { isMouseDownRef.current = true; };
    const onMouseUp = () => { isMouseDownRef.current = false; };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    if (lyricsContainerRef.current) {
      lyricsContainerRef.current.scrollTop = 0;
    }
  }, [songInfo?.title, songInfo?.artist, songInfo?.lrc]);

  useEffect(() => {
    if (lyricsContainerRef.current && !isMouseDownRef.current) {
      const container = lyricsContainerRef.current;
      if (activeIndex === -1) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const lyricEls = container.querySelectorAll('.lyric-line');
        const activeEl = lyricEls[activeIndex] as HTMLElement;
        if (activeEl) {
          container.scrollTo({
            top: activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [activeIndex]);

  if (songInfo?.isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center space-y-4 p-8">
        <div className="flex space-x-3 items-center opacity-70 mb-4">
          <div className="w-4 h-4 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-4 h-4 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-4 h-4 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
        <h2 className="text-2xl font-black text-gray-800">가사 취득 중...</h2>
        <p className="text-gray-500">{songInfo.title}</p>
      </div>
    )
  }

  const renderVersionsModal = () => {
    if (!showVersionsModal) return null;
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="text-xl font-bold text-gray-900">다른 가사 버전 선택</h3>
            <button onClick={() => setShowVersionsModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isSearchingVersions ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">가사 버전 검색 중...</p>
              </div>
            ) : lrcVersions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                다른 버전의 가사를 찾을 수 없습니다.
              </div>
            ) : (() => {
              const currentVersionIndex = songInfo?.lrc
                ? lrcVersions.findIndex((v) => areLyricsEquivalent(v.syncedLyrics, songInfo.lrc))
                : -1;
              return lrcVersions.map((v, i) => {
                const isCurrent = i === currentVersionIndex;
                return (
                  <div 
                    key={i}
                    onClick={() => handleSelectVersion(v.syncedLyrics, v.duration)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col space-y-2 group ${
                      isCurrent 
                        ? 'border-rose-400 bg-rose-50/60 ring-2 ring-rose-200/50 shadow-sm' 
                        : 'border-gray-100 hover:border-rose-200 hover:bg-rose-50/30'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold transition-colors ${isCurrent ? 'text-rose-700' : 'text-gray-900 group-hover:text-rose-600'}`}>
                            {v.trackName}
                          </span>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200/60">
                              <svg className="w-3 h-3 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              현재 적용 중
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{v.artistName}</div>
                      </div>
                      <div className={`text-xs font-mono px-2 py-1 rounded text-right shrink-0 ${
                        isCurrent ? 'bg-rose-100 text-rose-700 font-medium' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {formatTime(v.duration * 1000)}
                      </div>
                    </div>
                    <div className={`text-sm p-3 rounded-lg border font-medium mt-2 whitespace-pre-line ${
                      isCurrent 
                        ? 'text-rose-900/80 bg-white/80 border-rose-100' 
                        : 'text-gray-600 bg-gray-50 border-gray-100'
                    }`}>
                      {v.syncedLyrics.split('\n').slice(0, 3).join('\n').replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '')}
                      {v.syncedLyrics.split('\n').length > 3 ? '\n...' : ''}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    );
  };

  const renderErrorModal = () => {
    if (!errorModal?.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150">
          <div className={`p-4 rounded-2xl mb-4 ${errorModal.type === 'retrieval' ? 'bg-amber-50 text-amber-500' : 'bg-red-50 text-red-500'}`}>
            {errorModal.type === 'retrieval' ? <FileQuestion className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{errorModal.title}</h3>
          {songInfo && (
            <div className="flex items-center space-x-3 w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 my-3 text-left">
              {songInfo.cover ? (
                <img 
                  src={songInfo.cover.startsWith('data:image') ? songInfo.cover : `data:image/jpeg;base64,${songInfo.cover}`} 
                  alt="" 
                  className="w-12 h-12 rounded-xl object-cover border border-black/5 shrink-0" 
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center text-gray-400 shrink-0 font-bold text-xs">
                  MUSIC
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 text-sm truncate" title={songInfo.title}>{songInfo.title}</div>
                <div className="text-xs text-rose-500 font-medium truncate" title={songInfo.artist}>{songInfo.artist}</div>
                {songInfo.album && <div className="text-[11px] text-gray-400 truncate" title={songInfo.album}>{songInfo.album}</div>}
              </div>
            </div>
          )}
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">{errorModal.message}</p>
          <div className="flex space-x-3 w-full justify-center">
            {errorModal.type === 'retrieval' ? (
              <button
                onClick={() => {
                  setErrorModal(null);
                  handleSearchVersions();
                }}
                className="flex-1 py-3 px-4 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-sm transition-all shadow-md"
              >
                다른 가사 찾기
              </button>
            ) : (
              <button
                onClick={() => {
                  setErrorModal(null);
                  handleSyncClick(true);
                }}
                className="flex-1 py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-sm transition-all shadow-md"
              >
                다시 시도
              </button>
            )}
            <button
              onClick={() => setErrorModal(null)}
              className="px-5 py-3 border border-gray-200 text-gray-600 hover:bg-gray-100 font-semibold rounded-xl text-sm transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!songInfo || lyrics.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center space-y-8 p-8 relative w-full">
        {/* Animated Background Blob */}
        <div className="absolute w-96 h-96 bg-rose-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob z-0"></div>
        
        <div className="text-center z-10 flex flex-col items-center w-full max-w-md">
          {songInfo ? (
            <>
              {songInfo.cover && (
                <div className="relative mb-6">
                  <img src={songInfo.cover.startsWith('data:image') ? songInfo.cover : `data:image/jpeg;base64,${songInfo.cover}`} alt="Album Cover" className="w-48 h-48 rounded-2xl shadow-2xl object-cover" />
                  {songInfo.state === 'playing' && (
                    <div className="absolute -bottom-3 -right-3 bg-white p-2.5 rounded-full shadow-lg flex space-x-1 items-end h-10 w-10 justify-center">
                      <div className="w-1 bg-rose-500 rounded-full animate-pulse h-4"></div>
                      <div className="w-1 bg-rose-500 rounded-full animate-pulse h-6" style={{ animationDelay: '100ms' }}></div>
                      <div className="w-1 bg-rose-500 rounded-full animate-pulse h-3" style={{ animationDelay: '200ms' }}></div>
                    </div>
                  )}
                </div>
              )}
              <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">{songInfo.title}</h2>
              <p className="text-gray-500 text-lg mb-8 font-medium">{songInfo.artist}</p>
              
              {durationMs > 0 && (
                <div className="w-full flex items-center space-x-3 mb-6">
                  <span className="text-xs font-medium text-gray-400 font-mono">{formatTime(Math.min(currentTimeMs, durationMs))}</span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
                    <div 
                      className="absolute top-0 left-0 h-full bg-rose-400 transition-all duration-300 ease-linear rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-400 font-mono">{formatTime(durationMs)}</span>
                </div>
              )}

              {/* Media Controls for Empty State */}
              <div className="flex items-center space-x-5 mb-8">
                <button 
                  onClick={() => handleMediaControl('prev')} disabled={controlBusy}
                  className="p-2 text-gray-400 hover:text-gray-800 transition-colors hover:bg-gray-100 rounded-full"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>
                <button 
                  onClick={() => handleMediaControl('playpause')} disabled={controlBusy}
                  className="p-3 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-transform hover:scale-105 shadow-md shadow-rose-200"
                >
                  {songInfo?.state === 'playing' ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                </button>
                <button 
                  onClick={() => handleMediaControl('next')} disabled={controlBusy}
                  className="p-2 text-gray-400 hover:text-gray-800 transition-colors hover:bg-gray-100 rounded-full"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>
              
              {isTranslating ? (
                <div className="flex flex-col items-center w-full p-6 bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex space-x-2 items-center mb-4">
                    <div className="w-3 h-3 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-3 h-3 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-3 h-3 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">
                    {liveTranslationText ? '가사 스트리밍 중...' : '가사를 불러오는 중...'}
                  </h3>
                  <p className="text-sm text-gray-500 text-center mb-3">
                    {liveTranslationText 
                      ? 'AI가 실시간으로 가사를 번역하고 토큰을 생성 중입니다.' 
                      : 'AI 로컬 모델을 로드하고 프롬프트를 분석 중입니다.'}
                  </p>
                  {liveTranslationText && (
                    <div className="w-full bg-gray-950/95 border border-gray-800 rounded-2xl p-4 text-left overflow-hidden shadow-xl mt-2">
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-800/70">
                        <div className="flex items-center space-x-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                          <span className="text-xs font-mono font-bold text-gray-300">LIVE TOKEN STREAM</span>
                        </div>
                        <div className="text-xs font-mono text-gray-400">
                          경과 시간: <strong className="text-emerald-400">{liveElapsedSeconds || '0.0'}s</strong>
                        </div>
                      </div>

                      {/* Token Metrics Grid */}
                      <div className="grid grid-cols-3 gap-2 mb-3 bg-gray-900/80 p-2.5 rounded-xl border border-gray-800 text-center font-mono">
                        <div>
                          <div className="text-[10px] text-gray-400">생성 토큰</div>
                          <div className="text-base font-bold text-emerald-400">{liveCompletionTokens || liveTotalTokens || 0} <span className="text-[10px] text-gray-500 font-normal">tok</span></div>
                        </div>
                        <div className="border-x border-gray-800">
                          <div className="text-[10px] text-gray-400">프롬프트 토큰</div>
                          <div className="text-base font-bold text-gray-300">{livePromptTokens || 0} <span className="text-[10px] text-gray-500 font-normal">tok</span></div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400">초당 속도</div>
                          <div className="text-base font-bold text-cyan-400">{liveTps || '0.0'} <span className="text-[10px] text-gray-500 font-normal">t/s</span></div>
                        </div>
                      </div>

                      <div className="text-emerald-400 font-mono text-sm whitespace-pre-wrap break-words h-28 overflow-y-auto pr-1">
                        {liveTranslationText}
                        <span className="animate-pulse ml-1 inline-block w-2 h-4 bg-emerald-400 align-middle"></span>
                      </div>
                    </div>
                  )}
                </div>
              ) : lyricsNotFound ? (
                <div className="flex flex-col items-center space-y-3 mt-4 w-full max-w-sm animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2 px-4 py-2 bg-gray-100/90 border border-gray-200/70 rounded-xl text-gray-500 text-xs font-medium">
                    <FileQuestion className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>온라인에서 가사를 찾을 수 없습니다</span>
                  </div>

                  <div className="flex w-full space-x-2">
                    <button 
                      onClick={handleSearchVersions}
                      className="flex-1 flex items-center justify-center space-x-1.5 bg-gray-900 hover:bg-black text-white px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-sm hover:shadow hover:-translate-y-0.5"
                    >
                      <Search className="w-4 h-4" />
                      <span>다른 가사 찾기</span>
                    </button>
                    <button 
                      onClick={() => {
                        // @ts-ignore
                        window.api.openAppleMusic()
                      }}
                      className="flex items-center justify-center space-x-1.5 bg-white hover:bg-rose-50 text-rose-500 border border-rose-100 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Apple Music 열기</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleSyncClick(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline decoration-gray-300 underline-offset-4 transition-colors pt-1"
                  >
                    가사 다시 검색하기
                  </button>
                </div>
              ) : (
                <div className="flex flex-col space-y-3 mt-4">
                  <button 
                    onClick={() => handleSyncClick(false)}
                    className="flex items-center justify-center space-x-2 bg-gray-900 hover:bg-black text-white px-8 py-3.5 rounded-xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <span>가사 및 번역 취득 시작</span>
                  </button>
                  <button 
                    onClick={() => {
                      // @ts-ignore
                      window.api.openAppleMusic()
                    }}
                    className="flex items-center justify-center space-x-2 bg-white hover:bg-rose-50 text-rose-500 border border-rose-100 px-8 py-3.5 rounded-xl font-bold transition-all shadow-sm"
                  >
                    <ExternalLink className="w-5 h-5" />
                    <span>Apple Music 열기</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-3xl font-black text-gray-900 mb-3 tracking-tight">Apple Music을 실행해주세요</h2>
              <p className="text-gray-500 text-lg mb-4 font-medium">현재 재생 중인 음악 정보가 없습니다.</p>
              <button 
                onClick={() => {
                  // @ts-ignore
                  window.api.openAppleMusic()
                }}
                className="flex items-center justify-center space-x-2 bg-gray-900 hover:bg-black text-white px-8 py-3.5 rounded-xl font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 mt-6"
              >
                <ExternalLink className="w-5 h-5" />
                <span>Apple Music 열기</span>
              </button>
            </>
          )}
        </div>
        {renderVersionsModal()}
        {renderErrorModal()}
      </div>
    )
  }

  const getMainFontSizeClass = () => {
    switch (displaySettings?.mainFontSize) {
      case 'small': return 'text-xl sm:text-2xl';
      case 'medium': return 'text-2xl sm:text-3xl';
      case 'xlarge': return 'text-3xl sm:text-4xl';
      case 'large':
      default: return 'text-[clamp(1.25rem,3.5vw,2.25rem)]';
    }
  };

  const getTransFontSizeClass = () => {
    switch (displaySettings?.transFontSize) {
      case 'small': return 'text-sm sm:text-base';
      case 'large': return 'text-xl sm:text-2xl';
      case 'medium':
      default: return 'text-lg sm:text-xl';
    }
  };

  const getLineGapClass = () => {
    switch (displaySettings?.lineGap) {
      case 'small': return 'mt-1.5';
      case 'large': return 'mt-5';
      case 'medium':
      default: return 'mt-3';
    }
  };

  return (
    <div className="flex flex-row h-full w-full max-w-5xl mx-auto relative">
      {controlError && <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-red-50 text-red-600 border border-red-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm">{controlError}</div>}
      <div className="flex flex-col flex-1 h-full relative p-6">
        <div className="mb-8 mt-2 flex items-end space-x-6">
          {songInfo?.cover && (
            <img 
              src={songInfo.cover.startsWith('data:image') ? songInfo.cover : `data:image/jpeg;base64,${songInfo.cover}`} 
              alt="Album Art" 
              className="w-32 h-32 rounded-2xl shadow-xl object-cover border border-black/5"
            />
          )}
          <div className="flex-1 flex justify-between items-end">
            <div className="flex-1 mr-4">
              <h2 
                className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 tracking-tight leading-snug line-clamp-2 break-words" 
                title={songInfo.title}
              >
                {songInfo.title}
              </h2>
              <p 
                className="text-lg sm:text-xl text-rose-500 font-bold mt-1.5 opacity-90 line-clamp-1" 
                title={songInfo.artist}
              >
                {songInfo.artist}
              </p>
              
              {/* Timeline */}
              {durationMs > 0 && (
                <div className="mt-4 flex items-center space-x-3 w-full max-w-md">
                  <span className="text-xs font-medium text-gray-400 font-mono">{formatTime(Math.min(currentTimeMs, durationMs))}</span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
                    <div 
                      className="absolute top-0 left-0 h-full bg-rose-400 transition-all duration-300 ease-linear rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-400 font-mono">{formatTime(durationMs)}</span>
                </div>
              )}

              {/* Media Controls */}
              {(() => {
                const isSameSong = playingSong?.title === songInfo?.title && playingSong?.artist === songInfo?.artist;
                
                if (isSameSong) {
                  return (
                    <div className="flex items-center space-x-5 mt-4">
                      <button 
                        onClick={() => handleMediaControl('prev')} disabled={controlBusy}
                        className="p-2 text-gray-400 hover:text-gray-800 transition-colors hover:bg-gray-100 rounded-full"
                      >
                        <SkipBack className="w-5 h-5 fill-current" />
                      </button>
                      <button 
                        onClick={() => handleMediaControl('playpause')} disabled={controlBusy}
                        className="p-3 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-transform hover:scale-105 shadow-md shadow-rose-200"
                      >
                        {playingSong?.state === 'playing' ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                      </button>
                      <button 
                        onClick={() => handleMediaControl('next')} disabled={controlBusy}
                        className="p-2 text-gray-400 hover:text-gray-800 transition-colors hover:bg-gray-100 rounded-full"
                      >
                        <SkipForward className="w-5 h-5 fill-current" />
                      </button>
                    </div>
                  );
                } else {
                  return (
                    <div className="flex flex-col items-center mt-4 space-y-4">
                      <button 
                        onClick={() => (window as any).api.searchAppleMusic(`${songInfo?.title} ${songInfo?.artist}`)} 
                        className="px-6 py-2.5 bg-gray-900 text-white font-medium rounded-full hover:bg-gray-800 transition-transform hover:scale-105 shadow-md flex items-center space-x-2"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>이 곡 재생</span>
                      </button>
                      
                      {playingSong && (
                        <div className="flex items-center justify-between w-full bg-white/60 p-2 rounded-full border border-gray-100 shadow-sm transition-all hover:bg-white/80">
                          <div 
                            className="flex items-center pl-2 overflow-hidden cursor-pointer flex-1"
                            onClick={() => setSongInfo && setSongInfo(playingSong)}
                            title="이 곡 가사 보기"
                          >
                            {playingSong?.cover && <img src={playingSong.cover.startsWith('data:image') ? playingSong.cover : `data:image/jpeg;base64,${playingSong.cover}`} className="w-6 h-6 rounded-full object-cover mr-2 shadow-sm" />}
                            <span className="text-xs font-semibold text-gray-700 truncate max-w-[120px] hover:text-rose-600 transition-colors">{playingSong?.title}</span>
                            <span className="text-[10px] text-rose-500 font-medium ml-2 truncate max-w-[80px] bg-rose-50 px-1.5 py-0.5 rounded-full">재생 중</span>
                          </div>
                          <div className="flex items-center space-x-1 pr-1 shrink-0">
                            <button onClick={() => handleMediaControl('prev')} disabled={controlBusy} className="p-1.5 text-gray-400 hover:text-gray-800 rounded-full disabled:opacity-40">
                              <SkipBack className="w-3.5 h-3.5 fill-current" />
                            </button>
                            <button onClick={() => handleMediaControl('playpause')} disabled={controlBusy} className="p-1.5 text-rose-500 hover:text-rose-600 rounded-full disabled:opacity-40">
                              {playingSong?.state === 'playing' ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                            </button>
                            <button onClick={() => handleMediaControl('next')} disabled={controlBusy} className="p-1.5 text-gray-400 hover:text-gray-800 rounded-full disabled:opacity-40">
                              <SkipForward className="w-3.5 h-3.5 fill-current" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              })()}
            </div>
            
            {lyrics.length > 0 && (
              <div className="flex flex-col items-end relative">
                {isTranslating ? (
                  <div 
                    className="px-2.5 py-1 bg-rose-50 border border-rose-200/80 rounded-full text-xs font-semibold text-rose-600 flex items-center space-x-1.5 mb-2 shadow-sm animate-pulse"
                    title={`실시간 번역 중 | 생성 토큰: ${liveCompletionTokens || liveTotalTokens || 0} | 프롬프트: ${livePromptTokens || 0} | 속도: ${liveTps || '0.0'} t/s | 소요 시간: ${liveElapsedSeconds || '0.0'}초`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                    <span className="font-bold">번역 중:</span>
                    <span className="font-mono text-[11px] font-bold">{liveCompletionTokens || liveTotalTokens || 0} tok</span>
                    {liveTps && <span className="font-mono text-[10px] text-rose-400">({liveTps} t/s)</span>}
                    <span className="font-mono text-[10px] text-rose-500 font-bold">· {liveElapsedSeconds || '0.0'}s</span>
                  </div>
                ) : songInfo?.translatedModel || (translatedLyrics.length > 0 && (songInfo?.translatedModelInfo || liveElapsedSeconds)) ? (
                  <div 
                    className="px-2.5 py-1 bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-full text-xs font-semibold text-gray-600 flex items-center space-x-1.5 mb-2 shadow-sm"
                    title={songInfo?.translatedModelInfo ? `수행 시간: ${songInfo.translatedModelInfo.elapsedSeconds || liveElapsedSeconds || '-'}초 | 생성 토큰: ${songInfo.translatedModelInfo.completionTokens || songInfo.translatedModelInfo.totalTokens || '-'} | 프롬프트: ${songInfo.translatedModelInfo.promptTokens || '-'} | 속도: ${songInfo.translatedModelInfo.tps || '-'} t/s | 대상 언어: ${songInfo.translatedModelInfo.targetLanguage || 'Korean'}` : `번역 모델: ${songInfo?.translatedModel || '완료'}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    <span className="text-gray-500 font-medium">번역:</span>
                    <span className="font-bold text-gray-800">{songInfo?.translatedModel || '완료'}</span>
                    {(() => {
                      const elapsed = songInfo?.translatedModelInfo?.elapsedSeconds 
                        ? `${songInfo.translatedModelInfo.elapsedSeconds}s` 
                        : (liveElapsedSeconds ? `${liveElapsedSeconds}s` : '');
                      const tokens = songInfo?.translatedModelInfo?.completionTokens 
                        ? `${songInfo.translatedModelInfo.completionTokens}tok` 
                        : '';
                      const tps = songInfo?.translatedModelInfo?.tps 
                        ? `${songInfo.translatedModelInfo.tps} t/s` 
                        : '';
                      const stats = [tokens, tps, elapsed].filter(Boolean).join(' · ');

                      if (!stats) return null;
                      return (
                        <span className="text-[10px] text-rose-600 font-mono font-bold bg-rose-50 px-1.5 py-0.5 rounded">
                          {stats}
                        </span>
                      );
                    })()}
                  </div>
                ) : null}
                <div className="flex space-x-2">
                  <button 
                    onClick={handleSearchVersions}
                    className="flex items-center space-x-1 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold transition-colors mb-1"
                    title="다른 가사 찾기"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <span>다른 가사 찾기</span>
                  </button>
                  <button 
                    onClick={() => setShowSyncSlider(!showSyncSlider)}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold transition-colors mb-1 relative"
                    title={smartSync.isDiffSignificant ? `음악과 가사 길이 차이(${Math.abs(smartSync.diffSec)}초)가 감지되었습니다. 클릭하여 스마트 싱크를 조절하세요.` : "가사 싱크 조절"}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{syncOffset > 0 ? `+${(syncOffset/1000).toFixed(1)}s` : `${(syncOffset/1000).toFixed(1)}s`}</span>
                    {smartSync.isDiffSignificant && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title={`곡 길이 차이: ${Math.abs(smartSync.diffSec)}초`} />
                    )}
                  </button>
                  <button 
                    onClick={() => handleSyncClick(translatedLyrics.length > 0)}
                    disabled={isTranslating}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-1"
                    title={translatedLyrics.length > 0 ? "다른 모델로 다시 번역하거나 번역을 새로고침합니다." : "가사 번역을 시작합니다."}
                  >
                    {isTranslating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-rose-400 border-t-rose-600 rounded-full animate-spin" />
                        <span>번역 중...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        <span>{translatedLyrics.length > 0 ? '다시 번역' : '가사 및 번역 취득 시작'}</span>
                      </>
                    )}
                  </button>
                </div>
                {showSyncSlider && (
                  <div className="absolute top-full right-0 mt-2 bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-xl border border-gray-100 flex flex-col w-72 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* Smart Duration Difference Preset Card */}
                    {smartSync.isDiffSignificant && (
                      <div className="mb-3 p-3 bg-amber-50/90 border border-amber-200/80 rounded-xl text-left">
                        <div className="flex items-center justify-between text-xs font-bold text-amber-900 mb-1">
                          <span className="flex items-center space-x-1">
                            <span>⚡ 길이 차이 {Math.abs(smartSync.diffSec)}초 감지</span>
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                            {smartSync.diffSec < 0 ? '가사가 더 긺' : '음악이 더 긺'}
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-700 mb-2 leading-relaxed">
                          {smartSync.diffSec < 0 
                            ? '가사 원본 전주가 길어 가사가 늦게 뜹니다.' 
                            : '음악 전주가 더 길어 가사가 일찍 나옵니다.'}
                        </p>
                        <div className="flex flex-col space-y-1.5">
                          <button
                            type="button"
                            onClick={() => setSyncOffset(smartSync.recommendedOffsetMs)}
                            className={`w-full py-1.5 px-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-1 ${
                              syncOffset === smartSync.recommendedOffsetMs 
                                ? 'bg-amber-600 text-white ring-2 ring-amber-400/40' 
                                : 'bg-amber-500 hover:bg-amber-600 text-white'
                            }`}
                          >
                            <span>⚡ {Math.abs(smartSync.diffSec)}초 {smartSync.recommendedDirection === 'earlier' ? '앞으로 당기기' : '뒤로 밀기'} (추천)</span>
                          </button>
                          <div className="flex space-x-1 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setSyncOffset(smartSync.reverseOffsetMs)}
                              className="flex-1 py-1 px-2 text-gray-600 hover:bg-amber-100/60 rounded border border-amber-200/60 transition-colors text-center"
                            >
                              반대로 적용
                            </button>
                            <button
                              type="button"
                              onClick={() => setSyncOffset(800)}
                              className="py-1 px-2 text-gray-500 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
                            >
                              기본(+0.8s)
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>-5.0s</span>
                      <span className="font-bold text-gray-800">{syncOffset > 0 ? `+${(syncOffset/1000).toFixed(1)}s` : `${(syncOffset/1000).toFixed(1)}s`}</span>
                      <span>+5.0s</span>
                    </div>
                    <input 
                      type="range" 
                      min="-5000" 
                      max="5000" 
                      step="100" 
                      value={syncOffset}
                      onChange={(e) => setSyncOffset(Number(e.target.value))}
                      className="w-full accent-rose-500"
                    />
                    <p className="text-[10px] text-gray-400 mt-2.5 text-center leading-normal">
                      가사가 음악보다 먼저 나오면 -, 늦게 나오면 +로 조절하세요.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div ref={lyricsContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden space-y-10 relative scroll-smooth pb-64 pt-28 pr-6 mask-image-fade">
          {activeIndex === -1 && lyrics.length > 0 && currentTimeMs < lyrics[0].timeMs && (
            <div className="flex space-x-3 items-center py-4 opacity-50 pl-2">
              <div className="w-3 h-3 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          )}
          
          {lyrics.map((line, i) => {
            const isActive = i === activeIndex
            const isPassed = i < activeIndex
            const transLine = translatedLyrics.find(t => Math.abs(t.timeMs - line.timeMs) < 100)
            
            return (
              <div 
                key={i} 
                className={`cursor-pointer group lyric-line pl-2 border-l-4 transition-all duration-500 ${
                  isActive ? 'lyric-active border-rose-500' : isPassed ? 'lyric-passed border-transparent hover:border-gray-300' : 'lyric-future border-transparent hover:border-gray-300'
                }`}
                onMouseDown={(e) => {
                  dragStartPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };
                  dragJustOccurred.current = false;
                }}
                onMouseUp={(e) => {
                  const selection = getSelectedTextExcludingRuby();
                  if (selection) {
                    dragJustOccurred.current = true;
                    e.stopPropagation();
                    handleLyricClick(line.text, line.timeMs, selection);
                  }
                }}
                onClick={() => {
                  if (dragJustOccurred.current) {
                    dragJustOccurred.current = false;
                    return;
                  }
                  const selection = getSelectedTextExcludingRuby();
                  if (selection) return;
                  handleLyricClick(line.text, line.timeMs, line.text.trim() || undefined);
                }}
              >
                <div 
                  className={`${getMainFontSizeClass()} font-bold tracking-tight flex flex-wrap items-baseline`}
                  style={{ lineHeight: '1.8' }}
                >
                  {(!line.text.trim() || line.text.includes('♪') || line.text.includes('🎵')) ? (
                    <div className="flex space-x-3 items-center h-10 opacity-50 pl-1">
                      <div className="w-2.5 h-2.5 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2.5 h-2.5 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2.5 h-2.5 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  ) : (tokenizedLyrics[i] && tokenizedLyrics[i].length > 0) ? (
                    tokenizedLyrics[i].map((segment, idx) => {
                      const word = segment.segment?.trim();
                      const isWord = Boolean(word && word !== '、' && word !== '。' && word !== ',' && word !== '.' && word !== '!' && word !== '?');
                      return (
                        <span 
                          key={idx} 
                          className={`transition-colors duration-200 rounded px-[1px] whitespace-pre-wrap ${
                            isWord 
                              ? `cursor-pointer ${isActive ? 'hover:bg-rose-100 hover:text-rose-600' : 'hover:bg-gray-100 hover:text-gray-700'}` 
                              : ''
                          }`}
                          onClick={(e) => {
                            if (dragJustOccurred.current) {
                              dragJustOccurred.current = false;
                              return;
                            }
                            const selection = getSelectedTextExcludingRuby();
                            if (selection) return;
                            if (!isWord) return;
                            e.stopPropagation();
                            window.getSelection()?.removeAllRanges();
                            handleLyricClick(line.text, line.timeMs, word);
                          }}
                          dangerouslySetInnerHTML={{ __html: segment.furiganaHtml }}
                        />
                      );
                    })
                  ) : (
                    Array.from(segmenter.segment(line.text)).map((segment, idx) => {
                      const word = segment.segment?.trim();
                      const isWord = Boolean(word && segment.isWordLike);
                      return (
                        <span 
                          key={idx} 
                          className={`transition-colors duration-200 rounded px-[1px] whitespace-pre-wrap ${
                            isWord 
                              ? `cursor-pointer ${isActive ? 'hover:bg-rose-100 hover:text-rose-600' : 'hover:bg-gray-100 hover:text-gray-700'}` 
                              : ''
                          }`}
                          onClick={(e) => {
                            if (dragJustOccurred.current) {
                              dragJustOccurred.current = false;
                              return;
                            }
                            const selection = getSelectedTextExcludingRuby();
                            if (selection) return;
                            if (!isWord) return;
                            e.stopPropagation();
                            window.getSelection()?.removeAllRanges();
                            handleLyricClick(line.text, line.timeMs, word);
                          }}
                        >
                          {segment.segment}
                        </span>
                      );
                    })
                  )}
                </div>
                {/* Translation or Skeleton */}
                <div className={`${getLineGapClass()} ${getTransFontSizeClass()} font-semibold transition-colors duration-500 ${isActive ? 'text-gray-600' : 'text-gray-400 group-hover:text-gray-500'}`}>
                  {isTranslating ? (
                    <div className="h-6 w-3/4 rounded animate-pulse skeleton-lyric"></div>
                  ) : transLine ? transLine.text : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      {renderVersionsModal()}
      {renderErrorModal()}

      {showSidebar && (
        <TutorSidebar 
          selectedLyric={selectedLyric} 
          songInfo={songInfo} 
          selectedModel={selectedModel}
          onClose={() => {
            setShowSidebar(false);
            setSelectedLyric(null);
          }} 
        />
      )}
    </div>
  )
}
