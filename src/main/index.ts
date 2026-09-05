import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDb } from './database/db'
import { addVocabulary, clearVocabulary, deleteVocabulary, getVocabulary, getVocabularyStats, reviewVocabulary, updateVocabulary } from './database/vocabulary'
import { analyzeVocabularyWord, startAIPolling, translateLyrics, getTutorExplanation } from './ai';
import { isUntranslated } from './utils/lrcAligner';
import { cleanLyricText } from './utils/lyricsParser';
import { normalizeMediaData, mediaKey } from './utils/mediaIdentity'
import { MediaControlWorker, type MediaAction } from './utils/mediaControl'
import { searchLrcCandidates } from './utils/lrcSearcher'
import { postProcessJapaneseTokens } from './utils/japaneseLyricsDictionary'
import type { VocabularyInput } from '../shared/types'

const Kuroshiro = require('kuroshiro').default;
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');

let kuroshiroInit: Promise<any> | null = null;
let kuroshiro: any = null;
let kuromojiAnalyzer: any = null;

function getKuroshiro() {
  if (!kuroshiroInit) {
    kuroshiro = new Kuroshiro();
    kuromojiAnalyzer = new KuromojiAnalyzer();
    kuroshiroInit = kuroshiro.init(kuromojiAnalyzer);
  }
  return kuroshiroInit;
}

