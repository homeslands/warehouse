import type { Page, Response, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import type { Actor } from './real-api'

/**
 * Thao tác UI dùng chung cho smoke. Nhãn tiếng Việt vì context ép `locale: vi-VN` (ngôn ngữ mặc
 * định của app); chuỗi lấy từ `src/shared/i18n/locales/vi`.
 */
export const VI = {
  phonenumber: 'Số điện thoại',
  password: 'Mật khẩu',
  submit: 'Đăng nhập',
  logout: 'Đăng xuất',
  supervisorRole: 'Giám sát',
  forbiddenTitle: 'Không đủ quyền',
  /** `errors:warehouseAccessDenied` — bản dịch mã 100523. */
  warehouseAccessDenied: 'Bạn không quản lý hay thuộc kho này',
} as const

/** Key localStorage nơi app giữ cặp token (`src/shared/api/token-storage.ts`). */
export const TOKEN_STORAGE_KEY = 'warehouse.auth'

const isApi = (response: Response, apiPrefix: string, method: string, path: string) =>
  response.request().method() === method &&
  new URL(response.url()).pathname === `${apiPrefix}${path}`

export function waitForApi(page: Page, apiPrefix: string, method: string, path: string) {
  return page.waitForResponse((response) => isApi(response, apiPrefix, method, path))
}

/**
 * Đăng nhập qua form thật (`POST /auth/login` legacy) rồi chờ `GET /auth/me`. Trả về body của
 * `/auth/me` để test đối chiếu quyền thật mà API cấp.
 */
export async function loginViaUi(page: Page, apiPrefix: string, actor: Actor) {
  await page.goto('/login')
  await page.getByLabel(VI.phonenumber).fill(actor.phonenumber)
  await page.getByLabel(VI.password, { exact: true }).fill(actor.password)

  const login = waitForApi(page, apiPrefix, 'POST', '/auth/login')
  const me = waitForApi(page, apiPrefix, 'GET', '/auth/me')
  await page.getByRole('button', { name: VI.submit, exact: true }).click()

  const loginResponse = await login
  expect(loginResponse.ok(), `POST /auth/login as ${actor.alias}`).toBe(true)
  const meResponse = await me
  expect(meResponse.ok(), `GET /auth/me as ${actor.alias}`).toBe(true)
  await expect(page).not.toHaveURL(/\/login(\?|$)/)
  return (await meResponse.json()) as { result: MeResult }
}

/** Phần `result` của `GET /auth/me` mà smoke dùng (khớp `Profile` trong `entities/session`). */
export type MeResult = {
  userSlug?: string
  roleName: string
  /** Danh sách authority code mà API cấp cho role hiện tại. */
  scope: string[]
}

/** Nút mở menu tài khoản trên header (aria-label `"<tên> (<vai trò>)"`). */
export function accountMenuButton(page: Page, roleLabel: string) {
  return page.getByRole('button', { name: new RegExp(`\\(${roleLabel}\\)$`) })
}

export async function logoutViaUi(page: Page, apiPrefix: string, roleLabel: string) {
  await accountMenuButton(page, roleLabel).click()
  await page.getByRole('menuitem', { name: VI.logout, exact: true }).click()
  const logout = waitForApi(page, apiPrefix, 'POST', '/auth/logout')
  await page.getByRole('alertdialog').getByRole('button', { name: VI.logout, exact: true }).click()
  const response = await logout
  await expect(page).toHaveURL(/\/login(\?|$)/)
  return response
}

/** Lấy access token từ localStorage để kiểm phía API — KHÔNG log, KHÔNG attach. */
export async function readAccessToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try {
      const value = JSON.parse(raw) as { accessToken?: unknown }
      return typeof value.accessToken === 'string' ? value.accessToken : null
    } catch {
      return null
    }
  }, TOKEN_STORAGE_KEY)
}

/** Trang không được cuộn ngang ở viewport hiện tại (mobile 390: action không bị đẩy ra ngoài). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth, 'document must not scroll horizontally').toBeLessThanOrEqual(
    overflow.clientWidth,
  )
}

/** Chụp toàn trang vào thư mục kết quả của test và gắn vào report. */
export async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(`${name}.png`, { path, contentType: 'image/png' })
}
