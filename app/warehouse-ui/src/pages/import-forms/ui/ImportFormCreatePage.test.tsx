import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import type { Warehouse } from '@/entities/warehouse'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { ImportFormCreatePage } from './ImportFormCreatePage'

const flour: AvailableMaterial = {
  slug: 'm-flour',
  code: 'VT-01',
  name: 'Bột mì',
  baseUnitSlug: 'u-kg',
  quantity: 120,
  supplierSlug: 's-1',
  supplierName: 'NCC Bột',
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      conversionRate: 25,
      isBaseUnit: false,
    },
  ],
}

const BASE = 'http://localhost:8085/api/v1'

function renderPage(isActive: boolean, route = '/import-forms/new?warehouse=w-a') {
  server.use(
    mswHttp.get(`${BASE}/warehouses/w-a`, () =>
      ok({ slug: 'w-a', code: 'KHO-A', name: 'Kho A', isActive } as Warehouse),
    ),
    mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () =>
      paginated([flour]),
    ),
  )
  return renderWithRouter(
    [
      { path: '/import-forms', element: <p>DANH SÁCH</p> },
      { path: '/import-forms/new', element: <ImportFormCreatePage /> },
    ],
    { route, auth: 'admin' },
  )
}

describe('ImportFormCreatePage', () => {
  it('tiêu đề có tên kho, form có mã gợi ý', async () => {
    renderPage(true)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tạo phiếu nhập · Kho A' }),
    ).toBeInTheDocument()
    expect((screen.getByRole('textbox', { name: /^Mã phiếu/ }) as HTMLInputElement).value).toMatch(
      /^PN-\d{8}-\d{4}$/,
    )
  })

  it('kho ngừng hoạt động → báo lỗi, không có form', async () => {
    renderPage(false)
    expect(
      await screen.findByText('Kho đang ngừng hoạt động — không tạo được phiếu mới.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu nháp' })).not.toBeInTheDocument()
  })

  it('thiếu ?warehouse → về danh sách', async () => {
    renderPage(true, '/import-forms/new')
    expect(await screen.findByText('DANH SÁCH')).toBeInTheDocument()
  })
})
