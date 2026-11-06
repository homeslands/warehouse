import {
  test,
  expect,
  allowConsoleErrorOn,
  forbidApiCallOn,
  isHttpStatusLog,
  type ApiCall,
} from '../support/test'
import {
  TOKEN_STORAGE_KEY,
  VI,
  accountMenuButton,
  attachScreenshot,
  loginViaUi,
  logoutViaUi,
  readAccessToken,
  waitForApi,
} from '../support/app'

/**
 * W01-TC11: actor thiếu quyền / scope chéo không thấy data trái phép, logout xoá session client và
 * API vẫn là nơi quyết định quyền. Không dùng SUPER_ADMIN; không mock network.
 */

test('W01-TC11 anonymous → protected route redirects to login without calling the list API', async ({
  page,
  settleApiCalls,
}) => {
  // Mọi call `/warehouses` (kể cả đang bay / thất bại) đều là lỗi với người chưa đăng nhập.
  const isWarehouseCall = (call: ApiCall) => call.path.includes('/warehouses')
  forbidApiCallOn(page, isWarehouseCall, 'anonymous must not call the warehouse API')

  await page.goto('/warehouses')
  await expect(page).toHaveURL(/\/login(\?|$)/)
  await expect(page.getByRole('button', { name: VI.submit, exact: true })).toBeVisible()
  const calls = await settleApiCalls()
  expect(calls.filter(isWarehouseCall)).toEqual([])
})

test('W01-TC11 SUP_A1 opens warehouse B (cross scope) → API 403, no warehouse B data rendered', async ({
  page,
  realApi,
  apiPrefix,
  settleApiCalls,
}, testInfo) => {
  testInfo.annotations.push({ type: 'actor', description: 'SUP_A1' })
  const slugB = realApi.warehouses.B
  // Request về kho B còn đang bay hoặc đã trả < 400 đều là lộ scope (tab con, thành viên, tồn kho…).
  const isLeakForB = (call: ApiCall) =>
    call.path.includes(slugB) &&
    (call.state === 'pending' || (call.status !== null && call.status < 400))
  forbidApiCallOn(page, isLeakForB, 'cross-scope warehouse B must not be served')
  // Chromium log mỗi response 403 của kho B thành console error — đó chính là kết quả chờ đợi.
  allowConsoleErrorOn(
    page,
    (message) => isHttpStatusLog(message, 403, `/warehouses/${slugB}`),
    'expected 403 for cross-scope warehouse B',
  )

  await loginViaUi(page, apiPrefix, realApi.actor('SUP_A1'))

  const detail = waitForApi(page, apiPrefix, 'GET', `/warehouses/${slugB}`)
  await page.goto(`/warehouses/${slugB}`)
  const response = await detail
  expect(response.status()).toBe(403)
  // 100523 = không thuộc kho (scope) — mã do API thật trả, khớp W01-TC07 phía BE.
  expect(((await response.json()) as { code?: number }).code).toBe(100523)

  await expect(page.getByText(VI.warehouseAccessDenied)).toBeVisible()
  for (const leaked of ['E2E Warehouse B', 'E2E-WH-B', 'E2E address B']) {
    await expect(page.getByText(leaked)).toHaveCount(0)
  }
  const calls = await settleApiCalls()
  expect(calls.filter(isLeakForB)).toEqual([])
  // Request duy nhất về kho B là GET chi tiết bị từ chối.
  expect(calls.filter((call) => call.path.includes(slugB)).map((call) => call.status)).toEqual([
    403,
  ])

  await attachScreenshot(page, testInfo, 'cross-scope-B')
})

test('W01-TC11 SUP_A1 lacks MANAGE_PERMISSIONS → /permissions shows forbidden, no data call', async ({
  page,
  realApi,
  apiPrefix,
  settleApiCalls,
  request,
  baseURL,
}, testInfo) => {
  testInfo.annotations.push({ type: 'actor', description: 'SUP_A1' })
  // Cả test (login + /permissions) không được chạm API roles/permissions/authorities.
  const isPermissionDataCall = (call: ApiCall) =>
    /\/(roles|permissions|authorities)(\/|\?|$)/.test(call.path)
  forbidApiCallOn(page, isPermissionDataCall, 'SUP_A1 must not load permission data')
  const me = await loginViaUi(page, apiPrefix, realApi.actor('SUP_A1'))
  // Quyền lấy từ API thật: MANAGE_PERMISSIONS không uỷ quyền được cho SUPERVISOR.
  expect(me.result.scope).not.toContain('MANAGE_PERMISSIONS')

  await page.goto('/permissions')
  await expect(page.getByRole('heading', { name: VI.forbiddenTitle })).toBeVisible()
  const calls = await settleApiCalls()
  expect(calls.filter(isPermissionDataCall)).toEqual([])

  await attachScreenshot(page, testInfo, 'forbidden-permissions')

  // UI ẩn trang không thay backend RBAC: gọi thẳng endpoint cần MANAGE_PERMISSIONS bằng token thật
  // của SUP_A1 ⇒ AuthorityGuard trả 403 trước khi vào handler. Role đích cố ý không tồn tại để kể
  // cả khi guard hỏng, handler cũng không ghi được gì. Dùng `request` riêng (không qua page) nên
  // không lẫn vào `apiCalls`; vẫn đi qua proxy `vite preview` tới harness.
  const token = await readAccessToken(page)
  expect(token, 'access token stored after login').toBeTruthy()
  const grant = await request.put(
    `${baseURL}${apiPrefix}/roles/e2e-missing-role/authorities/WAREHOUSE_READ`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(grant.status(), 'PUT /roles/:slug/authorities/:code needs MANAGE_PERMISSIONS').toBe(403)
})

test('W01-TC11 SUP_A1 logout clears client session, protected route requires login, old token rejected', async ({
  page,
  realApi,
  apiPrefix,
  baseURL,
}, testInfo) => {
  testInfo.annotations.push({ type: 'actor', description: 'SUP_A1' })
  await loginViaUi(page, apiPrefix, realApi.actor('SUP_A1'))
  await page.goto('/warehouses')
  await expect(page.getByRole('row').filter({ hasText: 'E2E Warehouse A' })).toHaveCount(1)

  // Giữ token trong biến cục bộ (không log/attach) để kiểm phía API sau khi đăng xuất.
  const token = await readAccessToken(page)
  expect(token, 'access token stored after login').toBeTruthy()

  const logout = await logoutViaUi(page, apiPrefix, VI.supervisorRole)
  expect(logout.ok(), 'POST /auth/logout').toBe(true)
  expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_STORAGE_KEY)).toBeNull()

  await page.goto('/warehouses')
  await expect(page).toHaveURL(/\/login(\?|$)/)
  await expect(accountMenuButton(page, VI.supervisorRole)).toHaveCount(0)
  await expect(page.getByText('E2E Warehouse A')).toHaveCount(0)

  // API vẫn quyết định: token cũ (qua cùng proxy `vite preview` tới harness) không còn dùng được.
  const me = await page.request.get(`${baseURL}${apiPrefix}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(me.status()).toBe(401)

  await attachScreenshot(page, testInfo, 'after-logout')
})
