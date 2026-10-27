/**
 * `break-ui`: thanh lọc + ô tìm + nút nhanh "Chờ duyệt (n)" của danh sách phiếu xuất với dữ liệu xấu nhất (tên người
 * rất dài, số PO 64 ký tự, người nhận dài, số phiếu chờ rất lớn). Chạy thường chỉ kiểm vài bất biến; đặt
 * `BREAK_UI_OUT=<thư mục>` thì ghi HTML từng trạng thái ra đó để dựng trang chụp (CSS build thật + Chrome headless) —
 * chỉ dùng khi dev, không phải một phần của app.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportForm } from '@/entities/export-form'
import type { Warehouse } from '@/entities/warehouse'
import { paginated, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { mockMobileViewport } from '@/shared/test/viewport'
import { ExportFormsPage } from './ExportFormsPage'

// jsdom không đo kích thước — giả kết quả đo "vừa / không vừa một hàng" để dựng popover Bộ lọc.
const fit = vi.hoisted(() => ({ fits: true }))
vi.mock('@/shared/ui/data-table/toolbar-fit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui/data-table/toolbar-fit')>()
  return {
    ...actual,
    useToolbarFit: () => ({
      rowRef: { current: null },
      filtersRef: { current: null },
      actionsRef: { current: null },
      fits: fit.fits,
    }),
  }
})

const BASE = 'http://localhost:8085/api/v1'
const OUT = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .BREAK_UI_OUT
const FS_MODULE = 'node:fs'

async function dump(name: string, html = document.body.innerHTML) {
  if (!OUT) return
  const fs = (await import(/* @vite-ignore */ FS_MODULE)) as {
    mkdirSync: (p: string, o: { recursive: boolean }) => void
    writeFileSync: (p: string, data: string) => void
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(`${OUT}/export-${name}.html`, html)
}

const LONG_LAST = 'Nguyễn Phạm Trần Lê Hoàng Phan Huỳnh Vũ Võ Đặng Bùi'
const LONG_FIRST = 'Thị Thanh Thuỷ Tiên Ngọc Bích Khánh Linh Minh Anh Hồng Nhung Diễm Quỳnh'
const PO_64 = 'PO'.padEnd(64, '0123456789')

const form: ExportForm = {
  slug: 'xf-1',
  createdAt: '2026-10-26T02:00:00.000Z',
  updatedAt: '2026-10-26T02:00:00.000Z',
  version: 3,
  code: 'PX-20261026-0930-ABCDEFGHIJKLMNO',
  type: 'SALE',
  status: 'PENDING',
  purchaseOrder: PO_64,
  invoiceCode: 'HD'.padEnd(64, '9'),
  requesterSlug: 'u-long',
  requesterName: `${LONG_LAST} ${LONG_FIRST}`,
  approverSlug: null,
  approverName: null,
  receiver: `Kho: KHO-MIEN-NAM-01 · Kho trung tâm phân phối miền Nam số một rất dài ${'x'.repeat(120)}`,
  totalAmount: 999_999_999_999,
  note: null,
  file: null,
  warehouseSlug: 'w-a',
}

const person = (slug: string, lastName: string, firstName: string, phonenumber: string) => ({
  slug,
  createdAt: '',
  updatedAt: '',
  phonenumber,
  firstName,
  lastName,
  isActive: true,
  roleSlug: 'r',
  roleName: 'STAFF',
})

const AUTH: TestAuth = {
  userName: 'm',
  userSlug: 'u-me',
  roleName: 'ADMIN',
  scope: [
    'EXPORT_FORM_READ',
    'EXPORT_FORM_CREATE',
    'EXPORT_FORM_CONFIRM',
    'WAREHOUSE_READ',
    'MATERIAL_READ',
    'USER_READ',
  ],
}

function mock() {
  server.use(
    mswHttp.get(`${BASE}/warehouses`, () =>
      paginated([
        {
          slug: 'w-a',
          code: 'A',
          name: 'Kho trung tâm phân phối miền Nam số một rất dài',
          isActive: true,
        } as Warehouse,
      ]),
    ),
    mswHttp.get(`${BASE}/warehouses/:w/export-forms`, ({ request }) => {
      const sp = new URL(request.url).searchParams
      if (sp.get('size') === '1') return paginated([], { size: 1, total: 123_456 })
      return paginated([form])
    }),
    mswHttp.get(`${BASE}/users/:slug`, () =>
      ok(person('u-long', LONG_LAST, LONG_FIRST, '0901234567')),
    ),
    mswHttp.get(`${BASE}/users`, () =>
      paginated([
        person('u-long', LONG_LAST, LONG_FIRST, '0901234567'),
        person('u-2', 'A', 'B', '0907654321'),
      ]),
    ),
  )
}

const ROUTE = `/export-forms?warehouse=w-a&status=PENDING&type=TRANSFER&requester=u-long&approver=u-long&searchBy=purchaseOrder&search=${PO_64}`

function renderPage() {
  return renderWithRouter([{ path: '/export-forms', element: <ExportFormsPage /> }], {
    route: ROUTE,
    auth: AUTH,
  })
}

describe('ExportFormsPage — break-ui', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fit.fits = true
  })

  it('desktop: người dài, PO 64 ký tự, nút "Chờ duyệt (123456)" đứng cạnh nút Tạo', async () => {
    mock()
    renderPage()
    const requester = await screen.findByRole('combobox', { name: 'Người lập' })
    await waitFor(() => expect(requester).toHaveTextContent('Nguyễn'))
    const quick = await screen.findByRole('button', { name: 'Chờ duyệt (123456)' })
    expect(quick).toHaveAttribute('aria-pressed', 'true')
    const row = quick.closest('[data-slot="toolbar-row"]')
    expect(row).toContainElement(screen.getByRole('button', { name: 'Tạo phiếu xuất' }))
    // Người nhận rất dài bị cắt một dòng, đủ chữ ở `title`.
    const receiver = await screen.findByTitle(form.receiver)
    expect(receiver).toHaveClass('truncate')
    await dump('desktop')
  })

  it('mobile: nút nhanh chỉ còn icon + số (chữ cho trình đọc màn hình), chip lý do có giá trị', async () => {
    mockMobileViewport()
    mock()
    renderPage()
    const quick = await screen.findByRole('button', { name: 'Chờ duyệt (123456)' })
    expect(within(quick).getByText('Chờ duyệt (123456)')).toHaveClass('max-md:sr-only')
    expect(screen.getByRole('combobox', { name: 'Lý do xuất' })).toHaveTextContent('Chuyển kho')
    await dump('mobile')
  })

  it('popover Bộ lọc: Lý do xuất là Select có nhãn và giá trị, người tên rất dài', async () => {
    fit.fits = false
    mock()
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: /Bộ lọc/ }))
    const panel = await screen.findByRole('dialog', { name: 'Bộ lọc' })
    expect(within(panel).getByRole('combobox', { name: 'Lý do xuất' })).toHaveTextContent(
      'Chuyển kho',
    )
    expect(within(panel).getByRole('button', { name: 'Chờ duyệt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() =>
      expect(within(panel).getByRole('combobox', { name: 'Người lập' })).toHaveTextContent(
        'Nguyễn',
      ),
    )
    await dump(
      'popover',
      `<div class="${panel.className}" style="position:relative;margin:16px">${panel.innerHTML}</div>`,
    )
  })
})
