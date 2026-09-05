import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test, expect } from '@playwright/test';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

let electronApp: ElectronApplication;
let window: Page;
let mockServer: http.Server;
let mockRouteHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void = (req, res) => {
  res.statusCode = 404;
  res.end();
};

const debugDir = path.resolve(__dirname, '../../../_testcode/debug');

test.beforeAll(async () => {
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }

  // 1. Mock LM Studio Server on port 1234
  mockServer = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    mockRouteHandler(req, res);
  });
  
  await new Promise<void>((resolve) => {
    mockServer.listen(12345, () => resolve());
  });
});

test.afterAll(async () => {
  if (mockServer) {
    mockServer.close();
  }
});

test.beforeEach(async () => {
  // Reset Mock Handler to success state BEFORE launching the app
  mockRouteHandler = (req, res) => {
    if (req.url === '/v1/models' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [{ id: 'mock-qwen-3.5-9b' }]
      }));
    } else if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: '[00:00.00] 모의 번역 가사' } }]
        }));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  };
  
  const rootDir = path.resolve(__dirname, '../../../');
  fs.writeFileSync(path.join(rootDir, '.e2e'), '1');

  // Launch Electron App with isolated mock endpoints
  electronApp = await electron.launch({
    args: [rootDir],
    env: {
      ...process.env,
      LM_STUDIO_URL: 'http://127.0.0.1:12345/v1',
      FREE_TOKEN_URL: 'http://127.0.0.1:12345/v1'
    }
  });
  window = await electronApp.firstWindow();
  // Override window.alert globally to prevent hanging
  await window.addInitScript(() => {
    window.alert = (msg) => console.log('ALERT OVERRIDE:', msg);
  });

  // Pipe console events
  window.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  // Pipe main process logs
  electronApp.process().stdout?.on('data', chunk => console.log('MAIN LOG:', chunk.toString()));
  electronApp.process().stderr?.on('data', chunk => console.log('MAIN ERR:', chunk.toString()));

  // Auto-accept alerts to prevent tests from hanging
  window.on('dialog', async dialog => {
    console.log('DIALOG:', dialog.message());
    await dialog.accept();
  });

  // Clear localStorage to prevent Auto-Fetch from breaking tests
  await window.evaluate(() => {
    window.localStorage.clear();
  });
});

test.afterEach(async () => {
  if (electronApp) {
    await electronApp.close();
  }
  const rootDir = path.resolve(__dirname, '../../../');
  const e2eFile = path.join(rootDir, '.e2e');
  if (fs.existsSync(e2eFile)) {
    fs.unlinkSync(e2eFile);
  }
});

test('1. LM Studio / FreeToken 연결 실패 시 상태등 🔴 및 토스트 안내 표시', async () => {
  mockRouteHandler = (req, res) => {
    res.writeHead(500);
    res.end('Server Error');
  };

  await window.locator('button[title="모델 새로고침"]').click();

  const indicator = window.locator('[data-testid="ai-status-indicator"]');
  await expect(indicator).toHaveAttribute('data-status', 'offline', { timeout: 15000 });
  
  const toast = window.locator('text=FreeToken 또는 LM Studio 서버를 실행해주세요');
  await expect(toast).toBeVisible({ timeout: 15000 });
});

test('2. 스켈레톤 로딩 후 번역 가사 덧입혀지는 순차 렌더링', async () => {
  await window.waitForSelector('text=단어장');

  const autoFetchToggle = window.locator('input[type="checkbox"]');
  if (await autoFetchToggle.isChecked()) {
    await autoFetchToggle.uncheck({ force: true });
    await window.waitForTimeout(500);
  }

  await window.evaluate(() => {
    // @ts-ignore
    window.api.fetchLrcManual = async () => '[00:00.00] 모의 가사';
  });

  await window.evaluate(() => {
    // @ts-ignore
    window.api.mockPlayEvent({ title: 'Test Song', artist: 'Test Artist', position: 0 });
  });

  const syncBtn = window.locator('text=가사 및 번역 취득 시작');
  const html1 = await window.content();
  fs.writeFileSync(path.join(debugDir, 'test-2-dom-initial.html'), html1);
  await expect(syncBtn).toBeVisible({ timeout: 10000 });
  await syncBtn.click();

  const loadingIndicator = window.locator('text=가사를 불러오는 중...');
  await window.screenshot({ path: path.join(debugDir, 'test-2-screenshot.png') });
  const html2 = await window.content();
  fs.writeFileSync(path.join(debugDir, 'test-2-dom.html'), html2);
  await expect(loadingIndicator).toBeVisible({ timeout: 5000 });

  const translated = window.locator('text=모의 번역 가사');
  await expect(translated).toBeVisible({ timeout: 5000 });
});

test('3. 단어장에 추가 시 ai_explanation 저장 및 조회 통합 테스트', async () => {
  await window.waitForSelector('text=단어장');

  await window.evaluate(() => {
    // @ts-ignore
    window.api.mockPlayEvent({ title: 'Test Song', artist: 'Test Artist', lrc: '[00:00.00] 모의 가사', position: 0 });
  });

  const indicator = window.locator('[data-testid="ai-status-indicator"]');
  await expect(indicator).toHaveAttribute('data-status', 'online', { timeout: 15000 });

  const lyricLine = window.locator('text=모의 가사');
  await window.screenshot({ path: path.join(debugDir, 'test-3-screenshot.png') });
  const html3 = await window.content();
  fs.writeFileSync(path.join(debugDir, 'test-3-dom.html'), html3);
  await expect(lyricLine).toBeVisible({ timeout: 10000 });
  await lyricLine.click();

  const tutorResponse = window.locator('.tutor-response');
  await expect(tutorResponse).toBeVisible({ timeout: 10000 });

  await window.locator('button:has-text("단어장에 추가")').click();

  await window.locator('a:has-text("단어장")').click();

  const explanation = window.locator('.ai-explanation').first();
  await expect(explanation).toBeVisible({ timeout: 5000 });
});
