import { useState, useEffect } from 'react';
import { Trash2, Music, Search, ChevronRight, Sparkles } from 'lucide-react';

export default function LyricsHistorySidebar({ onSelectSong }: { onSelectSong: (song: any) => void }) {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // @ts-ignore
    if (window.api && window.api.getLyricsHistory) {
      // @ts-ignore
      window.api.getLyricsHistory().then((data) => {
        setHistory(data || []);
        setIsLoading(false);
      }).catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('정말로 이 기록을 삭제하시겠습니까?')) return;
    try {
      // @ts-ignore
      await window.api.deleteLyricsHistory(id);
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error(err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleClearAll = async () => {
    if (history.length === 0) return;
    if (!confirm('저장된 모든 번역 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    try {
      // @ts-ignore
      if (window.api && window.api.clearLyricsHistory) {
        // @ts-ignore
        await window.api.clearLyricsHistory();
      }
      setHistory([]);
    } catch (err) {
      console.error(err);
      alert('일괄 삭제 중 오류가 발생했습니다.');
    }
  };

  const filteredHistory = history.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (item.title && item.title.toLowerCase().includes(q)) ||
           (item.artist && item.artist.toLowerCase().includes(q));
  });

  return (
    <div className="w-full h-full bg-white/70 backdrop-blur-md p-6 sm:p-8 overflow-y-auto">
      {/* Header Section */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">번역 기록</h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
              {history.length}곡
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search Input */}
            {history.length > 0 && (
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="곡명 또는 아티스트 검색"
                  className="pl-9 pr-3 py-1.5 text-xs bg-white/90 border border-gray-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-300 w-44 sm:w-56 transition-all shadow-2xs"
                />
              </div>
            )}

            {/* Bulk Delete Button */}
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center space-x-1.5 text-xs font-medium text-gray-500 hover:text-red-600 bg-white/80 hover:bg-red-50/80 border border-gray-200/70 hover:border-red-200/80 px-3 py-1.5 rounded-xl transition-all shadow-2xs cursor-pointer shrink-0"
                title="모든 번역 기록 일괄 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>기록 전체 삭제</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-6xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-12 bg-white/50 rounded-2xl border border-gray-100 mt-6">
            <div className="w-14 h-14 bg-rose-50 text-rose-400 rounded-2xl flex items-center justify-center mb-3">
              <Music className="w-7 h-7" />
            </div>
            <p className="text-gray-700 font-semibold">아직 번역된 가사 기록이 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">Apple Music에서 음악을 재생하고 가사를 취득해 보세요.</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p className="text-sm font-medium">검색어와 일치하는 번역 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredHistory.map((item) => {
              let info: any = null;
              if (item.translatedModelInfo) {
                try {
                  info = typeof item.translatedModelInfo === 'string' ? JSON.parse(item.translatedModelInfo) : item.translatedModelInfo;
                } catch {}
              }
              const stats = [
                info?.completionTokens ? `${info.completionTokens}tok` : '',
                info?.tps ? `${info.tps} t/s` : '',
                info?.elapsedSeconds ? `${info.elapsedSeconds}s` : ''
              ].filter(Boolean).join(' · ');
              const titleText = info
                ? `수행 시간: ${info.elapsedSeconds || '?'}초 | 생성 토큰: ${info.completionTokens || info.totalTokens || '?'} | 프롬프트: ${info.promptTokens || '?'} | 속도: ${info.tps || '?'} t/s | 언어: ${info.targetLanguage || 'Korean'}`
                : `번역 모델: ${item.translatedModel || 'AI'}`;

              return (
                <div 
                  key={item.id} 
                  className="bg-white/95 rounded-2xl shadow-xs border border-gray-100 hover:border-rose-200/80 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group flex flex-col justify-between"
                  onClick={() => onSelectSong(item)}
                >
                  {/* Top: Cover, Titles, and Actions */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {item.cover ? (
                        <img 
                          src={item.cover.startsWith('data:image') ? item.cover : `data:image/jpeg;base64,${item.cover}`} 
                          alt="Cover" 
                          className="w-12 h-12 rounded-xl shadow-2xs object-cover flex-shrink-0 border border-black/5" 
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gradient-to-br from-rose-50 to-purple-50 rounded-xl flex items-center justify-center text-rose-400 flex-shrink-0 border border-rose-100/60">
                          <Music className="w-6 h-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-gray-800 text-sm truncate group-hover:text-rose-600 transition-colors" title={item.title}>
                          {item.title}
                        </h3>
                        <p className="text-xs text-gray-500 truncate mt-0.5" title={item.artist}>
                          {item.artist || '알 수 없는 아티스트'}
                        </p>
                      </div>
                    </div>

                    {/* Proportional, sleek action buttons */}
                    <div className="flex items-center space-x-1 shrink-0 -mr-1 -mt-1">
                      <button 
                        type="button"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          // @ts-ignore
                          if (window.api && window.api.searchAppleMusic) {
                            // @ts-ignore
                            window.api.searchAppleMusic(item.title + ' ' + (item.artist || '')); 
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Apple Music에서 검색하여 재생하기"
                      >
                        <Music className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => handleDelete(e, item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="기록 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Bottom: Model badge & Timestamp */}
                  <div className="pt-2.5 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
                    <div className="flex items-center space-x-1.5 min-w-0 flex-1 mr-2">
                      {item.translatedModel ? (
                        <span 
                          className="bg-rose-50/90 text-rose-600 border border-rose-100/90 px-2 py-0.5 rounded-md font-medium truncate max-w-[200px]" 
                          title={titleText}
                        >
                          <Sparkles className="w-2.5 h-2.5 inline-block mr-1 -mt-0.5" />
                          {item.translatedModel} {stats ? `(${stats})` : ''}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-medium">번역 완료</span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-1 text-gray-400 shrink-0 font-medium">
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-rose-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
