import { writeFileSync } from 'node:fs'
import {
  test as base,
  expect,
  type ConsoleMessage,
  type Page,
  type Response,
} from '@playwright/test'
import { loadRealApiFixture, type Actor, type ActorAlias, type RealApiFixture } from './real-api'

/** Một lệnh gọi API mà trang thực sự gửi đi — chỉ method/path/status, không header/body/token. */
export type ApiCall = {
  method: string
  path: string
  status: number | null
  /** IP:port phía server. `null` nghĩa là response không đến từ mạng (route.fulfill / cache SW). */
  server: string | null
  fromServiceWorker: boolean
}

type Fixtures = {
  realApi: RealApiFixture
  /** Path prefix API mà UI gọi qua Vite proxy, ví dụ `/api/v1`. */
  apiPrefix: string
  /** Các lệnh gọi API đã ghi trong test hiện tại (đủ khi test kết thúc). */
  apiCalls: ApiCall[]
  /** Fixture tự chạy: gom console/pageerror/API, chặn network giả, gắn bằng chứng vào report. */
  realApiGuard: void
}

// Tham số thứ 2 của fixture đặt tên `provide` (không phải `use`) để rule react-hooks/rules-of-hooks
// không nhầm là React hook `use`.
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  realApi: async ({}, provide) => {
    await provide(loadRealApiFixture())
  },

  apiPrefix: async ({ realApi }, provide) => {
    await provide(new URL(realApi.baseUrl).pathname.replace(/\/+$/, ''))
  },

  // eslint-disable-next-line no-empty-pattern
  apiCalls: async ({}, provide) => {
    await provide([])
  },

  realApiGuard: [
    async ({ page, realApi, apiPrefix, apiCalls }, provide, testInfo) => {
      testInfo.annotations.push(
        { type: 'level', description: 'REAL_BROWSER_API (no route.fulfill / no mock HTTP)' },
        { type: 'target', description: realApi.targetId },
        { type: 'fixture', description: realApi.fixtureVersion },
      )

      const consoleErrors: { text: string; url: string; allowed?: string }[] = []
      const pageErrors: string[] = []
      allowRules.set(page, [])

      page.on('console', (message) => {
        if (message.type() !== 'error') return
        const rule = allowRules.get(page)?.find((r) => r.match(message))
        consoleErrors.push({
          text: message.text(),
          url: message.location().url,
          allowed: rule?.reason,
        })
      })
      page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`))

      const pending: Promise<void>[] = []
      page.on('requestfinished', (request) => {
        const url = new URL(request.url())
        if (!url.pathname.startsWith(`${apiPrefix}/`)) return
        pending.push(
          request.response().then(async (response: Response | null) => {
            const server = response ? await response.serverAddr() : null
            apiCalls.push({
              method: request.method(),
              path: url.pathname + url.search,
              status: response?.status() ?? null,
              server: server ? `${server.ipAddress}:${server.port}` : null,
              fromServiceWorker: response?.fromServiceWorker() ?? false,
            })
          }),
        )
      })
      page.on('requestfailed', (request) => {
        const url = new URL(request.url())
        if (!url.pathname.startsWith(`${apiPrefix}/`)) return
        apiCalls.push({
          method: request.method(),
          path: url.pathname + url.search,
          status: null,
          server: null,
          fromServiceWorker: false,
        })
      })

      await provide()

      await Promise.all(pending)
      // Ghi file vào thư mục kết quả của test (không chỉ nhúng vào report) để lưu evidence.
      for (const [name, value] of [
        ['api-calls.json', apiCalls],
        ['console-errors.json', { consoleErrors, pageErrors }],
      ] as const) {
        const path = testInfo.outputPath(name)
        writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
        await testInfo.attach(name, { path, contentType: 'application/json' })
      }

      // Response của API phải đi qua mạng thật (Vite proxy → harness). route.fulfill/SW không có
      // serverAddr ⇒ bị bắt ở đây.
      const synthetic = apiCalls.filter(
        (c) => c.status !== null && (!c.server || c.fromServiceWorker),
      )
      expect(synthetic, 'API responses must come from the real server').toEqual([])
      expect(pageErrors, 'uncaught page errors').toEqual([])
      expect(
        consoleErrors.filter((e) => !e.allowed),
        'unexpected console errors',
      ).toEqual([])
    },
    { auto: true },
  ],
})

// Quy tắc cho phép console error theo từng page; tách khỏi fixture để `allowConsoleErrorOn` thêm được
// sau khi guard đã gắn listener.
const allowRules = new WeakMap<
  Page,
  { match: (message: ConsoleMessage) => boolean; reason: string }[]
>()

/**
 * Khai báo một console error ĐƯỢC CHỜ ĐỢI trên page của test (ví dụ Chromium log 403 của bài deny).
 * Mọi console error / pageerror khác làm test FAIL.
 */
export function allowConsoleErrorOn(
  page: Page,
  match: (message: ConsoleMessage) => boolean,
  reason: string,
): void {
  const rules = allowRules.get(page)
  if (!rules) throw new Error('realApiGuard not active for this page')
  rules.push({ match, reason })
}

/** Chromium log mỗi response 4xx/5xx thành console error có `location.url` là URL resource. */
export function isHttpStatusLog(
  message: ConsoleMessage,
  status: number,
  pathPart: string,
): boolean {
  return (
    message
      .text()
      .startsWith(`Failed to load resource: the server responded with a status of ${status}`) &&
    message.location().url.includes(pathPart)
  )
}

export { expect }
export type { Actor, ActorAlias }
