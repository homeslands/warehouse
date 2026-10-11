import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Unit } from '@/entities/unit'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { UnitsPage } from './UnitsPage'

const BASE = 'http://localhost:8085/api/v1'

const kg: Unit = {
  slug: 'u-kg',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'KG',
  name: 'Kilogram',
  materialCount: { asBaseUnit: 2, asConversionUnit: 2, total: 2 },
}
const box: Unit = {
  ...kg,
  slug: 'u-box',
  code: 'BOX',
  name: 'Thùng',
  materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
}

const ADMIN = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: ['UNIT_READ', 'UNIT_CREATE', 'UNIT_UPDATE', 'UNIT_DELETE'],
}

/** Trả `[kg, box]` khi không lọc; có lọc thì trả rỗng — đủ để thấy câu báo trống. */
function capture() {
  const seen: URLSearchParams[] = []
  server.use(
    mswHttp.get(`${BASE}/units`, ({ request }) => {
      const params = new URL(request.url).searchParams
      seen.push(params)
      return paginated(params.has('code') || params.has('name') ? [] : [kg, box])
    }),
  )
  return seen
}

describe('UnitsPage', () => {
  it('ADMIN: tiêu đề, nút Thêm, dòng dữ liệu; gõ mã có gạch → gửi code viết hoa', async () => {
    const seen = capture()
    const { user } = renderWithProviders(<UnitsPage />, { auth: ADMIN, route: '/units' })

    expect(await screen.findByRole('heading', { name: 'Đơn vị', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm đơn vị' })).toBeInTheDocument()
    expect(await screen.findByText('Kilogram')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Tên hoặc mã đơn vị…'), 'kg-1')
    await waitFor(() => expect(seen.at(-1)?.get('code')).toBe('KG-1'))
    expect(seen.at(-1)?.has('name')).toBe(false)
  })

  it('mã toàn chữ hoa (KG) → tìm theo mã; trống thì cho đổi sang tìm theo tên', async () => {
    const seen = capture()
    const { user } = renderWithProviders(<UnitsPage />, { auth: ADMIN, route: '/units' })
    await screen.findByText('Kilogram')

    await user.type(screen.getByPlaceholderText('Tên hoặc mã đơn vị…'), 'KG')
    await waitFor(() => expect(seen.at(-1)?.get('code')).toBe('KG'))
    expect(
      await screen.findByText(/Không có đơn vị nào mang mã “KG” \(mã phải nhập đủ\)\./),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tìm theo tên' }))
    await waitFor(() => expect(seen.at(-1)?.get('name')).toBe('KG'))
    expect(seen.at(-1)?.has('code')).toBe(false)
  })

  it('chữ thường (kg) → tìm theo tên; trống thì cho đổi sang tìm theo mã', async () => {
    const seen = capture()
    const { user } = renderWithProviders(<UnitsPage />, { auth: ADMIN, route: '/units' })
    await screen.findByText('Kilogram')

    await user.type(screen.getByPlaceholderText('Tên hoặc mã đơn vị…'), 'kg')
    await waitFor(() => expect(seen.at(-1)?.get('name')).toBe('kg'))

    await user.click(await screen.findByRole('button', { name: 'Tìm theo mã' }))
    await waitFor(() => expect(seen.at(-1)?.get('code')).toBe('KG'))
  })

  it('đơn vị đang dùng → mục Xoá bị khoá kèm lý do; đơn vị chưa dùng → Xoá bấm được', async () => {
    capture()
    const { user } = renderWithProviders(<UnitsPage />, { auth: ADMIN, route: '/units' })

    await user.click(await screen.findByRole('button', { name: 'Thao tác với Kilogram' }))
    const menu = await screen.findByRole('menu')
    const del = within(menu).getByRole('menuitem', { name: 'Xoá' })
    expect(del).toHaveAttribute('aria-disabled', 'true')
    expect(del).toHaveAccessibleDescription(
      'Đang được 2 vật tư dùng — đổi đơn vị gốc hoặc gỡ đơn vị quy đổi ở các vật tư đó trước khi xoá',
    )
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Thùng' }))
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Xoá' }),
    ).not.toHaveAttribute('aria-disabled')
  })

  it('chỉ UNIT_READ: không nút Thêm, không cột thao tác', async () => {
    capture()
    renderWithProviders(<UnitsPage />, {
      auth: { userName: 'm', roleName: 'MANAGER', scope: ['UNIT_READ'] },
      route: '/units',
    })

    expect(await screen.findByText('Kilogram')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm đơn vị' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Thao tác với/ })).not.toBeInTheDocument()
  })
})
