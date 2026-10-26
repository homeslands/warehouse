/**
 * `break-ui`: thanh lọc + ô tìm của danh sách phiếu nhập với dữ liệu xấu nhất (tên người rất dài, số hoá đơn 64 ký
 * tự). Chạy thường chỉ kiểm vài bất biến; đặt `BREAK_UI_OUT=<thư mục>` thì ghi HTML từng trạng thái ra đó để dựng
 * trang chụp (CSS build thật + Chrome headless) — chỉ dùng khi dev, không phải một phần của app.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImportForm } from '@/entities/import-form'
import type { Warehouse } from '@/entities/warehouse'
import { paginated, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { mockMobileViewport } from '@/shared/test/viewport'
import { ImportFormsPage } from './ImportFormsPage'

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
  fs.writeFileSync(`${OUT}/${name}.html`, html)
}

const LONG_LAST = 'Nguyễn Phạm Trần Lê Hoàng Phan Huỳnh Vũ Võ Đặng Bùi'
const LONG_FIRST = 'Thị Thanh Thuỷ Tiên Ngọc Bích Khánh Linh Minh Anh Hồng Nhung Diễm Quỳnh'
const INVOICE_64 = 'HD'.padEnd(64, '0123456789')

const form: ImportForm = {
  slug: 'if-1',
  createdAt: '2026-10-12T02:00:00.000Z',
  updatedAt: '2026-10-12T02:00:00.000Z',
  version: 3,
  code: 'PN-0001',
  purchaseOrder: 'PO'.padEnd(64, '9'),
  invoiceCode: INVOICE_64,
  requesterSlug: 'u-long',
  requesterName: `${LONG_LAST} ${LONG_FIRST}`,
  approverSlug: 'u-long',
  approverName: `${LONG_LAST} ${LONG_FIRST}`,
  date: '2026-10-12',
  total: 999_999_999_999,
  file: null,
  note: null,
  status: 'CONFIRMED',
  warehouseSlug: 'w-a',
  items: [],
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
  userName: 's',
  userSlug: 'u-me',
  roleName: 'SUPERVISOR',
  scope: ['IMPORT_FORM_READ', 'IMPORT_FORM_CREATE', 'WAREHOUSE_READ', 'USER_READ'],
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
    mswHttp.get(`${BASE}/warehouses/:w/import-forms`, () => paginated([form])),
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

const ROUTE = `/import-forms?warehouse=w-a&status=CONFIRMED&requester=u-long&approver=u-long&searchBy=invoiceCode&search=${INVOICE_64}`

function renderPage() {
  return renderWithRouter([{ path: '/import-forms', element: <ImportFormsPage /> }], {
    route: ROUTE,
    auth: AUTH,
  })
}

describe('ImportFormsPage — break-ui', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fit.fits = true
  })

  it('desktop: người lập / xác nhận tên rất dài, hoá đơn 64 ký tự', async () => {
    mock()
    renderPage()
    const requester = await screen.findByRole('combobox', { name: 'Người lập' })
    await waitFor(() => expect(requester).toHaveTextContent('Nguyễn'))
    await dump('desktop')
  })

  it('desktop: danh sách người mở ra', async () => {
    mock()
    const { user } = renderPage()
    const requester = await screen.findByRole('combobox', { name: 'Người lập' })
    await waitFor(() => expect(requester).toHaveTextContent('Nguyễn'))
    await user.click(requester)
    await screen.findByRole('option', { name: /A B \(0907654321\)/ })
    await dump('desktop-open')
  })

  it('mobile: chip có người dài', async () => {
    mockMobileViewport()
    mock()
    renderPage()
    const requester = await screen.findByRole('combobox', { name: 'Người lập' })
    await waitFor(() => expect(requester).toHaveTextContent('Nguyễn'))
    await dump('mobile')
  })

  it('desktop: Kho tên rất dài ở đầu trang, không tràn', async () => {
    mock()
    renderPage()
    const picker = await screen.findByRole('combobox', { name: 'Kho' })
    expect(picker).toHaveAttribute('title', expect.stringContaining('Kho trung tâm'))
    expect(picker.closest('[data-slot="toolbar-row"]')).toBeNull()
  })

  it('popover Bộ lọc: nhãn trên mỗi ô, trạng thái là nút bấm, người tên rất dài', async () => {
    fit.fits = false
    mock()
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: /Bộ lọc/ }))
    const panel = await screen.findByRole('dialog', { name: 'Bộ lọc' })
    expect(within(panel).getByRole('button', { name: 'Đã xác nhận' })).toHaveAttribute(
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
    await dump('desktop-popover-page')
  })
})
