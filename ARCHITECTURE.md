# Architecture

## Overview

- Electron main process: `src/main/` handles IPC, media/player integration, AI calls, and SQLite persistence.
- Preload bridge: `src/preload/` exposes the typed renderer API.
- React renderer: `src/renderer/src/` contains the application shell, lyric views, tutor/history UI, and styling.
- Shared/domain utilities: lyric parsing, alignment, media identity, and the
  persistent Apple Music command worker live under `src/main/utils/`.
- Shared types: renderer/main vocabulary contracts live under `src/shared/`.
- Verification: Unit specs live under `_testcode/specs/main/`; Playwright E2E suites live under `_testcode/specs/e2e/`. Scratch scripts live under `_testcode/temp/` and debugging artifacts under `_testcode/debug/`.

## Data flow

1. The main process observes or receives current media metadata.
2. IPC exposes metadata, lyrics, translations, and playback actions to the renderer.
3. The renderer presents the lyric player and sends user actions back through the preload bridge.
4. SQLite stores lyric/history data and structured vocabulary cards; AI services provide translation and language assistance.

## Reliability boundaries

- Media updates are normalized and accepted only when their source identifies
  Apple Music. Consecutive non-Apple events clear stale playback state.
- Playback controls use one persistent PowerShell worker with acknowledgement,
  timeout, retry, and serialized commands instead of fire-and-forget IPC.
- Japanese ruby markup is generated from full-sentence Kuromoji tokens so
  readings retain context and stale tokenization cannot overwrite a newer song.
- Vocabulary analysis is structured, automatically saved on lyric selection, and
  reviewed through due/new filters and SM-2 scheduling.

## Core modules

- `src/main/database/vocabulary.ts`: vocabulary CRUD, duplicate normalization,
  statistics, and review scheduling.
- `src/main/utils/mediaIdentity.ts`: conservative source filtering and stable
  song identity keys.
- `src/main/utils/mediaControl.ts`: acknowledged Apple Music control worker.
- `src/shared/types.ts`: vocabulary analysis/input/record contracts shared by
  IPC and the renderer.
