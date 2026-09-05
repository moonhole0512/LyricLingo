## Done

- [Debugging] Fix word click-to-analyze vocabulary addition failing while text dragging worked: Resolved issue in `LyricsPlayer.tsx` where an arbitrary 4px mouse movement threshold (`dx > 4 || dy > 4`) was falsely classifying natural mouse clicks (with hand/cursor shift) as drags, causing single-word `onClick` events to abort and drop without opening TutorSidebar or saving to vocabulary. Implemented a reliable `dragJustOccurred` ref latch: `onMouseUp` detects genuine drag selections via `getSelectedTextExcludingRuby()` and sets the latch so the browser's subsequent click event is safely absorbed without overwriting the dragged selection, while normal word clicks cleanly pass directly to `handleLyricClick` without being blocked by coordinate jitter. Updated `tokenize-japanese` in `src/main/index.ts` to skip Kuromoji on non-Japanese text so Korean and English songs fall back to `Intl.Segmenter` and segment into discrete clickable words. Verified with 61 unit tests.
- [Debugging] Fix Vocabulary review displaying mock words instead of registered user words: Purged dummy test rows (`모의 단어`, `모의 가사`, `Test Song`, `Visual Song`) and corrupted UTF-8 from `lyriclingo.db` and added automated init purge in `src/main/database/db.ts`. In `Dashboard.tsx`, upgraded `startReview(targetVocab)` so clicking "이 단어 복습" on an individual word immediately begins reviewing that exact word. Allowed "오늘 복습" to review all registered words when `stats.due === 0` and added "← 단어 목록으로 돌아가기" exit navigation.
- [Implementation] Comprehensive README.md for Git release: Created a clean, complete, professional project README.md documenting LyricLingo's core value proposition, key features (Apple Music integration, LRC syncing & Smart Sync, real-time AI translation & token HUD, Japanese Yomigana post-processing, drag & click vocabulary tutor with SM-2, customizable glassmorphic UI), tech stack, installation, getting started guide, AI configuration (FreeToken & LM Studio), project structure, and MIT license.
- [Implementation] App icon redesign complying with professional guidelines (clarity, scalability, uniqueness): Created a minimalist, bold, instantly legible 1024x1024 icon combining a musical eighth note (Lyric) and speech dialogue bubble (Lingo) into a single unified white silhouette on a radiant rose-coral-purple gradient squircle with transparent corner mask. Replaced clutter with high-contrast, scalable geometry that remains sharp at 16x16px and 32x32px. Synchronized across `src/renderer/src/assets/logo.png`, `resources/icon.png`, `build/icon.png`, and `build/icon.ico`.
- [Implementation] Replace start-fetch button with intuitive empty-state guidance when lyrics are not found: When online lyrics are absent for a song (e.g. `Nutmeg - PURPLE BUBBLE`), track `lyricsNotFound` state in `LyricsPlayer.tsx` to hide the redundant "가사 및 번역 취득 시작" button. Replaced it with an informative "온라인에서 가사를 찾을 수 없습니다" notification, "다른 가사 찾기" (opens versions modal), "Apple Music 열기", and a subtle retry link. Refactored modal rendering (`renderVersionsModal`, `renderErrorModal`) so version search functions seamlessly from both empty-state and active lyrics playback.
- [Debugging] Fix infinite auto-fetch request loop on missing lyrics: Added `attemptedAutoFetchKey` single-attempt guard in `LyricsPlayer.tsx` to ensure songs without online lyrics (e.g. `Nutmeg - PURPLE BUBBLE`) are only automatically fetched once and do not re-trigger endlessly when `isTranslating` resets to false or on playback position ticks.
- [Debugging] Fix unrelated artist lyric retrieval bug (Nutmeg - PURPLE BUBBLE): In `lrcSearcher.ts`, strictly restrict candidate results to matching artists when an artist is specified (`validArtists.length > 0`), preventing title-only fallbacks from auto-selecting songs by completely different artists (e.g. Ghostface Killah). Fixed cache fallback in `src/main/index.ts` and purged mismatched row 187 from `lyriclingo.db`.
- [Implementation] Japanese lyric Yomigana token post-processing: Created `japaneseLyricsDictionary.ts` to automatically merge split numeral/counter compound tokens (e.g. `二` + `人` -> `二人` with reading `ふたり`, `一` + `人` -> `一人` with reading `ひとり`, `二日` -> `ふつか`, etc.) while preserving exceptions like `二人前` (ににんまえ).
- [Implementation] Translation elapsed duration display: Visibly show elapsed seconds (e.g. `45tok · 18.2 t/s · 2.5s` or `3.2s`) in completed translation badge and history sidebar even after translation finishes, with fallback handling and automatic track-switch metric cleanup.
- [Debugging] Fix translation cache reuse bug: Removed inadvertent empty string check in `getLyricsFromCache` that caused all valid cached translations to be discarded as corrupt, and replaced broad SQL pattern with `INSTR(..., char(65533))` in `db.ts` to preserve cached rows.
- [Implementation] Lyric & Translation UI polish: Simplified translation button to spinner and "번역 중...", added elapsed time to status banner, expanded long song title display with line-clamp-2 and responsive sizing.
- [Debugging] Multi-byte UTF-8 character corruption fix: Replaced HTTP chunk decoding in `lrcSearcher` with Buffer.concat to preserve characters like '差' in 'ceremony' without replacement character corruption (\ufffd), added cache invalidation and DB purge.
- [Debugging] Yorushika lyric retrieval fix: Enhanced media normalization, added iTunes multi-country & artist entity resolution, and title-match fallback candidates.
- [Implementation] Vocabulary save mode toggle: Added auto-save vs manual-save toggle in TutorSidebar, dynamic "단어장에 추가" ↔ "단어장에서 삭제" button with transition animations and deletion IPC.
- [Implementation] Error modal song metadata & reliable drag/click interaction: Added song card to retrieval failure modals and separated text drag (>4px) from word click with ruby exclusion and sidebar state cleanup.
- [Implementation] Comprehensive `.gitignore` configuration for Electron, React, TypeScript, SQLite, Playwright, temporary test sandboxes, local cache, and OS files.
- [Implementation] Structured vocabulary learning flow: lyric selection now analyzes and saves a card automatically.
- [Implementation] Media reliability: Apple Music source filtering, stale-event clearing, stable song identity/generation guards, acknowledged serialized playback controls, and full-sentence Japanese furigana tokenization.
- [Debugging] Non-fatal Media Error Handling & LM Studio Compatibility.
- [Implementation] Translation Cache Lookup: Added getLyricsFromCache helper & get-lyrics-cache IPC handler.
- [Implementation] Custom Model Select UI and Logo assets.
- [Implementation] Multi-provider AI support (FreeToken & LM Studio).
- [Debugging] FreeToken Compatibility & Untranslated Lyrics Cache Protection.
- [Debugging] Manual Lyric Selection Reversion Fix.
- [Debugging] Fix lyric scroll position reset on track change and intro playback (`activeIndex === -1`).
- [Implementation] Record translation AI model metadata in DB (`translated_model`, `translated_model_info`) and display model name & t/s in UI toolbar and history sidebar.
- [Implementation] Sort lyric search & "Find other lyrics" results by song duration closeness.
- [Debugging] Fix bug where selecting new lyric version from "Find other lyrics" reverts back after translation.
- [Implementation] Separate and redesign popups for Lyric Retrieval Failure vs Lyric Translation Failure using Apple-style glassmorphic modals.
- [Implementation] Track & display translation duration and tokens-per-second (t/s) metrics in streaming UI & header badge.
- [Implementation] Add Display Settings (Furigana script katakana/hiragana, font sizes, line spacing, target language) & AI Model manual JSON configuration.
- [Implementation] Real-time token streaming & Live Token HUD during translation (prompt tokens, completion tokens, TPS, and live stream card for FreeToken & local LLMs).
- [Implementation] Smart Duration Difference Auto-Sync: automatically detects duration discrepancy between track and LRC, applies intelligent offset recommendations (+/-N seconds), and provides intuitive one-click preset controls in sync popover and Settings.
- [Debugging] Fix discrepancy between auto-fetch lyrics and 'Find other lyrics' by unifying searchLrcCandidates pipeline and enforcing strict duration closeness ranking.
- [Debugging] Fix Yomigana furigana display mode (Hiragana vs Katakana) using deterministic unicode kana shift functions.
- [Debugging] Fix broken timestamp prefix (e.g. '[00: ') in translated lyrics by removing artificial assistant prefill and adding comprehensive timestamp sanitization.

## In progress

## Next

## Notes

- 2026-08-29: All features implemented, `npm run build` and 28 unit tests in `vitest` passed cleanly.
