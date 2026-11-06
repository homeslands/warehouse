import { writeFileSync } from 'node:fs'
import {
  test as base,
  expect,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from '@playwright/test'
import { loadRealApiFixture, type Actor, type ActorAlias, type RealApiFixture } from './real-api'

/** Một lệnh gọi API mà trang thực sự gửi đi — chỉ method/path/status, không header/body/token. */
export type ApiCall = {
  method: string
  path: string
  /**
   * `pending`: đã gửi (sự kiện `request`) nhưng chưa xong, hoặc chưa đọc xong response;
   * `finished`: đã có response; `failed`: `requestfailed` (abort, lỗi mạng…).
   */
  state: 'pending' | 'finished' | 'failed'
  status: number | null
  /** IP:port phía server. `null` nghĩa là response không đến từ mạng (route.fulfill / cache SW). */
  server: string | null
  fromServiceWorker: boolean
}

/** Chờ tối đa bao lâu cho tới khi không còn request API nào đang bay. Hết giờ ⇒ test FAIL. */
const SETTLE_TIMEOUT_MS = 15_000
/** Khoảng yên lặng (không request mới, không pending) bắt buộc trước khi coi là đã settle. */
const SETTLE_QUIET_MS = 500

type Fixtures = {
  realApi: RealApiFixture
  /** Path prefix API mà UI gọi qua Vite proxy, ví dụ `/api/v1`. */
  apiPrefix: string
  /**
   * Mọi lệnh gọi API của page trong test hiện tại, ghi NGAY khi request được gửi (`state: pending`)
   * rồi cập nhật khi xong. Chỉ kết luận trên kết quả của `settleApiCalls()`.
   */
  apiCalls: ApiCall[]
  /**
   * Chờ `networkidle`, rồi chờ tới khi không còn call `pending` trong một khoảng yên lặng
   * `SETTLE_QUIET_MS`; quá `SETTLE_TIMEOUT_MS` thì throw (test FAIL, không nuốt). Trả về `apiCalls`
   * đã settle. Gọi trước MỌI assertion đọc `apiCalls`.
   */
  settleApiCalls: () => Promise<readonly ApiCall[]>
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

  settleApiCalls: async ({ page, apiCalls }, provide) => {
    await provide(() => settleApiCalls(page, apiCalls))
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
      forbidRules.set(page, [])

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

      // Ghi call ngay khi request được gửi để assertion "không gọi" thấy cả request đang bay.
      const tracked = new Map<Request, ApiCall>()
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (!url.pathname.startsWith(`${apiPrefix}/`)) return
        const call: ApiCall = {
          method: request.method(),
          path: url.pathname + url.search,
          state: 'pending',
          status: null,
          server: null,
          fromServiceWorker: false,
        }
        tracked.set(request, call)
        apiCalls.push(call)
      })
      page.on('requestfinished', (request) => {
        const call = tracked.get(request)
        if (!call) return
        // Chỉ chuyển `finished` sau khi đọc xong response + serverAddr; settle chờ cả bước này.
        void request
          .response()
          .then(async (response: Response | null) => {
            const server = response ? await response.serverAddr() : null
            call.status = response?.status() ?? null
            call.server = server ? `${server.ipAddress}:${server.port}` : null
            call.fromServiceWorker = response?.fromServiceWorker() ?? false
            call.state = 'finished'
          })
          .catch(() => {
            call.state = 'failed'
          })
      })
      page.on('requestfailed', (request) => {
        const call = tracked.get(request)
        if (call) call.state = 'failed'
      })

      let settleError: unknown
      try {
        await provide()
      } finally {
        // Lưới an toàn: settle lần cuối trước khi ghi evidence và kiểm policy. Settle lỗi vẫn ghi
        // evidence (thấy được call còn `pending`) rồi làm test FAIL.
        try {
          await settleApiCalls(page, apiCalls)
        } catch (error) {
          settleError = error
        }
        // Ghi file vào thư mục kết quả của test (không chỉ nhúng vào report) để lưu evidence.
        for (const [name, value] of [
          ['api-calls.json', apiCalls],
          ['console-errors.json', { consoleErrors, pageErrors }],
        ] as const) {
          const path = testInfo.outputPath(name)
          writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
          await testInfo.attach(name, { path, contentType: 'application/json' })
        }
      }
      if (settleError) throw settleError

      // Response của API phải đi qua mạng thật (Vite proxy → harness). route.fulfill/SW không có
      // serverAddr ⇒ bị bắt ở đây.
      const synthetic = apiCalls.filter(
        (c) => c.state === 'finished' && (!c.server || c.fromServiceWorker),
      )
      expect(synthetic, 'API responses must come from the real server').toEqual([])
      // Kiểm lại lệnh gọi bị cấm mà test đã khai báo, trên danh sách đã settle (gồm call đến muộn,
      // sau khi assertion trong test đã chạy).
      const violations = (forbidRules.get(page) ?? []).flatMap((rule) =>
        apiCalls.filter(rule.match).map((call) => ({ reason: rule.reason, ...call })),
      )
      expect(violations, 'forbidden API calls (re-checked after settle)').toEqual([])
      expect(pageErrors, 'uncaught page errors').toEqual([])
      expect(
        consoleErrors.filter((e) => !e.allowed),
        'unexpected console errors',
      ).toEqual([])
    },
    { auto: true },
  ],
})

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function settleApiCalls(page: Page, apiCalls: ApiCall[]): Promise<readonly ApiCall[]> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS
  const pending = () =>
    apiCalls.filter((c) => c.state === 'pending').map((c) => `${c.method} ${c.path}`)
  // `networkidle` chỉ gắn với lần điều hướng hiện tại (đã idle thì trả về ngay), nên vẫn phải tự chờ
  // hết call `pending` và một khoảng yên lặng không phát sinh request mới.
  await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS })
  for (;;) {
    if (pending().length === 0) {
      const seen = apiCalls.length
      await sleep(SETTLE_QUIET_MS)
      if (apiCalls.length === seen && pending().length === 0) return apiCalls
    } else {
      await sleep(50)
    }
    if (Date.now() > deadline) {
      throw new Error(
        `API calls not settled within ${SETTLE_TIMEOUT_MS}ms; pending: ${JSON.stringify(pending())}`,
      )
    }
  }
}

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

// Lệnh gọi API bị cấm theo từng page; guard kiểm lại khi teardown, sau khi settle.
const forbidRules = new WeakMap<Page, { match: (call: ApiCall) => boolean; reason: string }[]>()

/**
 * Khai báo lệnh gọi API mà page KHÔNG được gửi trong test. `match` nhận mọi call (kể cả `pending`,
 * `failed`); muốn chỉ cấm call thành công thì tự lọc theo `state`/`status`. Test vẫn tự assert sau
 * `settleApiCalls()`; đây là lưới an toàn bắt request đến muộn.
 */
export function forbidApiCallOn(
  page: Page,
  match: (call: ApiCall) => boolean,
  reason: string,
): void {
  const rules = forbidRules.get(page)
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