async function getLyricsFromCache(title: string, artist: string): Promise<any> {
  const db = getDb();
  return new Promise((resolve) => {
    if (!title) return resolve(null);
    const cleanTitle = title.trim();
    const cleanArtist = (artist || '').trim();

    const processRow = (row: any) => {
      if (!row || !row.original_lyrics) return null;
      if (row.original_lyrics.includes('\uFFFD')) {
        console.log(`[Cache Invalidation] Discarding corrupt UTF-8 original lyrics for "${title}".`);
        return null;
      }
      if (row.translated_lyrics) {
        row.translated_lyrics = row.translated_lyrics
          .split('\n')
          .map((line: string) => {
            const timeMatch = line.match(/^\[\d{2}:\d{2}(?:\.\d{1,3})?\]/);
            if (!timeMatch) return cleanLyricText(line);
            const text = line.substring(timeMatch[0].length).trim();
            return `${timeMatch[0]} ${cleanLyricText(text)}`;
          })
          .join('\n');
      }
      if (row.translated_lyrics && isUntranslated(row.original_lyrics, row.translated_lyrics)) {
        console.log(`[Cache Invalidation] Ignoring corrupt/untranslated cached lyrics for "${title}".`);
        return { ...row, translated_lyrics: null };
      }
      console.log(`\x1b[32m[Cache Hit]\x1b[0m Successfully retrieved cached lyrics for "${title}" (hasTranslation: ${Boolean(row.translated_lyrics)})`);
      return row;
    };

    db.get(
      `SELECT original_lyrics, translated_lyrics, cover, translated_model, translated_model_info FROM lyrics_cache 
       WHERE song_title = ? COLLATE NOCASE 
       AND (artist = ? COLLATE NOCASE OR artist IS NULL OR artist = '' OR ? = '')
       ORDER BY (CASE WHEN artist = ? COLLATE NOCASE THEN 0 ELSE 1 END), id DESC LIMIT 1`,
      [cleanTitle, cleanArtist, cleanArtist, cleanArtist],
      (_err, row: any) => {
        const processed = processRow(row);
        if (processed) {
          resolve(processed);
        } else if (!cleanArtist) {
          db.get(
            `SELECT original_lyrics, translated_lyrics, cover, translated_model, translated_model_info FROM lyrics_cache 
             WHERE song_title = ? COLLATE NOCASE 
             ORDER BY id DESC LIMIT 1`,
            [cleanTitle],
            (_err2, row2: any) => {
              resolve(processRow(row2));
            }
          );
        } else {
          resolve(null);
        }
      }
    );
  });
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'LyricLingo',
    icon,
    width: 1100,
    height: 720,
    minWidth: 980,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize Database
  getDb();

  // 1. Apple Music media identity and control handling.
  const mediaControlWorker = new MediaControlWorker()
  void mediaControlWorker.warmup().catch(() => undefined)
  const sendMusicClosed = () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length) wins[0].webContents.send('music-closed')
  }

  let cachedLrc: string | null = null;
  let cachedTranslated: string | null = null;
  let cachedModel: string | null = null;
  let cachedModelInfo: any = null;
  let lastMediaData: any = null;

  function broadcastMusicUpdate(lrc: string | null, translatedLrc: string | null, translatedModel: string | null = null, translatedModelInfo: any = null) {
    cachedLrc = lrc;
    cachedTranslated = translatedLrc;
    cachedModel = translatedModel;
    cachedModelInfo = translatedModelInfo;
    const currentWins = BrowserWindow.getAllWindows();
    if (currentWins.length && lastMediaData) {
      currentWins[0].webContents.send('music-update', {
        ...lastMediaData,
        lrc: cachedLrc,
        translatedLrc: cachedTranslated,
        translatedModel: cachedModel,
        translatedModelInfo: cachedModelInfo,
        isLoading: false,
        timestamp: Date.now()
      });
    }
  }

  function registerMediaListener(): void {
    try {
      const { Media } = require('medialink')
      const media = new Media(process.platform)

      let activeKey = ''
      let activeGeneration = 0
      let lastPosition = -1
      let lastState = ''
      let isQuitting = false
      let restartTimer: NodeJS.Timeout | null = null
      let isStarting = false

      media.on('error', (err: unknown) => {
        const msg = String(err || '').trim()
        if (msg.includes('NullReferenceException') || msg.includes('Unhandled exception')) {
          console.warn('[MediaLink] Native Windows SMTC session glitch detected (NullReferenceException). Auto-recovery supervisor active.')
        } else {
          console.error('Non-fatal medialink error caught:', err)
        }
      })

      media.on('update', (rawMediaData: any) => {
        const mediaData = normalizeMediaData(rawMediaData)
        if (!mediaData.isAppleMusic) {
          return
        }

        if (!mediaData.title) {
          activeKey = ''
          activeGeneration += 1
          cachedLrc = null
          cachedTranslated = null
          cachedModel = null
          cachedModelInfo = null
          lastMediaData = null
          sendMusicClosed()
          return
        }

        lastMediaData = mediaData;
        const key = mediaKey(mediaData)
        const wins = BrowserWindow.getAllWindows()
        if (activeKey !== key) {
          activeKey = key
          activeGeneration += 1
          const generation = activeGeneration
          cachedLrc = null
          cachedTranslated = null
          cachedModel = null
          cachedModelInfo = null
          lastPosition = mediaData.position
          lastState = mediaData.state

          void getLyricsFromCache(mediaData.title, mediaData.artist).then((row) => {
            if (generation !== activeGeneration || activeKey !== key) return
            const modelInfo = row?.translated_model_info ? JSON.parse(row.translated_model_info) : null;
            broadcastMusicUpdate(row?.original_lyrics || null, row?.translated_lyrics || null, row?.translated_model || null, modelInfo);
          })
          return
        }

        const isPaused = mediaData.state === 'paused' || mediaData.state === 'stopped'
        const isSamePos = mediaData.position === lastPosition
        const isSameState = mediaData.state === lastState
        if (isPaused && isSamePos && isSameState) return
        lastPosition = mediaData.position
        lastState = mediaData.state

        if (wins.length) {
          wins[0].webContents.send('music-update', {
            ...mediaData,
            lrc: cachedLrc,
            translatedLrc: cachedTranslated,
            translatedModel: cachedModel,
            translatedModelInfo: cachedModelInfo,
            isLoading: false,
            timestamp: Date.now()
          })
        }
      })

      const fs = require('fs')
      const path = require('path')
      const isE2E = fs.existsSync(path.join(process.cwd(), '.e2e'))

      function startSupervisor() {
        if (isQuitting || isE2E || isStarting) return
        isStarting = true
        void media.start().then(() => {
          isStarting = false
          console.log('[MediaLink] Media listener started.')
          if (media.child) {
            media.child.on('exit', (code: any, signal: any) => {
              if (!isQuitting) {
                console.warn(`[MediaLink] Native helper exited (code: ${code}, signal: ${signal}). Auto-recovering in 1000ms...`)
                if (restartTimer) clearTimeout(restartTimer)
                restartTimer = setTimeout(() => {
                  startSupervisor()
                }, 1000)
              }
            })
          }
        }).catch((error: unknown) => {
          isStarting = false
          console.error('[MediaLink] Failed to start media listener, retrying in 2000ms:', error)
          if (!isQuitting) {
            if (restartTimer) clearTimeout(restartTimer)
            restartTimer = setTimeout(() => {
              startSupervisor()
            }, 2000)
          }
        })
      }

      if (!isE2E) {
        startSupervisor()
      } else {
        console.log('Running in E2E mode, skipping media listener start.')
      }

      app.on('before-quit', () => {
        isQuitting = true
        if (restartTimer) clearTimeout(restartTimer)
        try { media.stop() } catch {}
      })
    } catch (err) {
      console.log('medialink 로드 실패 (E2E 등 특정 환경):', err)
    }
  }

  registerMediaListener();

  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.handle('media-control', async (_, action: MediaAction) => {
    if (!['playpause', 'next', 'prev'].includes(action)) throw new Error('Invalid media action')
    return await mediaControlWorker.send(action)
  })
  app.on('before-quit', () => mediaControlWorker.dispose())

  ipcMain.handle('get-lyrics-cache', async (_, { title, artist }) => {
    const cached = await getLyricsFromCache(title, artist);
    if (cached) {
      return {
        lrc: cached.original_lyrics || null,
        translatedLrc: cached.translated_lyrics || null,
        cover: cached.cover || null,
        translatedModel: cached.translated_model || null,
        translatedModelInfo: cached.translated_model_info ? JSON.parse(cached.translated_model_info) : null
      };
    }
    return null;
  });

  // AI 튜터 및 번역 핸들러 등록
  startAIPolling();

  ipcMain.handle('tokenize-japanese', async (_, payload: string | { text: string; script?: 'hiragana' | 'katakana' }) => {
    const text = typeof payload === 'string' ? payload : payload.text;
    const script = typeof payload === 'string' ? 'hiragana' : (payload.script || 'hiragana');
    // If text does not contain any Japanese characters (hiragana, katakana, kanji), return empty so Intl.Segmenter handles it cleanly
    if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
      return [];
    }
    try {
      await getKuroshiro();
      const rawTokens = await kuromojiAnalyzer.parse(text);
      const tokens = postProcessJapaneseTokens(rawTokens);
      
      const escapeHtml = (value: string) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      const hasKanji = (value: string) => /[一-龯々]/.test(value);
      const katakanaToHiragana = (str: string) => str.replace(/[\u30A1-\u30F6]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60));
      const hiraganaToKatakana = (str: string) => str.replace(/[\u3041-\u3096]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60));

      const result = await Promise.all(tokens.map(async (t: any) => {
        const surface = String(t.surface_form || '');
        const reading = String(t.reading || '').replace(/\*/g, '');
        if (!surface || !hasKanji(surface) || !reading) {
          return { segment: surface, furiganaHtml: escapeHtml(surface) };
        }
        const converted = script === 'katakana' ? hiraganaToKatakana(reading) : katakanaToHiragana(reading);
        return {
          segment: surface,
          furiganaHtml: `<ruby>${escapeHtml(surface)}<rt>${escapeHtml(converted)}</rt></ruby>`
        };
      }));
      return result;
    } catch (e) {
      console.error('Japanese tokenization failed:', e);
      return [{ segment: text, furiganaHtml: text }];
    }
  });

  ipcMain.handle('fetch-lrc-manual', async (_, { title, artist, duration }: { title: string; artist?: string; duration?: number }) => {
    console.log(`\x1b[36m[IPC:fetch-lrc-manual]\x1b[0m Request for "${title}" by "${artist || 'Unknown'}" (duration: ${duration ?? 'N/A'})`);
    // E2E Mocking
    if (title === 'Test Song') {
      return '[00:00.00] 모의 원문 가사';
    }

    try {
      const candidates = await searchLrcCandidates(title, artist, duration);
      if (candidates.length > 0) {
        const bestMatch = candidates[0];
        let synced = bestMatch.syncedLyrics || '';
        if (bestMatch.duration && bestMatch.duration > 0 && !synced.includes('[length:')) {
          const mm = Math.floor(bestMatch.duration / 60);
          const ss = Math.floor(bestMatch.duration % 60);
          synced = `[length: ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}]\n` + synced;
        }
        console.log(`\x1b[32m[IPC:fetch-lrc-manual]\x1b[0m Selected best match: "${bestMatch.trackName}" by "${bestMatch.artistName}"`);
        return synced;
      }
      console.warn(`\x1b[33m[IPC:fetch-lrc-manual]\x1b[0m No synced lyrics found online for "${title}".`);
      return '[00:00.00] 온라인에서 가사를 찾을 수 없습니다. 수동으로 입력해주세요.';
    } catch (e) {
      console.error('\x1b[31m[IPC:fetch-lrc-manual Error]\x1b[0m', e);
      return '[00:00.00] 온라인에서 가사를 찾을 수 없습니다. 수동으로 입력해주세요.';
    }
  });

  ipcMain.handle('search-lrc-versions', async (_, { title, artist, duration }: { title: string; artist?: string; duration?: number }) => {
    return await searchLrcCandidates(title, artist, duration);
  });

  ipcMain.handle('update-original-lyrics', async (_, { title, artist, newLyrics }) => {
    return new Promise((resolve) => {
      const db = getDb();
      const artistCondition = artist ? 'AND artist = ? COLLATE NOCASE' : 'AND (artist IS NULL OR artist = "")';
      const checkParams = artist ? [title, artist] : [title];

      const finishUpdate = () => {
        broadcastMusicUpdate(newLyrics, null, null, null);
        resolve(true);
      };

      db.get(`SELECT id FROM lyrics_cache WHERE song_title = ? COLLATE NOCASE ${artistCondition}`, checkParams, (_, row: any) => {
        if (row) {
          db.run(
            'UPDATE lyrics_cache SET original_lyrics = ?, translated_lyrics = NULL, translated_model = NULL, translated_model_info = NULL WHERE id = ?',
            [newLyrics, row.id],
            finishUpdate
          );
        } else {
          db.run(
            'INSERT INTO lyrics_cache (song_title, artist, original_lyrics) VALUES (?, ?, ?)',
            [title, artist || '', newLyrics],
            finishUpdate
          );
        }
      });
    });
  });

  ipcMain.handle('translate-lyrics', async (event, { originalLyrics, model, title, artist, cover, targetLanguage }) => {
    try {
      // 1. Fetch translation with progress callback
      const res = await translateLyrics(
        originalLyrics,
        model,
        (progressData) => {
          event.sender.send('translate-progress', progressData);
        },
        targetLanguage || 'Korean'
      );

      const translated = typeof res === 'string' ? res : res.translated;
      const translatedModel = typeof res === 'object' ? res.model : model;
      const parsedModelInfo = typeof res === 'object' ? res.modelInfo : null;
      const translatedModelInfoStr = parsedModelInfo ? JSON.stringify(parsedModelInfo) : null;
      
      if (isUntranslated(originalLyrics, translated)) {
        throw new Error('AI 번역 결과가 원문과 동일하여 번역에 실패했습니다.');
      }
      
      // 2. Save to DB
      const db = getDb();
      const artistCondition = artist ? 'AND artist = ? COLLATE NOCASE' : 'AND (artist IS NULL OR artist = "")';
      const checkParams = artist ? [title, artist] : [title];

      db.get(`SELECT id FROM lyrics_cache WHERE song_title = ? COLLATE NOCASE ${artistCondition}`, checkParams, (_, row: any) => {
        if (row) {
          db.run(`
            UPDATE lyrics_cache 
            SET original_lyrics = ?, translated_lyrics = ?, cover = ?, translated_model = ?, translated_model_info = ? 
            WHERE id = ?
          `, [originalLyrics, translated, cover || null, translatedModel, translatedModelInfoStr, row.id]);
        } else {
          db.run(`
            INSERT INTO lyrics_cache (song_title, artist, original_lyrics, translated_lyrics, cover, translated_model, translated_model_info) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [title, artist, originalLyrics, translated, cover || null, translatedModel, translatedModelInfoStr]);
        }
      });

      broadcastMusicUpdate(originalLyrics, translated, translatedModel, parsedModelInfo);
      return { translated, model: translatedModel, modelInfo: parsedModelInfo };
    } catch (e: any) {
      console.error('Translation error:', e);
      throw e;
    }
  });

  ipcMain.handle('tutor-explanation', async (_, { lyricContext, wordOrSentence, model }) => {
    try {
      return await getTutorExplanation(lyricContext, wordOrSentence, model);
    } catch (e: any) {
      console.error(e);
      throw e;
    }
  });

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // E2E Mocking IPC Handlers
  ipcMain.on('mock-play-event', (_, data) => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length) wins[0].webContents.send('music-update', { source: 'applemusic', isAppleMusic: true, ...data });
  });

  ipcMain.on('mock-music-closed', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length) wins[0].webContents.send('music-closed');
  });

  ipcMain.handle('get-lyrics-history', async () => {
    const db = getDb();
    return new Promise((resolve, reject) => {
      db.all('SELECT id, song_title as title, artist, cover, original_lyrics as lrc, translated_lyrics as translatedLrc, translated_model as translatedModel, translated_model_info as translatedModelInfo, created_at FROM lyrics_cache ORDER BY created_at DESC', (err: any, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  });

  ipcMain.handle('delete-lyrics-history', async (_, id: number) => {
    const db = getDb();
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM lyrics_cache WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  });

  ipcMain.on('open-apple-music', () => {
    // Windows 11 Apple Music 앱의 AppUserModelId를 이용해 직접 실행
    require('child_process').exec('explorer.exe shell:AppsFolder\\AppleInc.AppleMusicWin_nzyj5cx40ttqa!App');
  });

  ipcMain.on('search-apple-music', async (_, term: string) => {
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1&country=KR`);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const trackUrl = data.results[0].trackViewUrl;
        // Windows에서는 Apple Music 앱이 https://music.apple.com 링크를 가로채서 실행(AppURIHandler)하므로 원본 링크를 엽니다.
        shell.openExternal(`${trackUrl}&app=music&play=1`);
      } else {
        shell.openExternal(`https://music.apple.com/search?term=${encodeURIComponent(term)}`);
      }
    } catch (error) {
      shell.openExternal(`https://music.apple.com/search?term=${encodeURIComponent(term)}`);
    }
  });

  ipcMain.on('mock-trigger-error', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length) wins[0].webContents.send('error-notification', 'Test Error Message');
  });

  // Vocabulary and spaced-repetition handlers
  ipcMain.handle('analyze-vocabulary', async (_, data: { word: string, context: string, surroundingContext?: string, model?: string }) => {
    return await analyzeVocabularyWord(data.context, data.word, data.model, data.surroundingContext || '')
  })

  ipcMain.handle('analyze-and-save-vocabulary', async (_, data: { word: string, context: string, surroundingContext?: string, title?: string, artist?: string, lyricsTimeMs?: number, model?: string }) => {
    const analysis = await analyzeVocabularyWord(data.context, data.word, data.model, data.surroundingContext || '')
    return await addVocabulary({
      ...analysis,
      context: data.context,
      title: data.title,
      artist: data.artist,
      lyricsTimeMs: data.lyricsTimeMs
    })
  })

  ipcMain.handle('add-vocabulary', async (_, wordData: VocabularyInput) => {
    // Backward-compatible conversion for old callers.
    const input: VocabularyInput = {
      word: wordData.word || (wordData as any).word_or_sentence || '알 수 없음',
      reading: wordData.reading || '',
      lemma: wordData.lemma || wordData.word || '',
      partOfSpeech: wordData.partOfSpeech || '',
      literalMeaning: wordData.literalMeaning || (wordData as any).meaning || '',
      contextualMeaning: wordData.contextualMeaning || (wordData as any).meaning || '',
      naturalTranslation: wordData.naturalTranslation || '',
      usageNote: wordData.usageNote || (wordData as any).ai_explanation || '',
      examples: wordData.examples || [],
      difficulty: wordData.difficulty || 'unknown',
      context: wordData.context || (wordData as any).context_sentence || '',
      title: wordData.title || (wordData as any).song_title || '',
      artist: wordData.artist || '',
      lyricsTimeMs: wordData.lyricsTimeMs ?? (wordData as any).lyrics_time_ms,
      userNote: wordData.userNote || ''
    }
    return await addVocabulary(input)
  })

  ipcMain.handle('get-vocabulary', async (_, options?: { filter?: 'all' | 'due' | 'new', query?: string }) => await getVocabulary(options))
  ipcMain.handle('get-vocabulary-stats', async () => await getVocabularyStats())
  ipcMain.handle('review-vocabulary', async (_, { id, score }: { id: number, score: number }) => await reviewVocabulary(id, score))
  ipcMain.handle('update-vocabulary', async (_, { id, data }: { id: number, data: Partial<VocabularyInput> }) => await updateVocabulary(id, data))
  ipcMain.handle('clear-vocabulary', async () => await clearVocabulary())
  ipcMain.handle('delete-vocabulary-item', async (_, id: number) => await deleteVocabulary(id))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
