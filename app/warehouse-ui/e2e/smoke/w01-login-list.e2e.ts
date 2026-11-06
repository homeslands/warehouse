import { test, expect } from '../support/test'
import {
  VI,
  accountMenuButton,
  attachScreenshot,
  expectNoHorizontalOverflow,
  loginViaUi,
  waitForApi,
} from '../support/app'

/**
 * W01-TC09 (desktop 1440) / W01-TC10 (mobile 390): actor fixture thật đăng nhập bằng
 * `POST /auth/login` legacy rồi xem danh sách kho; dữ liệu và scope đến từ `GET /warehouses` thật.
 * Không route.fulfill / mock HTTP — `realApiGuard` FAIL nếu response không đến từ server thật.
 */
type WarehouseItem = { slug: string; code: string; name: string }

const CASES = [
  // SUP_A1 là member kho A (fixture R2 legacy-adapter-1) ⇒ chỉ thấy kho A.
  { alias: 'SUP_A1', visible: 'A', hidden: ['B', 'C'] },
  // SUP_B là member kho B ⇒ chỉ thấy kho B; kho A của SUP_A1 không lộ sang.
  { alias: 'SUP_B', visible: 'B', hidden: ['A', 'C'] },
] as const

const CODE = { A: 'E2E-WH-A', B: 'E2E-WH-B', C: 'E2E-WH-C' } as const
const NAME = { A: 'E2E Warehouse A', B: 'E2E Warehouse B', C: 'E2E Warehouse C' } as const

for (const { alias, visible, hidden } of CASES) {
  test(`W01-TC09/TC10 ${alias} login → warehouse list shows only scope ${visible}`, async ({
    page,
    realApi,
    apiPrefix,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'actor', description: alias })
    const actor = realApi.actor(alias)

    const me = await loginViaUi(page, apiPrefix, actor)
    expect(me.result.roleName).toBe('SUPERVISOR')
    expect(me.result.scope).toContain('WAREHOUSE_READ')
    await expect(accountMenuButton(page, VI.supervisorRole)).toBeVisible()

    const list = waitForApi(page, apiPrefix, 'GET', '/warehouses')
    await page.goto('/warehouses')
    const listResponse = await list
    expect(listResponse.status()).toBe(200)
    const items = ((await listResponse.json()) as { result: { items: WarehouseItem[] } }).result
      .items
    // Scope do API quyết định: đúng 1 kho của actor, không có kho khác của fixture.
    expect(items.map((item) => item.slug)).toEqual([realApi.warehouses[visible]])

    // Tên kho hiện ở cả 2 viewport (mobile 390 ẩn cột Mã) ⇒ kiểm hàng theo tên.
    const dataRows = page.getByRole('row').filter({ has: page.getByRole('cell') })
    await expect(dataRows).toHaveCount(items.length)
    const rows = dataRows.filter({ hasText: NAME[visible] })
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toBeVisible()
    for (const other of hidden) {
      await expect(page.getByText(CODE[other], { exact: true })).toHaveCount(0)
      await expect(page.getByText(NAME[other], { exact: true })).toHaveCount(0)
    }

    // Thao tác chính dùng được ở cả 2 viewport: menu tài khoản trong khung nhìn, trang không cuộn ngang.
    await expect(accountMenuButton(page, VI.supervisorRole)).toBeInViewport()
    await expectNoHorizontalOverflow(page)

    await attachScreenshot(page, testInfo, `warehouses-${alias}`)

    // Mở chi tiết kho trong scope bằng click hàng — dữ liệu chi tiết cũng từ API thật.
    const detail = waitForApi(page, apiPrefix, 'GET', `/warehouses/${realApi.warehouses[visible]}`)
    await rows.first().click()
    expect((await detail).status()).toBe(200)
    await expect(page).toHaveURL(new RegExp(`/warehouses/${realApi.warehouses[visible]}$`))
    await expect(page.getByRole('heading', { name: NAME[visible] })).toBeVisible()
    await attachScreenshot(page, testInfo, `warehouse-detail-${alias}`)
  })
}
