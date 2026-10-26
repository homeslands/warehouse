import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { MaterialConversionUnit } from '@/entities/material'
import { ok, paginated } from '@/shared/test/api'
import { confirmStep } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { MaterialConversionUnits } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const rows: MaterialConversionUnit[] = [
  { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
  {
    unitSlug: 'u-bag',
    unitCode: 'BAG',
    unitName: 'Bao 50kg',
    conversionRate: 50,
    isBaseUnit: false,
  },
]
const material = { slug: 'm-1', baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' } }

/** Ô tỉ lệ tách số ra một thẻ riêng — so theo chữ của cả ô. Tỉ lệ có ở cột Tỉ lệ lẫn dòng phụ khung hẹp. */
const rateText = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'SPAN' && el.children.length > 0 && el.textContent === text

describe('MaterialConversionUnits', () => {
  it('dòng đơn vị gốc không có thao tác; dòng khác có Sửa tỉ lệ / Gỡ', async () => {
    server.use(mswHttp.get(`${BASE}/materials/m-1/conversion-units`, () => paginated(rows)))
    const { user } = renderWithProviders(<MaterialConversionUnits material={material} canManage />)

    expect((await screen.findAllByText(rateText('1 BAG = 50 KG'))).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Thao tác với đơn vị KG' })).not.toBeInTheDocument()
    // Kiểm trước khi mở menu: menu Radix mở thì phần còn lại của trang bị `aria-hidden`.
    expect(screen.getByRole('button', { name: 'Thêm đơn vị quy đổi' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thao tác với đơn vị BAG' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Sửa tỉ lệ' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Gỡ' })).toBeInTheDocument()
  })

  it('không có quyền quản lý: không nút Thêm, không cột thao tác', async () => {
    server.use(mswHttp.get(`${BASE}/materials/m-1/conversion-units`, () => paginated(rows)))
    renderWithProviders(<MaterialConversionUnits material={material} canManage={false} />)

    expect((await screen.findAllByText(rateText('1 BAG = 50 KG'))).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Thêm đơn vị quy đổi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Thao tác với đơn vị/ })).not.toBeInTheDocument()
  })

  it('vật tư chưa có đơn vị gốc: không gọi API, hiện câu báo', () => {
    const called = vi.fn()
    server.use(
      mswHttp.get(`${BASE}/materials/m-1/conversion-units`, () => {
        called()
        return paginated([])
      }),
    )
    renderWithProviders(
      <MaterialConversionUnits material={{ slug: 'm-1', baseUnit: null }} canManage />,
    )

    expect(
      screen.getByText(
        'Vật tư chưa có đơn vị gốc — sửa vật tư để chọn trước khi thêm đơn vị quy đổi.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm đơn vị quy đổi' })).not.toBeInTheDocument()
    expect(called).not.toHaveBeenCalled()
  })

  it('đổi số dòng → quay về trang 1', async () => {
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(`${BASE}/materials/m-1/conversion-units`, ({ request }) => {
        const params = new URL(request.url).searchParams
        seen.push(params)
        return paginated(rows, {
          page: Number(params.get('page')),
          size: Number(params.get('size')),
          total: 25,
        })
      }),
    )
    const { user } = renderWithProviders(<MaterialConversionUnits material={material} canManage />)
    await screen.findAllByText(rateText('1 BAG = 50 KG'))

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(seen.at(-1)?.get('page')).toBe('2'))
    await user.click(screen.getByRole('combobox', { name: 'Số dòng mỗi trang' }))
    await user.click(await screen.findByRole('option', { name: '20' }))

    await waitFor(() => expect(seen.at(-1)?.get('size')).toBe('20'))
    expect(seen.at(-1)?.get('page')).toBe('1')
    expect(seen.some((p) => p.get('page') === '2' && p.get('size') === '20')).toBe(false)
  })

  it('gắn đơn vị thành công → bảng tải lại', async () => {
    let listCalls = 0
    server.use(
      mswHttp.get(`${BASE}/materials/m-1/conversion-units`, () => {
        listCalls += 1
        return paginated(rows)
      }),
      mswHttp.get(`${BASE}/materials/m-1/conversion-units/available`, () =>
        paginated([{ slug: 'u-box', code: 'BOX', name: 'Thùng' }]),
      ),
      mswHttp.post(`${BASE}/materials/m-1/conversion-units`, () =>
        ok({
          unitSlug: 'u-box',
          unitCode: 'BOX',
          unitName: 'Thùng',
          conversionRate: 12,
          isBaseUnit: false,
        }),
      ),
    )
    const { user } = renderWithProviders(<MaterialConversionUnits material={material} canManage />)
    await screen.findAllByText(rateText('1 BAG = 50 KG'))
    expect(listCalls).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Thêm đơn vị quy đổi' }))
    await user.click(await screen.findByRole('combobox', { name: 'Đơn vị' }))
    await user.click(await screen.findByText('BOX · Thùng'))
    await user.type(screen.getByLabelText('Tỉ lệ'), '12')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmStep(user, 'Xác nhận gắn đơn vị')

    await waitFor(() => expect(listCalls).toBe(2))
  })
})
