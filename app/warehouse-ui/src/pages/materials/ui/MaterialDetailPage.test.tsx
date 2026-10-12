import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import type { Material } from '@/entities/material'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { MaterialDetailPage } from './MaterialDetailPage'

const BASE = 'http://localhost:8085/api/v1'

const material: Material = {
  slug: 'm-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  code: 'VT-01',
  name: 'Xi măng',
  minimumInventory: 10,
  maximumInventory: 100,
  typeSlug: 'mt-1',
  typeCode: 'MT-01',
  typeName: 'Vật liệu',
  baseUnitSlug: 'u-kg',
  baseUnitCode: 'KG',
  baseUnitName: 'Kilogram',
}

const ADMIN: TestAuth = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: ['MATERIAL_READ', 'MATERIAL_UPDATE', 'MATERIAL_DELETE', 'UNIT_READ', 'UNIT_UPDATE'],
}

function field(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement!
}

function renderPage(auth: TestAuth = ADMIN) {
  return renderWithRouter(
    [
      { path: '/materials/:slug', element: <MaterialDetailPage /> },
      { path: '/materials', element: <p>DANH SÁCH VẬT TƯ</p> },
    ],
    { route: '/materials/m-1', auth },
  )
}

beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/materials/m-1`, () => ok(material)),
    mswHttp.get(`${BASE}/materials/m-1/conversion-units`, () =>
      paginated([
        {
          unitSlug: 'u-kg',
          unitCode: 'KG',
          unitName: 'Kilogram',
          conversionRate: 1,
          isBaseUnit: true,
        },
      ]),
    ),
    mswHttp.get(`${BASE}/material-types`, () => paginated([])),
    mswHttp.get(`${BASE}/units`, () => paginated([])),
  )
})

describe('MaterialDetailPage', () => {
  it('tiêu đề, thẻ Tổng quan, bảng quy đổi', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'VT-01 · Xi măng' }),
    ).toBeInTheDocument()
    expect(within(field('Loại vật tư')).getByText('MT-01 · Vật liệu')).toBeInTheDocument()
    expect(within(field('Đơn vị gốc')).getByText('KG · Kilogram')).toBeInTheDocument()
    expect(within(field('Tồn tối đa mặc định')).getByText('100')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Đơn vị quy đổi' }),
    ).toBeInTheDocument()
  })

  it('thiếu UNIT_READ: không bảng quy đổi, không nút Sửa', async () => {
    renderPage({ userName: 'm', roleName: 'MANAGER', scope: ['MATERIAL_READ', 'MATERIAL_UPDATE'] })

    await screen.findByRole('heading', { level: 1, name: 'VT-01 · Xi măng' })
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Đơn vị quy đổi' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
  })

  it('404 → câu báo tại chỗ + link quay lại', async () => {
    server.use(mswHttp.get(`${BASE}/materials/m-1`, () => apiError(404, 100701)))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy vật tư (có thể đã bị xoá).',
    )
    expect(screen.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      '/materials',
    )
  })

  it('xoá xong → về danh sách', async () => {
    server.use(mswHttp.delete(`${BASE}/materials/m-1`, () => ok('m-1')))
    const { user, router } = renderPage()

    // Xoá là nút ngay cạnh Sửa — không còn menu ⋯ chỉ có một mục.
    expect(await screen.findByRole('button', { name: 'Sửa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thao tác khác' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xoá' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xoá' }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/materials'))
  })
})
