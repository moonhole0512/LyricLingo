import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { ipcRenderer } from 'electron'
import type { VocabularyInput } from '../shared/types'

// Custom APIs for renderer
const api = {
  addVocabulary: (data: VocabularyInput) => ipcRenderer.invoke('add-vocabulary', data),
  analyzeVocabulary: (data: { word: string, context: string, surroundingContext?: string, title?: string, artist?: string, lyricsTimeMs?: number, model?: string }) => ipcRenderer.invoke('analyze-vocabulary', data),
  analyzeAndSaveVocabulary: (data: { word: string, context: string, surroundingContext?: string, title?: string, artist?: string, lyricsTimeMs?: number, model?: string }) => ipcRenderer.invoke('analyze-and-save-vocabulary', data),
  getVocabulary: (options?: { filter?: 'all' | 'due' | 'new', query?: string }) => ipcRenderer.invoke('get-vocabulary', options),
  getVocabularyStats: () => ipcRenderer.invoke('get-vocabulary-stats'),
  reviewVocabulary: (id: number, score: number) => ipcRenderer.invoke('review-vocabulary', { id, score }),
  updateVocabulary: (id: number, data: Partial<VocabularyInput>) => ipcRenderer.invoke('update-vocabulary', { id, data }),
  clearVocabulary: () => ipcRenderer.invoke('clear-vocabulary'),
  deleteVocabularyItem: (id: number) => ipcRenderer.invoke('delete-vocabulary-item', id),
  deleteVocabulary: (id: number) => ipcRenderer.invoke('delete-vocabulary-item', id),
  onMusicUpdate: (callback: (data: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: any) => callback(value)
    ipcRenderer.on('music-update', listener)
    return () => ipcRenderer.removeListener('music-update', listener)
  },
  onMusicClosed: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('music-closed', listener)
    return () => ipcRenderer.removeListener('music-closed', listener)
  },
  onAIStatus: (callback: (data: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: any) => callback(value)
    ipcRenderer.on('ai-status', listener)
    return () => ipcRenderer.removeListener('ai-status', listener)
  },
  getAIStatus: () => ipcRenderer.invoke('get-ai-status'),
  getLyricsCache: (data: { title: string, artist: string, originalLyrics?: string }) => ipcRenderer.invoke('get-lyrics-cache', data),
  fetchLrcManual: (data: { title: string, artist?: string, duration?: number }) => ipcRenderer.invoke('fetch-lrc-manual', data),
  translateLyrics: (data: { originalLyrics: string, model: string, title: string, artist: string }) => ipcRenderer.invoke('translate-lyrics', data),
  tutorExplanation: (data: { lyricContext: string, wordOrSentence: string, model: string }) => ipcRenderer.invoke('tutor-explanation', data),
  mockPlayEvent: (data: any) => ipcRenderer.send('mock-play-event', data),
  mockMusicClosed: () => ipcRenderer.send('mock-music-closed'),
  openAppleMusic: () => ipcRenderer.send('open-apple-music'),
  searchAppleMusic: (term: string) => ipcRenderer.send('search-apple-music', term),
  getLyricsHistory: () => ipcRenderer.invoke('get-lyrics-history'),
  deleteLyricsHistory: (id: number) => ipcRenderer.invoke('delete-lyrics-history', id),
  clearLyricsHistory: () => ipcRenderer.invoke('clear-lyrics-history'),
  refreshAiModels: () => ipcRenderer.invoke('refresh-ai-models'),
  setAIProvider: (provider: string) => ipcRenderer.invoke('set-ai-provider', provider),
  onTranslationProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('translate-progress', (_event, data) => callback(data));
  },
  offTranslationProgress: () => {
    ipcRenderer.removeAllListeners('translate-progress');
  },
  mediaControl: (action: 'playpause' | 'next' | 'prev') => ipcRenderer.invoke('media-control', action),
  tokenizeJapanese: (payload: string | { text: string; script?: 'hiragana' | 'katakana' }) => ipcRenderer.invoke('tokenize-japanese', payload),
  searchLrcVersions: (data: { title: string, artist?: string, duration?: number }) => ipcRenderer.invoke('search-lrc-versions', data),
  updateOriginalLyrics: (data: { title: string, artist: string, newLyrics: string }) => ipcRenderer.invoke('update-original-lyrics', data)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
