import { useState, useEffect, useRef } from 'react'
import LyricsPlayer from './components/LyricsPlayer'
import Dashboard from './components/Dashboard'
import LyricsHistorySidebar from './components/LyricsHistorySidebar'
import SettingsModal from './components/SettingsModal'
import logoImg from './assets/logo.png'
import { Settings } from 'lucide-react'
import type { AIStatus, AIProvider, DisplaySettings } from '../../shared/types'

function ModelSelectDropdown({ 
  aiStatus, 
  selectedModel, 
  onSelectModel,
  onSelectProvider,
  onRefresh,
  customModelsJson
}: { 
  aiStatus: AIStatus, 
  selectedModel: string, 
  onSelectModel: (m: string) => void,
  onSelectProvider: (provider: AIProvider) => void,
  onRefresh: () => void,
  customModelsJson?: string
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const connected = aiStatus.connected;
  const activeProvider = aiStatus.activeProvider;
  const selectedProvider = aiStatus.selectedProvider || 'auto';
  
  let models = [...(aiStatus.models || [])];
  
  // Merge custom JSON models
  if (customModelsJson) {
    try {
      const customParsed = JSON.parse(customModelsJson);
      const customArray = Array.isArray(customParsed) ? customParsed : [customParsed];
      for (const item of customArray) {
        const id = typeof item === 'string' ? item : item?.id || item?.name;
        if (id && !models.includes(id)) {
          models.push(id);
        }
      }
    } catch {}
  }

  const providerLabel = activeProvider === 'freetoken'
    ? 'FreeToken'
    : activeProvider === 'lmstudio'
    ? 'LM Studio'
    : 'AI 엔진';

  const displayTitle = selectedModel || (models.length > 0 ? models[0] : '모델 없음');

  const ftConnected = aiStatus.providers?.freetoken?.connected ?? false;
  const lmConnected = aiStatus.providers?.lmstudio?.connected ?? false;

  return (
    <div className="relative shrink-0 flex items-center space-x-1" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-white/80 hover:bg-white text-gray-700 px-3 py-1.5 rounded-full shadow-sm border border-gray-200/80 transition-all text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-400/40 shrink-0 cursor-pointer"
      >
        <div 
          data-testid="ai-status-indicator"
          data-status={connected ? 'online' : 'offline'}
          className={`w-2.5 h-2.5 rounded-full shadow-inner shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`} 
        />
        <span className="text-gray-500 font-medium whitespace-nowrap">{providerLabel}:</span>
        <span className="font-bold text-gray-800 max-w-[130px] truncate">{displayTitle}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <button 
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors focus:outline-none shrink-0"
        onClick={onRefresh}
        title="모델 새로고침"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Engine Selection Tabs */}
          <div className="px-3 py-1.5 border-b border-gray-100 mb-2">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">AI 엔진 선택</div>
            <div className="flex bg-gray-100 p-1 rounded-xl space-x-1">
              <button
                type="button"
                onClick={() => onSelectProvider('auto')}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all text-center flex items-center justify-center space-x-1 ${
                  selectedProvider === 'auto'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>자동</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectProvider('freetoken')}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all text-center flex items-center justify-center space-x-1 ${
                  selectedProvider === 'freetoken'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${ftConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span>FreeToken</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectProvider('lmstudio')}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold transition-all text-center flex items-center justify-center space-x-1 ${
                  selectedProvider === 'lmstudio'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${lmConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span>LM Studio</span>
              </button>
            </div>
          </div>

          <div className="px-3 py-1 border-b border-gray-100 mb-1 flex justify-between items-center">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">사용 가능한 AI 모델</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${connected ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
              {connected ? `${providerLabel} 연결됨` : '오프라인'}
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5 px-1">
            {models.map((model) => {
              const isSelected = model === selectedModel;
              return (
                <div
                  key={model}
                  onClick={() => {
                    onSelectModel(model);
                    setIsOpen(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors flex items-center justify-between ${
                    isSelected ? 'bg-rose-50 text-rose-600 font-bold' : 'text-gray-700 hover:bg-gray-100/80 hover:text-gray-900'
                  }`}
                >
                  <span className="truncate mr-2">{model}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              );
            })}
            {models.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-gray-400 font-medium">
                감지된 모델이 없습니다.<br />FreeToken 또는 LM Studio에서 모델을 로드해주세요.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [playingSong, setPlayingSong] = useState<any>(null)
  const [viewingSong, setViewingSong] = useState<any>(null)
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    connected: false,
    selectedProvider: 'auto',
    activeProvider: 'none',
    models: [],
    providers: {
      lmstudio: { connected: false, models: [], url: '' },
      freetoken: { connected: false, models: [], url: '' }
    }
  })
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'가사' | '기록' | '단어장'>('가사')
  const [autoFetch, setAutoFetch] = useState<boolean>(() => {
    const saved = localStorage.getItem('lyriclingo-autofetch');
    return saved !== null ? saved === 'true' : true;
  });

  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    const saved = localStorage.getItem('lyriclingo-display-settings');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      furiganaScript: 'hiragana',
      mainFontSize: 'large',
      transFontSize: 'medium',
      lineGap: 'medium',
      targetLanguage: 'Korean',
      customModelsJson: ''
    };
  });

  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const isViewingHistoryRef = useRef(false);
  useEffect(() => {
    isViewingHistoryRef.current = isViewingHistory;
  }, [isViewingHistory]);

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const handleSaveDisplaySettings = (newSettings: DisplaySettings) => {
    setDisplaySettings(newSettings);
    localStorage.setItem('lyriclingo-display-settings', JSON.stringify(newSettings));
  };

  // Keep viewingSong in sync with playingSong when autoFetch is ON and not viewing historical archives
  useEffect(() => {
    if (autoFetch && playingSong && playingSong.isAppleMusic !== false && !isViewingHistory) {
      if (!viewingSong || playingSong.title !== viewingSong.title || playingSong.artist !== viewingSong.artist) {
        setViewingSong(playingSong);
      }
    }
  }, [playingSong, viewingSong, autoFetch, isViewingHistory]);

  useEffect(() => {
    const cleanups: Array<() => void> = []
    // @ts-ignore
    const offMusicUpdate = window.api.onMusicUpdate((data) => {
      setPlayingSong(data);
      setViewingSong((prev: any) => {
        if (!prev) return data;
        if (prev.title === data.title && prev.artist === data.artist) {
          return {
            ...data,
            lrc: data.lrc || prev.lrc,
            translatedLrc: data.translatedLrc || prev.translatedLrc,
            translatedModel: data.translatedModel || prev.translatedModel,
            translatedModelInfo: data.translatedModelInfo || prev.translatedModelInfo
          };
        }
        // When track changes, update viewingSong unless explicitly viewing historical archive
        if (!isViewingHistoryRef.current || autoFetch) {
          return data;
        }
        return prev;
      });
    })
    if (offMusicUpdate) cleanups.push(offMusicUpdate)

    // @ts-ignore
    const offMusicClosed = window.api.onMusicClosed(() => {
      setPlayingSong(null);
      setViewingSong(null);
    })
    if (offMusicClosed) cleanups.push(offMusicClosed)

    const updateAiStatusAndModel = (status: AIStatus) => {
      setAiStatus(status)
      const savedModel = localStorage.getItem('lyriclingo-model');
      if (status.models.length > 0) {
        if (savedModel && status.models.includes(savedModel)) {
          setSelectedModel(savedModel);
        } else {
          setSelectedModel(prev => (prev && status.models.includes(prev) ? prev : status.models[0]));
        }
      }
    };

    // @ts-ignore
    const offAIStatus = window.api.onAIStatus((status) => {
      updateAiStatusAndModel(status);
    })
    if (offAIStatus) cleanups.push(offAIStatus)

    const savedProvider = (localStorage.getItem('lyriclingo-provider') as AIProvider) || 'auto';
    // @ts-ignore
    if (window.api.setAIProvider) {
      // @ts-ignore
      window.api.setAIProvider(savedProvider).then((status: AIStatus) => {
        updateAiStatusAndModel(status);
      });
    } else if (window.api.getAIStatus) {
      // @ts-ignore
      window.api.getAIStatus().then((status: AIStatus) => {
        updateAiStatusAndModel(status);
      });
    }
    return () => cleanups.forEach(cleanup => cleanup())
  }, [])

  const handleSelectProvider = (provider: AIProvider) => {
    localStorage.setItem('lyriclingo-provider', provider);
    // @ts-ignore
    if (window.api.setAIProvider) {
      // @ts-ignore
      window.api.setAIProvider(provider).then((status: AIStatus) => {
        setAiStatus(status);
        if (status.models.length > 0) {
          setSelectedModel(status.models[0]);
          localStorage.setItem('lyriclingo-model', status.models[0]);
        }
      });
    }
  };

  return (
    <div className="h-screen w-screen relative flex flex-col text-gray-900 overflow-hidden font-sans bg-[#fbfbfd]">
      {/* Blurred background layer */}
      {viewingSong?.cover && (
        <div 
          className="absolute inset-0 z-0 opacity-[0.15] blur-[80px] scale-110 transition-all duration-1000"
          style={{
            backgroundImage: `url(${viewingSong.cover.startsWith('data:image') ? viewingSong.cover : `data:image/jpeg;base64,${viewingSong.cover}`})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      
      {/* Top Navbar */}
      <div className="h-16 flex items-center px-6 justify-between bg-white/60 backdrop-blur-md border-b border-gray-200/50 z-40 shrink-0 relative whitespace-nowrap">
        <div className="flex items-center space-x-6 shrink-0">
          <div className="flex items-center space-x-2.5 mr-4 shrink-0">
            <img src={logoImg} alt="LyricLingo Logo" className="w-9 h-9 drop-shadow-sm object-contain select-none" />
            <h1 className="text-xl font-bold tracking-tight text-gray-800 whitespace-nowrap">LyricLingo</h1>
          </div>
          
          <div className="flex space-x-6 h-full items-center shrink-0">
            <a 
              className={`cursor-pointer text-lg font-medium transition-colors whitespace-nowrap ${activeTab === '가사' ? 'text-rose-500 font-bold' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => {
                setActiveTab('가사');
                setIsViewingHistory(false);
                if (playingSong && (viewingSong?.title !== playingSong.title || viewingSong?.artist !== playingSong.artist)) {
                  setViewingSong(playingSong);
                }
              }}
            >가사</a>
            <a 
              className={`cursor-pointer text-lg font-medium transition-colors whitespace-nowrap ${activeTab === '기록' ? 'text-rose-500 font-bold' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setActiveTab('기록')}
            >기록</a>
            <a 
              className={`cursor-pointer text-lg font-medium transition-colors whitespace-nowrap ${activeTab === '단어장' ? 'text-rose-500 font-bold' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setActiveTab('단어장')}
            >단어장</a>
          </div>
        </div>
        
        <div className="flex items-center space-x-4 shrink-0">
          <div className="flex items-center space-x-3 text-sm shrink-0 whitespace-nowrap">
            <label className="flex items-center space-x-2 cursor-pointer bg-white/80 px-3 py-1.5 rounded-full shadow-sm border border-gray-200/80 shrink-0 whitespace-nowrap" title="새 곡이 재생될 때 자동으로 가사를 불러오고 번역합니다">
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">자동 취득</span>
              <div className="relative shrink-0">
                <input type="checkbox" className="sr-only" checked={autoFetch} onChange={(e) => {
                  setAutoFetch(e.target.checked);
                  localStorage.setItem('lyriclingo-autofetch', String(e.target.checked));
                }} />
                <div className={`block w-8 h-4 rounded-full transition-colors ${autoFetch ? 'bg-indigo-500' : 'bg-gray-300'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-2 h-2 rounded-full transition-transform ${autoFetch ? 'transform translate-x-4' : ''}`}></div>
              </div>
            </label>

            <ModelSelectDropdown 
              aiStatus={aiStatus}
              selectedModel={selectedModel}
              onSelectModel={(model) => {
                setSelectedModel(model);
                localStorage.setItem('lyriclingo-model', model);
              }}
              onSelectProvider={handleSelectProvider}
              onRefresh={() => {
                // @ts-ignore
                if (window.api.refreshAiModels) {
                  // @ts-ignore
                  window.api.refreshAiModels().then((status: AIStatus) => {
                    setAiStatus(status);
                    if (status.models.length > 0 && !selectedModel) {
                      setSelectedModel(status.models[0]);
                    }
                  });
                }
              }}
              customModelsJson={displaySettings.customModelsJson}
            />

            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 text-gray-500 hover:text-gray-800 bg-white/80 hover:bg-white rounded-full shadow-sm border border-gray-200/80 transition-all focus:outline-none shrink-0 cursor-pointer"
              title="설정"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Floating Notification for new playing song */}
      {!autoFetch && playingSong && viewingSong && (playingSong.title !== viewingSong.title || playingSong.artist !== viewingSong.artist) && activeTab === '가사' && (
        <div className="absolute top-20 right-6 z-50 animate-bounce">
          <div className="bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-gray-100 flex items-center space-x-3 cursor-pointer hover:bg-gray-50 transition-colors"
               onClick={() => {
                 setIsViewingHistory(false);
                 setViewingSong(playingSong);
               }}>
            {playingSong.cover && <img src={playingSong.cover.startsWith('data:image') ? playingSong.cover : `data:image/jpeg;base64,${playingSong.cover}`} className="w-10 h-10 rounded-full shadow-sm object-cover" />}
            <div>
              <p className="text-xs text-rose-500 font-bold">새 곡 재생 중</p>
              <p className="text-sm font-semibold text-gray-800 line-clamp-1">{playingSong.title}</p>
            </div>
            <div className="bg-rose-500 text-white rounded-full p-1 ml-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 w-full overflow-hidden flex">
        {activeTab === '가사' ? (
          <LyricsPlayer songInfo={viewingSong} playingSong={playingSong} selectedModel={selectedModel} setSongInfo={setViewingSong} autoFetch={autoFetch} displaySettings={displaySettings} />
        ) : activeTab === '기록' ? (
          <LyricsHistorySidebar onSelectSong={(song) => {
            setIsViewingHistory(true);
            setViewingSong(song);
            setActiveTab('가사');
          }} />
        ) : (
          <Dashboard />
        )}
      </div>

      {showSettingsModal && (
        <SettingsModal
          settings={displaySettings}
          onSaveSettings={handleSaveDisplaySettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {!aiStatus.connected && (
        <div className="absolute bottom-4 right-4 bg-red-50 text-red-600 px-4 py-2 rounded-lg shadow-md border border-red-100 font-medium z-50 text-sm flex items-center space-x-2 animate-bounce">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <span>FreeToken 또는 LM Studio 서버를 실행해주세요</span>
        </div>
      )}
    </div>
  )
}

export default App
