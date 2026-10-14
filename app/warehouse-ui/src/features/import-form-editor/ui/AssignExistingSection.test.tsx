import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { Material } from '@/entities/material'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { AssignExistingSection } from './AssignExistingSection'

const BASE = 'http://localhost:8085/api/v1'
const mat = (slug: string, code: string, name: string): Material => ({
  slug,
  createdAt: '',
  updatedAt: '',
  code,
  name,
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 'mt-1', code: 'MT', name: 'Vật liệu' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  supplier: null,
})
const cement = mat('m-cement', 'VT-09', 'Xi măng PCB40')
const inWarehouse = mat('m-in', 'VT-01', 'Xi măng trắng')

function setup(opts: { search?: string; canAssign?: boolean } = {}) {
  const seen: URLSearchParams[] = []
  server.use(
    mswHttp.get(`${BASE}/materials`, ({ request }) => {
      seen.push(new URL(request.url).searchParams)
      return paginated([cement, inWarehouse])
    }),
  )
  const onAssigned = vi.fn()
  const onBusyChange = vi.fn()
  const r = renderWithProviders(
    <AssignExistingSection
      warehouseSlug="w-a"
      search={opts.search ?? 'xi măng'}
      availableSlugs={['m-in']}
      canAssign={opts.canAssign ?? true}
      onAssigned={onAssigned}
      onBusyChange={onBusyChange}
    />,
    { auth: 'admin' },
  )
  return { ...r, seen, onAssigned, onBusyChange }
}

describe('AssignExistingSection', () => {
  it('tìm theo tên (debounce), loại vật tư đã ở kho', async () => {
    const { seen } = setup()
    expect(await screen.findByText(/Xi măng PCB40/)).toBeInTheDocument()
    expect(screen.queryByText(/Xi măng trắng/)).not.toBeInTheDocument()
    expect(seen.at(-1)?.get('name')).toBe('xi măng')
  })

  it('gõ giống mã → gửi code viết hoa', async () => {
    const { seen } = setup({ search: 'vt-09' })
    await screen.findByText(/Xi măng PCB40/)
    expect(seen.at(-1)?.get('code')).toBe('VT-09')
  })

  it('ô tìm trống → không gọi API', async () => {
    const { seen } = setup({ search: '  ' })
    await new Promise((r) => setTimeout(r, 400))
    expect(seen).toHaveLength(0)
  })

  it('Gắn vào kho → PUT rồi onAssigned(material, false); bấm nhanh hai lần chỉ một request', async () => {
    let calls = 0
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, async () => {
        calls++
        await new Promise((r) => setTimeout(r, 50))
        return ok({ materialSlug: 'm-cement' })
      }),
    )
    const { user, onAssigned } = setup()
    const btn = await screen.findByRole('button', { name: 'Gắn vào kho' })
    await user.dblClick(btn)
    await waitFor(() =>
      expect(onAssigned).toHaveBeenCalledWith({ slug: 'm-cement', name: 'Xi măng PCB40' }, false),
    )
    expect(calls).toBe(1)
  })

  it('onBusyChange: true suốt lúc gửi + onAssigned, rồi false', async () => {
    const order: string[] = []
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => ok({ materialSlug: 'm-cement' })),
    )
    const { user, onAssigned, onBusyChange } = setup()
    onBusyChange.mockImplementation((b: boolean) => order.push(`busy:${b}`))
    onAssigned.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30))
      order.push('assigned')
    })
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    await waitFor(() => expect(order).toEqual(['busy:true', 'assigned', 'busy:false']))
  })

  it('onBusyChange: lỗi → false', async () => {
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100804, 'inactive')),
    )
    const { user, onBusyChange } = setup()
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false))
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  it('100802 → onAssigned(material, true)', async () => {
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100802, 'exists')),
    )
    const { user, onAssigned } = setup()
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    await waitFor(() =>
      expect(onAssigned).toHaveBeenCalledWith({ slug: 'm-cement', name: 'Xi măng PCB40' }, true),
    )
  })

  it('100804 → lỗi tại dòng, không gọi onAssigned', async () => {
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100804, 'inactive')),
    )
    const { user, onAssigned } = setup()
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kho đang ngừng hoạt động')
    expect(onAssigned).not.toHaveBeenCalled()
  })

  it('thiếu quyền → nút khoá kèm lý do', async () => {
    setup({ canAssign: false })
    const btn = await screen.findByRole('button', { name: 'Gắn vào kho' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAccessibleDescription('Cần quyền sửa vật tư và sửa kho — liên hệ quản trị.')
  })

  it('100701 → cảnh báo vẫn hiện dù kết quả tải lại không còn vật tư đó', async () => {
    let gets = 0
    server.use(
      mswHttp.get(`${BASE}/materials`, () => {
        gets++
        return paginated(gets === 1 ? [cement] : [])
      }),
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(404, 100701, 'gone')),
    )
    const onAssigned = vi.fn()
    const { user } = renderWithProviders(
      <AssignExistingSection
        warehouseSlug="w-a"
        search="xi măng"
        availableSlugs={[]}
        canAssign
        onAssigned={onAssigned}
      />,
      { auth: 'admin' },
    )
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('VT-09 · Xi măng PCB40:')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Gắn vào kho' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onAssigned).not.toHaveBeenCalled()
  })

  it('debounce thật: gõ nhanh chỉ gửi một request cho giá trị cuối', async () => {
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(`${BASE}/materials`, ({ request }) => {
        seen.push(new URL(request.url).searchParams)
        return paginated([cement])
      }),
    )
    const el = (search: string) => (
      <AssignExistingSection
        warehouseSlug="w-a"
        search={search}
        availableSlugs={[]}
        canAssign
        onAssigned={vi.fn()}
      />
    )
    const { rerender } = renderWithProviders(el(''), { auth: 'admin' })
    rerender(el('x'))
    rerender(el('xi'))
    rerender(el('xi m'))
    rerender(el('xi măng'))
    expect(await screen.findByText(/Xi măng PCB40/)).toBeInTheDocument()
    expect(seen).toHaveLength(1)
    expect(seen[0].get('name')).toBe('xi măng')
  })
})
