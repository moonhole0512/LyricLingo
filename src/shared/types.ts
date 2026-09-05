export interface VocabularyExample {
  original: string
  reading: string
  translation: string
}

export interface VocabularyAnalysis {
  word: string
  reading: string
  lemma: string
  partOfSpeech: string
  literalMeaning: string
  contextualMeaning: string
  naturalTranslation: string
  usageNote: string
  examples: VocabularyExample[]
  difficulty: string
}

export interface VocabularyInput extends VocabularyAnalysis {
  context: string
  title?: string
  artist?: string
  lyricsTimeMs?: number
  userNote?: string
}

export interface VocabularyRecord extends VocabularyInput {
  id: number
  interval_days: number
  ease_factor: number
  repetitions: number
  next_review_date: string
  last_reviewed_at?: string | null
  status: string
  created_at: string
  updated_at?: string
}

export interface VocabularyStats {
  total: number
  due: number
  new: number
  learned: number
}

export type YomiganaScript = 'hiragana' | 'katakana';
export type TargetLanguage = 'Korean' | 'English' | 'Japanese';

export interface DisplaySettings {
  furiganaScript: YomiganaScript;
  mainFontSize: 'small' | 'medium' | 'large' | 'xlarge';
  transFontSize: 'small' | 'medium' | 'large';
  lineGap: 'small' | 'medium' | 'large';
  targetLanguage: TargetLanguage;
  customModelsJson: string;
  autoSyncByDuration?: boolean;
}

export type AIProvider = 'auto' | 'freetoken' | 'lmstudio'
export type ActiveAIProvider = 'freetoken' | 'lmstudio' | 'none'

export interface AIProviderDetail {
  connected: boolean
  models: string[]
  url: string
}

export interface TranslationProgressData {
  chunk: string;
  elapsedSeconds: string;
  tps: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens: number;
}

export interface TranslationModelInfo {
  model: string;
  provider: string;
  baseUrl: string;
  elapsedMs: number;
  elapsedSeconds: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens: number;
  tps: string;
  targetLanguage: TargetLanguage;
  timestamp: string;
}

export interface AIStatus {
  connected: boolean
  selectedProvider: AIProvider
  activeProvider: ActiveAIProvider
  models: string[]
  providers: {
    lmstudio: AIProviderDetail
    freetoken: AIProviderDetail
  }
}

