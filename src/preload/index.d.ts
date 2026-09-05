import { ElectronAPI } from '@electron-toolkit/preload'
import type { VocabularyInput, VocabularyRecord, VocabularyAnalysis, VocabularyStats } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      addVocabulary: (data: VocabularyInput) => Promise<{ id: number } | VocabularyRecord>
      analyzeVocabulary: (data: { word: string, context: string, surroundingContext?: string, title?: string, artist?: string, lyricsTimeMs?: number, model?: string }) => Promise<VocabularyAnalysis>
      analyzeAndSaveVocabulary: (data: { word: string, context: string, surroundingContext?: string, title?: string, artist?: string, lyricsTimeMs?: number, model?: string }) => Promise<VocabularyRecord>
      getVocabulary: (options?: { filter?: 'all' | 'due' | 'new', query?: string }) => Promise<VocabularyRecord[]>
      getVocabularyStats: () => Promise<VocabularyStats>
      reviewVocabulary: (id: number, score: number) => Promise<VocabularyRecord>
      updateVocabulary: (id: number, data: Partial<VocabularyInput>) => Promise<VocabularyRecord>
      clearVocabulary: () => Promise<number>
      deleteVocabularyItem: (id: number) => Promise<number>
      deleteVocabulary: (id: number) => Promise<number>
      getLyricsCache: (data: { title: string, artist: string }) => Promise<{ lrc: string | null, translatedLrc: string | null, cover: string | null, translatedModel?: string | null, translatedModelInfo?: any | null } | null>
      mediaControl: (action: 'playpause' | 'next' | 'prev') => Promise<{ ok: boolean, reason: string }>
      [key: string]: any
    }
  }
}
