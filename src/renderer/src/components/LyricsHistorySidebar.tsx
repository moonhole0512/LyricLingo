import { useState, useEffect } from 'react';

export default function LyricsHistorySidebar({ onSelectSong }: { onSelectSong: (song: any) => void }) {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // @ts-ignore
    if (window.api.getLyricsHistory) {
      // @ts-ignore
      window.api.getLyricsHistory().then((data) => {
        setHistory(data);
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

  return (
    <div className="w-full h-full bg-white/80 backdrop-blur-sm p-6 overflow-y-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">번역 기록</h2>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center text-gray-500 mt-10">
          <p>아직 번역된 가사가 없습니다.</p>
          <p className="text-sm mt-2">음악을 재생하고 가사를 취득해 보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {history.map((item) => (
            <div 
              key={item.id} 
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md hover:border-rose-200 transition-all cursor-pointer group relative"
              onClick={() => onSelectSong(item)}
            >
              <div className="flex items-start space-x-4 mb-2">
                {item.cover ? (
                  <img src={item.cover.startsWith('data:image') ? item.cover : `data:image/jpeg;base64,${item.cover}`} alt="Cover" className="w-14 h-14 rounded-md shadow-sm object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 bg-gray-100 rounded-md flex items-center justify-center text-gray-400 flex-shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2zm12-3c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2zM9 10l12-3" /></svg>
                  </div>
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-center h-14">
                  <h3 className="font-bold text-gray-800 truncate group-hover:text-rose-600 transition-colors pr-6">{item.title}</h3>
                  <p className="text-sm text-gray-500 truncate mt-1">{item.artist}</p>
                </div>
              </div>
              
              <div className="text-xs text-gray-400 flex items-center justify-between mt-3">
                <div className="flex items-center space-x-2">
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  {item.translatedModel && (() => {
                    let info: any = null;
                    if (item.translatedModelInfo) {
                      try {
                        info = typeof item.translatedModelInfo === 'string' ? JSON.parse(item.translatedModelInfo) : item.translatedModelInfo;
                      } catch {}
                    }
                    const titleText = info
                      ? `수행 시간: ${info.elapsedSeconds || '?'}초 | 생성 토큰: ${info.completionTokens || info.totalTokens || '?'} | 프롬프트: ${info.promptTokens || '?'} | 속도: ${info.tps || '?'} t/s | 언어: ${info.targetLanguage || 'Korean'}`
                      : `번역 모델: ${item.translatedModel}`;
                    const stats = [
                      info?.completionTokens ? `${info.completionTokens}tok` : '',
                      info?.tps ? `${info.tps} t/s` : '',
                      info?.elapsedSeconds ? `${info.elapsedSeconds}s` : ''
                    ].filter(Boolean).join(' · ');
                    return (
                      <span 
                        className="bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded text-[10px] font-bold truncate max-w-[220px]" 
                        title={titleText}
                      >
                        {item.translatedModel} {stats ? `(${stats})` : ''}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      // @ts-ignore
                      window.api.searchAppleMusic(item.title + ' ' + item.artist); 
                    }}
                    className="bg-gray-50 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all flex items-center space-x-1"
                    title="Apple Music에서 검색하여 재생하기"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 5.523 4.477 10 10 10s10-4.477 10-10c0-5.523-4.477-10-10-10zm0 18.5c-4.687 0-8.5-3.813-8.5-8.5S7.313 3.5 12 3.5s8.5 3.813 8.5 8.5-3.813 8.5-8.5 8.5zm4.5-12.75v3.125a2.126 2.126 0 01-1.375 2.012v2.863c0 .275-.225.5-.5.5h-1c-.275 0-.5-.225-.5-.5v-2.863a2.126 2.126 0 01-1.375-2.012v-3.125a.75.75 0 011.5 0v3.125c0 .345.28.625.625.625h1.5c.345 0 .625-.28.625-.625v-3.125a.75.75 0 011.5 0z"/></svg>
                    <span>Apple Music</span>
                  </button>
                  <button 
                    onClick={(e) => handleDelete(e, item.id)}
                    className="bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                    title="기록 삭제"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  <span className="bg-rose-50 text-rose-600 px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">가사 보기</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
