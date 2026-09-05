import { BrowserWindow, ipcMain } from 'electron';
import OpenAI from 'openai';
import type { VocabularyAnalysis, VocabularyExample, AIProvider, ActiveAIProvider, AIProviderDetail, AIStatus, TranslationProgressData, TranslationModelInfo } from '../shared/types';
import { alignLrc, mergeReTranslatedLines, isUntranslated, LrcLine } from './utils/lrcAligner';

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234/v1';
const FREE_TOKEN_URL = process.env.FREE_TOKEN_URL || 'http://127.0.0.1:1919/v1';

let selectedProviderSetting: AIProvider = 'auto';

let lmStudioState: AIProviderDetail = {
  connected: false,
  models: [],
  url: LM_STUDIO_URL
};

let freeTokenState: AIProviderDetail = {
  connected: false,
  models: [],
  url: FREE_TOKEN_URL
};

let translationAbortController: AbortController | null = null;

async function fetchProviderModels(baseUrl: string): Promise<{ connected: boolean; models: string[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${baseUrl}/models`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data.map((m: any) => m.id) : [];
      return { connected: true, models };
    }
    return { connected: false, models: [] };
  } catch {
    clearTimeout(timeoutId);
    return { connected: false, models: [] };
  }
}

function getAIStatusInternal(): AIStatus {
  let activeProvider: ActiveAIProvider = 'none';

  if (selectedProviderSetting === 'freetoken') {
    activeProvider = freeTokenState.connected ? 'freetoken' : 'none';
  } else if (selectedProviderSetting === 'lmstudio') {
    activeProvider = lmStudioState.connected ? 'lmstudio' : 'none';
  } else {
    // Auto-detection mode
    if (freeTokenState.connected && !lmStudioState.connected) {
      activeProvider = 'freetoken';
    } else if (lmStudioState.connected && !freeTokenState.connected) {
      activeProvider = 'lmstudio';
    } else if (freeTokenState.connected && lmStudioState.connected) {
      activeProvider = 'freetoken'; // Prioritize FreeToken when both are active
    } else {
      activeProvider = 'none';
    }
  }

  const isConnected = activeProvider !== 'none';
  let models: string[] = [];

  if (selectedProviderSetting === 'freetoken') {
    models = freeTokenState.models;
  } else if (selectedProviderSetting === 'lmstudio') {
    models = lmStudioState.models;
  } else {
    // In auto mode, collect available models
    if (activeProvider === 'freetoken') {
      models = freeTokenState.models;
    } else if (activeProvider === 'lmstudio') {
      models = lmStudioState.models;
    } else {
      models = Array.from(new Set([...freeTokenState.models, ...lmStudioState.models]));
    }
  }

  return {
    connected: isConnected,
    selectedProvider: selectedProviderSetting,
    activeProvider,
    models,
    providers: {
      lmstudio: { ...lmStudioState },
      freetoken: { ...freeTokenState }
    }
  };
}

export function startAIPolling() {
  const poll = async (): Promise<AIStatus> => {
    const [lmResult, ftResult] = await Promise.all([
      fetchProviderModels(LM_STUDIO_URL),
      fetchProviderModels(FREE_TOKEN_URL)
    ]);

    lmStudioState.connected = lmResult.connected;
    lmStudioState.models = lmResult.models;

    freeTokenState.connected = ftResult.connected;
    freeTokenState.models = ftResult.models;

    const status = getAIStatusInternal();

    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      wins[0].webContents.send('ai-status', status);
    }
    return status;
  };

  poll(); // 즉시 1회 실행
  setInterval(poll, 30000); // 30초 주기 폴링

  ipcMain.handle('get-ai-status', async () => {
    return getAIStatusInternal();
  });
  
  ipcMain.handle('refresh-ai-models', async () => {
    return await poll();
  });

  ipcMain.handle('set-ai-provider', async (_, provider: AIProvider) => {
    if (['auto', 'freetoken', 'lmstudio'].includes(provider)) {
      selectedProviderSetting = provider;
    }
    return await poll();
  });
}

function getResolvedTarget(requestedModel?: string): {
  baseUrl: string;
  model: string;
  provider: ActiveAIProvider;
  apiKey: string;
} {
  const status = getAIStatusInternal();
  let provider: ActiveAIProvider = status.activeProvider;

  let cleanModelName = requestedModel || '';
  if (requestedModel) {
    if (requestedModel.startsWith('freetoken:')) {
      cleanModelName = requestedModel.replace(/^freetoken:/, '');
      if (freeTokenState.connected) provider = 'freetoken';
    } else if (requestedModel.startsWith('lmstudio:')) {
      cleanModelName = requestedModel.replace(/^lmstudio:/, '');
      if (lmStudioState.connected) provider = 'lmstudio';
    } else {
      if (freeTokenState.models.includes(requestedModel) && freeTokenState.connected) {
        provider = 'freetoken';
      } else if (lmStudioState.models.includes(requestedModel) && lmStudioState.connected) {
        provider = 'lmstudio';
      }
    }
  }

  if (provider === 'freetoken') {
    return {
      baseUrl: FREE_TOKEN_URL,
      model: cleanModelName || freeTokenState.models[0] || 'local-model',
      provider: 'freetoken',
      apiKey: 'freetoken'
    };
  } else if (provider === 'lmstudio') {
    return {
      baseUrl: LM_STUDIO_URL,
      model: cleanModelName || lmStudioState.models[0] || 'local-model',
      provider: 'lmstudio',
      apiKey: 'lm-studio'
    };
  }

  return {
    baseUrl: selectedProviderSetting === 'freetoken' ? FREE_TOKEN_URL : LM_STUDIO_URL,
    model: cleanModelName || 'local-model',
    provider: 'none',
    apiKey: 'local-key'
  };
}

function createOpenAIClient(target: { baseUrl: string; apiKey: string }): OpenAI {
  return new OpenAI({
    baseURL: target.baseUrl,
    apiKey: target.apiKey
  });
}

function extractMessageContent(choice: any): string {
  const msg = choice?.message;
  if (!msg) return '';
  if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
    return msg.content;
  }
  if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim().length > 0) {
    return msg.reasoning_content;
  }
  return msg.content || '';
}

function extractLrcFromText(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const lrcLines = lines.map(l => l.trim()).filter(l => /^\[\d{2}:\d{2}(?:\.\d{1,3})?\]/.test(l));
  return lrcLines.join('\n');
}

export async function translateMissingLines(missingLines: LrcLine[], model: string, parentSignal?: AbortSignal): Promise<Record<number, string>> {
  if (missingLines.length === 0) return {};

  const target = getResolvedTarget(model);
  const openai = createOpenAIClient(target);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  const onParentAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener('abort', onParentAbort);
  }

  try {
    const linesPrompt = missingLines.map(l => `라인 ${l.index}: ${l.text}`).join('\n');
    const response = await openai.chat.completions.create({
      model: target.model,
      messages: [
        {
          role: 'system',
          content: "너는 다국어 음악 번역가야. 전달받은 가사 라인을 자연스러운 한국어로 번역해 줘. 타임스탬프나 설명 없이 오직 '라인 X: [한국어번역]' 형식으로만 각 줄을 출력해."
        },
        {
          role: 'user',
          content: linesPrompt
        }
      ],
      temperature: 0.3,
    }, { signal: controller.signal });

    const output = extractMessageContent(response.choices[0]);
    const result: Record<number, string> = {};

    const lineMatches = output.split('\n');
    for (const line of lineMatches) {
      const match = line.match(/라인\s*(\d+)[:\s]+(.+)/);
      if (match) {
        const idx = parseInt(match[1], 10);
        result[idx] = match[2].trim();
      }
    }

    // Fallback: If line number regex parsing fails, map by line order
    if (Object.keys(result).length === 0) {
      const cleanLines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      missingLines.forEach((missing, i) => {
        if (cleanLines[i]) {
          result[missing.index] = cleanLines[i].replace(/^라인\s*\d+[:\s]*/, '').trim();
        }
      });
    }

    return result;
  } finally {
    clearTimeout(timeoutId);
    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
    controller.abort(); // Immediately destroy HTTP socket on server side to stop GPU inference
  }
}

export async function translateLyrics(
  originalLyrics: string,
  model: string = '',
  onProgress?: (progressData: TranslationProgressData) => void,
  targetLanguage: string = 'Korean'
): Promise<{ translated: string; model: string; modelInfo: TranslationModelInfo }> {
  const startTime = Date.now();
  const isE2E = process.env.NODE_ENV === 'test' || require('fs').existsSync(require('path').join(process.cwd(), '.e2e'));
  const target = getResolvedTarget(model);

  if (target.provider === 'none' && !isE2E) {
    throw new Error('FreeToken 또는 LM Studio가 연결되어 있지 않습니다.');
  }

  if (isE2E) {
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    const mockTranslated = originalLyrics.replace(/Hello|Test/g, '안녕');
    const mockInfo: TranslationModelInfo = {
      model: target.model || model || 'test-model',
      provider: target.provider || 'mock',
      baseUrl: target.baseUrl || '',
      elapsedMs: 250,
      elapsedSeconds,
      promptTokens: 45,
      completionTokens: 20,
      totalTokens: 65,
      tps: '35.0',
      targetLanguage: targetLanguage as any,
      timestamp: new Date().toISOString()
    };
    if (onProgress) {
      onProgress({
        chunk: mockTranslated,
        elapsedSeconds,
        tps: '35.0',
        promptTokens: 45,
        completionTokens: 20,
        totalTokens: 65
      });
    }
    return { translated: mockTranslated, model: target.model || model || 'test-model', modelInfo: mockInfo };
  }

  if (translationAbortController) {
    translationAbortController.abort();
  }
  translationAbortController = new AbortController();
  const signal = translationAbortController.signal;

  const openai = createOpenAIClient(target);

  const systemPrompts: Record<string, string> = {
    Korean: "너는 다국어 음악 번역가야. 입력된 외국어(일본어/영어 등) 가사(LRC)를 반드시 자연스러운 한국어로 1:1 번역해 줘. 규칙: 원문 가사를 그대로 복사하거나 출력하지 마라. 모든 타임스탬프[mm:ss.xx]를 1:1로 유지하며 생각(Thinking) 과정 없이 오직 한국어로 번역된 LRC 텍스트만 출력해.",
    English: "You are a professional music translator. Translate the input foreign lyrics (LRC) into natural English line by line. Maintain all timestamp tags [mm:ss.xx] 1:1. Do not copy the original foreign text.",
    Japanese: "あなたはプロの音楽翻訳家です。入力された歌詞(LRC)を自然な日本語に1:1で翻訳してください。思考過程や原文のコピーを出力せず、すべてのタイムスタンプ[mm:ss.xx]を1:1で維持した日本語LRCテキストのみを出力してください。"
  };
  const systemPrompt = systemPrompts[targetLanguage] || systemPrompts['Korean'];

  let stream: any;
  try {
    stream = await openai.chat.completions.create({
      model: target.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: originalLyrics }
      ],
      temperature: 0.3,
      max_tokens: target.provider === 'lmstudio' ? -1 : 4096,
      stream: !isE2E,
      stream_options: { include_usage: true }
    }, { timeout: 300000, signal });
  } catch (createErr: any) {
    if (String(createErr).includes('stream_options') || String(createErr).includes('unrecognized') || String(createErr).includes('extra_forbidden')) {
      stream = await openai.chat.completions.create({
        model: target.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: originalLyrics }
        ],
        temperature: 0.3,
        max_tokens: target.provider === 'lmstudio' ? -1 : 4096,
        stream: !isE2E
      }, { timeout: 300000, signal });
    } else {
      throw createErr;
    }
  }

  let fullText = '';
  let reasoningText = '';
  let serverPromptTokens: number | null = null;
  let serverCompletionTokens: number | null = null;
  let serverTotalTokens: number | null = null;

  const estimatedPromptTokens = Math.max(1, Math.round((systemPrompt.length + originalLyrics.length) / 2.5));

  const sendProgress = (chunkStr: string, usageObj?: any) => {
    if (!onProgress) return;
    const elapsedMs = Date.now() - startTime;
    const elapsedSecNum = Math.max(0.1, elapsedMs / 1000);
    const elapsedSeconds = elapsedSecNum.toFixed(1);

    if (usageObj) {
      if (typeof usageObj.prompt_tokens === 'number') serverPromptTokens = usageObj.prompt_tokens;
      if (typeof usageObj.completion_tokens === 'number') serverCompletionTokens = usageObj.completion_tokens;
      if (typeof usageObj.total_tokens === 'number') serverTotalTokens = usageObj.total_tokens;
    }

    const generatedChars = fullText.length + reasoningText.length;
    const estimatedCompletionTokens = Math.max(1, Math.round(generatedChars / 2.2));

    const promptTokens = serverPromptTokens ?? estimatedPromptTokens;
    const completionTokens = serverCompletionTokens ?? estimatedCompletionTokens;
    const totalTokens = serverTotalTokens ?? (promptTokens + completionTokens);
    const tps = (completionTokens / elapsedSecNum).toFixed(1);

    onProgress({
      chunk: chunkStr,
      elapsedSeconds,
      tps,
      promptTokens,
      completionTokens,
      totalTokens
    });
  };

  sendProgress('');

  if (isE2E) {
    const content = extractMessageContent((stream as any).choices?.[0]);
    fullText += content;
    if (content) sendProgress(content);
  } else {
    for await (const chunk of stream as any) {
      if (signal.aborted) {
        throw new Error('ABORTED');
      }
      const usage = chunk?.usage || (chunk as any)?.metrics || (chunk as any)?.choices?.[0]?.usage;
      const delta = chunk?.choices?.[0]?.delta as any;
      const content = delta?.content || '';
      const reasoning = delta?.reasoning_content || '';
      
      if (reasoning) {
        reasoningText += reasoning;
        sendProgress(reasoning, usage);
      } else if (content) {
        fullText += content;
        sendProgress(content, usage);
      } else if (usage) {
        sendProgress('', usage);
      }
    }
  }

  console.log(`[AI Translation Stream Finished] Provider: ${target.provider}, Model: ${target.model}, Raw Output Length: ${fullText.length}, Reasoning Length: ${reasoningText.length}`);

  // Fallback: If reasoning MoE model output LRC lines inside reasoning_content instead of delta.content
  const totalOriginalLines = originalLyrics.split('\n').filter(l => l.trim()).length;
  let alignment = alignLrc(originalLyrics, fullText);

  if ((alignment.missingLines.length > totalOriginalLines * 0.5 || isUntranslated(originalLyrics, fullText)) && reasoningText) {
    const extractedFromReasoning = extractLrcFromText(reasoningText);
    if (extractedFromReasoning && !isUntranslated(originalLyrics, extractedFromReasoning)) {
      const reasoningAlignment = alignLrc(originalLyrics, extractedFromReasoning);
      if (reasoningAlignment.missingLines.length < alignment.missingLines.length) {
        console.log(`[AI Alignment Fallback] Recovered ${extractedFromReasoning.split('\n').length} LRC lines from MoE reasoning_content output.`);
        fullText = extractedFromReasoning;
        alignment = reasoningAlignment;
      }
    }
  }

  let finalLrc = alignment.alignedLrc;

  if (alignment.missingLines.length > 0 && !isE2E) {
    console.log(`[AI Alignment] Detected ${alignment.missingLines.length} missing lines out of ${alignment.totalCount}. Performing targeted re-translation...`);
    try {
      const fixedMap = await translateMissingLines(alignment.missingLines, target.model, signal);
      finalLrc = mergeReTranslatedLines(originalLyrics, alignment.alignedLrc, fixedMap);
      console.log(`[AI Alignment] Targeted re-translation completed and merged.`);
    } catch (err) {
      console.error('[AI Alignment] Targeted re-translation failed, falling back to aligned LRC:', err);
    }
  }

  if (isUntranslated(originalLyrics, finalLrc) && !isE2E) {
    throw new Error('AI 모델이 가사를 번역하지 않고 원문을 복사했습니다. 재시도를 수행해 주세요.');
  }

  const elapsedMs = Date.now() - startTime;
  const elapsedSecNum = Math.max(0.1, elapsedMs / 1000);
  const promptTokens = serverPromptTokens ?? estimatedPromptTokens;
  const completionTokens = serverCompletionTokens ?? Math.max(1, Math.round((fullText.length + reasoningText.length) / 2.2));
  const totalTokens = serverTotalTokens ?? (promptTokens + completionTokens);
  const tps = (completionTokens / elapsedSecNum).toFixed(1);

  const modelInfo: TranslationModelInfo = {
    model: target.model,
    provider: target.provider,
    baseUrl: target.baseUrl,
    elapsedMs,
    elapsedSeconds: elapsedSecNum.toFixed(1),
    promptTokens,
    completionTokens,
    totalTokens,
    tps,
    targetLanguage: targetLanguage as any,
    timestamp: new Date().toISOString()
  };

  console.log(`[AI Translation Finished] Processed ${totalTokens} tokens (Prompt: ${promptTokens}, Completion: ${completionTokens}) in ${modelInfo.elapsedSeconds}s (${tps} t/s) at: ${modelInfo.timestamp}`);
  return { translated: finalLrc, model: target.model, modelInfo };
}

export async function getTutorExplanation(lyricContext: string, wordOrSentence: string, model: string = ''): Promise<string> {
  const isE2E = require('fs').existsSync(require('path').join(process.cwd(), '.e2e'));
  const target = getResolvedTarget(model);

  if (target.provider === 'none' && !isE2E) {
    throw new Error('FreeToken 또는 LM Studio가 연결되어 있지 않습니다.');
  }

  const openai = createOpenAIClient(target);
  const response = await openai.chat.completions.create({
    model: target.model,
    messages: [
      {
        role: 'system',
        content: "너는 친절한 다국어 어학 튜터야. 사용자가 가사 문맥과 궁금해하는 단어/문장을 주면 1. 현재 문맥에서의 실제 의미 2. 문법적/문화적 배경 설명 3. 쉬운 일상 예문 1개를 반드시 포함해서 설명해 줘. 따뜻하고 격려하는 존댓말로 작성해."
      },
      {
        role: 'user',
        content: `문맥: "${lyricContext}"\n궁금한 단어/문장: "${wordOrSentence}"`
      }
    ],
    temperature: 0.7,
  }, { timeout: 60000 });

  return extractMessageContent(response.choices[0]);
}

function fallbackVocabularyAnalysis(word: string, raw: string): VocabularyAnalysis {
  return {
    word,
    reading: '',
    lemma: word,
    partOfSpeech: '',
    literalMeaning: raw || '뜻을 확인해 주세요.',
    contextualMeaning: raw || '문맥상 의미를 확인해 주세요.',
    naturalTranslation: '',
    usageNote: raw || 'AI가 구조화된 설명을 반환하지 않아 직접 수정할 수 있습니다.',
    examples: [],
    difficulty: 'unknown'
  };
}

function parseVocabularyAnalysis(raw: string, word: string): VocabularyAnalysis {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(trimmed);
    const examples: VocabularyExample[] = Array.isArray(parsed.examples)
      ? parsed.examples.slice(0, 3).map((example: any) => ({
        original: String(example.original || example.japanese || ''),
        reading: String(example.reading || example.yomigana || ''),
        translation: String(example.translation || example.korean || '')
      })).filter((example: VocabularyExample) => example.original || example.translation)
      : [];

    return {
      word: String(parsed.word || word),
      reading: String(parsed.reading || parsed.yomigana || ''),
      lemma: String(parsed.lemma || parsed.baseForm || parsed.word || word),
      partOfSpeech: String(parsed.partOfSpeech || parsed.pos || ''),
      literalMeaning: String(parsed.literalMeaning || parsed.literal || parsed.meaning || ''),
      contextualMeaning: String(parsed.contextualMeaning || parsed.contextMeaning || parsed.meaning || ''),
      naturalTranslation: String(parsed.naturalTranslation || parsed.translation || ''),
      usageNote: String(parsed.usageNote || parsed.nuance || parsed.explanation || ''),
      examples,
      difficulty: String(parsed.difficulty || 'unknown')
    };
  } catch {
    return fallbackVocabularyAnalysis(word, raw);
  }
}

export async function analyzeVocabularyWord(
  lyricContext: string,
  wordOrSentence: string,
  model: string = '',
  surroundingContext = ''
): Promise<VocabularyAnalysis> {
  const isE2E = require('fs').existsSync(require('path').join(process.cwd(), '.e2e'));
  if (isE2E) {
    return {
      word: wordOrSentence,
      reading: '',
      lemma: wordOrSentence,
      partOfSpeech: '',
      literalMeaning: '모의 뜻',
      contextualMeaning: '가사 문맥에서의 모의 뜻',
      naturalTranslation: '모의 번역',
      usageNote: '모의 사용 설명',
      examples: [{ original: wordOrSentence, reading: '', translation: '모의 예문 번역' }],
      difficulty: 'beginner'
    };
  }

  const target = getResolvedTarget(model);
  if (target.provider === 'none') {
    throw new Error('FreeToken 또는 LM Studio가 연결되어 있지 않습니다.');
  }

  const openai = createOpenAIClient(target);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `너는 일본어 가사 학습 튜터야. 반드시 JSON 객체만 반환해.
필드: word, reading, lemma, partOfSpeech, literalMeaning, contextualMeaning, naturalTranslation, usageNote, examples, difficulty.
examples는 original, reading, translation을 가진 배열이며 최대 3개다.
한자 독음은 문장 전체 문맥에 맞춰 추론하고, 모르면 빈 문자열로 둬. 설명은 한국어로 작성해.`
    },
    {
      role: 'user',
      content: `가사 문장: "${lyricContext}"
앞뒤 문맥: "${surroundingContext}"
분석할 단어 또는 표현: "${wordOrSentence}"`
    }
  ];

  let response: any;
  try {
    response = await openai.chat.completions.create({
      model: target.model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    }, { timeout: 60000 });
  } catch (err: any) {
    if (err?.status === 400 || String(err).includes('response_format')) {
      console.warn('[AI Vocabulary] Model backend does not support response_format json_object, falling back to standard prompt format:', err?.message || err);
      response = await openai.chat.completions.create({
        model: target.model,
        messages,
        temperature: 0.2,
      }, { timeout: 60000 });
    } else {
      throw err;
    }
  }

  const rawText = extractMessageContent(response.choices[0]);
  return parseVocabularyAnalysis(rawText, wordOrSentence);
}
