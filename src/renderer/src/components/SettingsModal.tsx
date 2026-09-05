import { useState } from 'react'
import type { DisplaySettings, YomiganaScript, TargetLanguage } from '../../../shared/types'
import { Settings, Check, AlertCircle, X, Code, Palette } from 'lucide-react'

export interface SettingsModalProps {
  settings: DisplaySettings
  onSaveSettings: (newSettings: DisplaySettings) => void
  onClose: () => void
}

export default function SettingsModal({ settings, onSaveSettings, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'aiJson'>('display')
  const [furiganaScript, setFuriganaScript] = useState<YomiganaScript>(settings.furiganaScript || 'hiragana')
  const [mainFontSize, setMainFontSize] = useState<DisplaySettings['mainFontSize']>(settings.mainFontSize || 'large')
  const [transFontSize, setTransFontSize] = useState<DisplaySettings['transFontSize']>(settings.transFontSize || 'medium')
  const [lineGap, setLineGap] = useState<DisplaySettings['lineGap']>(settings.lineGap || 'medium')
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>(settings.targetLanguage || 'Korean')
  const [autoSyncByDuration, setAutoSyncByDuration] = useState<boolean>(settings.autoSyncByDuration ?? true)
  const [customModelsJson, setCustomModelsJson] = useState<string>(
    settings.customModelsJson ||
      JSON.stringify(
        [
          {
            id: 'custom-qwen2.5-7b',
            name: 'Qwen 2.5 7B Instruct',
            provider: 'lmstudio',
            baseUrl: 'http://127.0.0.1:1234/v1'
          }
        ],
        null,
        2
      )
  )

  const [jsonError, setJsonError] = useState<string>('')

  const handleSave = () => {
    // Validate JSON if provided
    let trimmedJson = customModelsJson.trim()
    if (trimmedJson) {
      try {
        const parsed = JSON.parse(trimmedJson)
        if (!Array.isArray(parsed) && typeof parsed !== 'object') {
          setJsonError('JSON은 배열 또는 객체 형태여야 합니다.')
          return
        }
      } catch (e: any) {
        setJsonError(`JSON 구문 오류: ${e.message}`)
        return
      }
    }

    onSaveSettings({
      furiganaScript,
      mainFontSize,
      transFontSize,
      lineGap,
      targetLanguage,
      autoSyncByDuration,
      customModelsJson: trimmedJson
    })
    onClose()
  }

  const handleInsertTemplate = () => {
    const template = [
      {
        id: 'qwen2.5-coder-7b',
        name: 'Qwen 2.5 Coder 7B',
        provider: 'lmstudio',
        baseUrl: 'http://127.0.0.1:1234/v1'
      },
      {
        id: 'deepseek-r1-distill-qwen-7b',
        name: 'DeepSeek R1 Distill Qwen 7B',
        provider: 'freetoken',
        baseUrl: 'http://127.0.0.1:1919/v1'
      }
    ]
    setCustomModelsJson(JSON.stringify(template, null, 2))
    setJsonError('')
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-xl w-full flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-rose-50 text-rose-500 rounded-2xl">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 tracking-tight">환경 설정</h3>
              <p className="text-xs text-gray-500 font-medium">표시 형식 및 AI 모델 옵션을 커스텀 설정합니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-100 px-6 pt-2 bg-gray-50/30">
          <button
            onClick={() => setActiveTab('display')}
            className={`flex items-center space-x-2 py-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'display'
                ? 'border-rose-500 text-rose-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>표시형식 설정</span>
          </button>
          <button
            onClick={() => setActiveTab('aiJson')}
            className={`flex items-center space-x-2 py-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'aiJson'
                ? 'border-rose-500 text-rose-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>AI 모델 JSON 수동 설정</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {activeTab === 'display' ? (
            <div className="space-y-6">
              {/* Yomigana script */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">요미가나(후리가나) 표기 방식</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFuriganaScript('hiragana')}
                    className={`p-3 rounded-2xl border text-sm font-semibold flex items-center justify-between transition-all ${
                      furiganaScript === 'hiragana'
                        ? 'border-rose-500 bg-rose-50/50 text-rose-600 shadow-sm'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span>히라가나 (ひらがな)</span>
                    {furiganaScript === 'hiragana' && <Check className="w-4 h-4 text-rose-500" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFuriganaScript('katakana')}
                    className={`p-3 rounded-2xl border text-sm font-semibold flex items-center justify-between transition-all ${
                      furiganaScript === 'katakana'
                        ? 'border-rose-500 bg-rose-50/50 text-rose-600 shadow-sm'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span>카타카나 (カタカナ)</span>
                    {furiganaScript === 'katakana' && <Check className="w-4 h-4 text-rose-500" />}
                  </button>
                </div>
              </div>

              {/* Target language */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">번역 대상 언어 (Target Language)</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'Korean', label: '한국어 (Korean)' },
                    { id: 'English', label: 'English (영어)' },
                    { id: 'Japanese', label: '日本語 (일본어)' }
                  ].map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => setTargetLanguage(lang.id as TargetLanguage)}
                      className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center justify-center transition-all ${
                        targetLanguage === lang.id
                          ? 'border-rose-500 bg-rose-50/50 text-rose-600 shadow-sm font-bold'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Lyric Font Size */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">원문 가사 폰트 크기</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'small', label: '작게' },
                    { id: 'medium', label: '보통' },
                    { id: 'large', label: '크게' },
                    { id: 'xlarge', label: '매우 크게' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMainFontSize(opt.id as DisplaySettings['mainFontSize'])}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        mainFontSize === opt.id
                          ? 'border-rose-500 bg-rose-500 text-white shadow-md'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Translated Lyric Font Size */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">번역 가사 폰트 크기</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'small', label: '작게' },
                    { id: 'medium', label: '보통' },
                    { id: 'large', label: '크게' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTransFontSize(opt.id as DisplaySettings['transFontSize'])}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        transFontSize === opt.id
                          ? 'border-rose-500 bg-rose-500 text-white shadow-md'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Gap */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">원문-번역 가사 사이 간격</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'small', label: '좁게 (Compact)' },
                    { id: 'medium', label: '보통 (Default)' },
                    { id: 'large', label: '넓게 (Spacious)' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLineGap(opt.id as DisplaySettings['lineGap'])}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        lineGap === opt.id
                          ? 'border-rose-500 bg-rose-500 text-white shadow-md'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Sync by Duration Difference */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-800">곡 길이 차이 자동 싱크 보정</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    음악과 가사 길이가 1.5초 이상 다를 때 추천 싱크를 자동 적용합니다.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSyncByDuration}
                    onChange={(e) => setAutoSyncByDuration(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-bold text-gray-800">
                  수동 AI 모델 JSON 정의
                </label>
                <button
                  type="button"
                  onClick={handleInsertTemplate}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold underline"
                >
                  샘플 템플릿 입력
                </button>
              </div>

              <p className="text-xs text-gray-500">
                특수 로컬 AI 백엔드나 수동 엔드포인트 모델 목록을 JSON 형식으로 등록할 수 있습니다.
              </p>

              <textarea
                value={customModelsJson}
                onChange={(e) => {
                  setCustomModelsJson(e.target.value)
                  setJsonError('')
                }}
                rows={8}
                placeholder={`[\n  {\n    "id": "my-custom-model",\n    "name": "Custom Model",\n    "provider": "lmstudio"\n  }\n]`}
                className="w-full font-mono text-xs p-3 bg-gray-900 text-green-400 rounded-2xl border border-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
              />

              {jsonError ? (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-semibold flex items-center space-x-2 border border-red-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{jsonError}</span>
                </div>
              ) : (
                <div className="p-2.5 bg-green-50 text-green-700 rounded-xl text-xs font-medium flex items-center space-x-2 border border-green-100">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>유효한 JSON 구문입니다.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 text-sm font-semibold transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold shadow-md shadow-rose-200 transition-all hover:scale-[1.02]"
          >
            설정 저장
          </button>
        </div>
      </div>
    </div>
  )
}
