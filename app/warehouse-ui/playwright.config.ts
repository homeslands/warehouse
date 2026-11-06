import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { assertLoopbackApi, fixtureSecretPath } from './e2e/support/real-api'

/**
 * Browser smoke REAL_API (W01-FE-02, #164). Chạy với API legacy THẬT do harness BE serve
 * (`npm run test:e2e:serve` trong app/warehouse-api), không route.fulfill / mock HTTP:
 *
 *   WH_E2E_FIXTURE_SECRET_FILE=/abs/outside/repo/fixture.json npm run test:e2e
 *
 * - API origin lấy từ `baseUrl` trong file fixture (chỉ loopback). `vite preview` proxy `/api` tới
 *   đó, nên trình duyệt gọi cùng origin `http://localhost:<port>` (CORS harness chỉ cho localhost).
 * - `WH_E2E_UI_PORT` (mặc định 5186): cổng riêng của `vite preview`, KHÔNG dùng lại server đang chạy.
 * - `WH_E2E_EVIDENCE_DIR`: thư mục tuyệt đối ngoài repo để ghi report/trace/screenshot; mặc định
 *   `playwright-report/` + `test-results/` (đã gitignore).
 * - retries 0: test FAIL không được retry thành PASS nghiệm thu.
 */
const secretFile = fixtureSecretPath()
// Chỉ đọc `baseUrl` (không phải secret) để dựng proxy. Thiếu biến ⇒ proxy trống ⇒ Vite từ chối
// khởi động, test không chạy được (fail-closed); `--list` vẫn chạy để kiểm discovery.
const apiUrl = secretFile
  ? assertLoopbackApi((JSON.parse(readFileSync(secretFile, 'utf8')) as { baseUrl: string }).baseUrl)
  : undefined

const uiPort = Number(process.env.WH_E2E_UI_PORT ?? '5186')
const E2E_DIST = 'node_modules/.e2e-dist'
const evidenceDir = process.env.WH_E2E_EVIDENCE_DIR
const reportDir = evidenceDir ? resolve(evidenceDir, 'html-report') : 'playwright-report'
const outputDir = evidenceDir ? resolve(evidenceDir, 'test-results') : 'test-results'

const shared = {
  locale: 'vi-VN',
  timezoneId: 'Asia/Ho_Chi_Minh',
  // Chặn service worker để không có gì (kể cả MSW) chen vào giữa trang và API thật.
  serviceWorkers: 'block',
  trace: 'on',
  screenshot: 'on',
  video: 'off',
} as const

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: reportDir, open: 'never' }],
    ['json', { outputFile: resolve(outputDir, 'results.json') }],
  ],
  use: {
    ...shared,
    baseURL: `http://localhost:${uiPort}`,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], ...shared, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        ...shared,
        viewport: { width: 390, height: 844 },
        // Pixel 7 mặc định chạy Chromium — chỉ ghi đè bề rộng 390 theo test matrix.
      },
    },
  ],
  // `vite build` + `vite preview` (không dùng `vite` dev): preview vẫn có proxy `/api` nhưng không
  // cần file watcher — máy dev nhiều worktree dễ hết inotify (ENOSPC) — và chạy đúng bundle production.
  // Bundle ghi vào node_modules/.e2e-dist để không đụng `dist/` của `npm run build`.
  webServer: {
    command:
      `npx vite build --outDir ${E2E_DIST} --emptyOutDir --logLevel warn && ` +
      `npx vite preview --outDir ${E2E_DIST} --port ${uiPort} --strictPort`,
    url: `http://localhost:${uiPort}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      VITE_API_BASE_URL: apiUrl ? apiUrl.pathname.replace(/\/+$/, '') : '/api/v1',
      VITE_API_PROXY_TARGET: apiUrl ? apiUrl.origin : '',
    },
  },
})
