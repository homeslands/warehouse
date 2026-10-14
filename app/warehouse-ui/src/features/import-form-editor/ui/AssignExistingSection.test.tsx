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
  const r = renderWithProviders(
    <AssignExistingSection
      warehouseSlug="w-a"
      search={opts.search ?? 'xi măng'}
      availableSlugs={['m-in']}
      canAssign={opts.canAssign ?? true}
      onAssigned={onAssigned}
    />,
    { auth: 'admin' },
  )
  return { ...r, seen, onAssigned }
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
    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith({ slug: 'm-cement', name: 'Xi măng PCB40' }, false))
    expect(calls).toBe(1)
  })

  it('100802 → onAssigned(material, true)', async () => {
    server.use(mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100802, 'exists')))
    const { user, onAssigned } = setup()
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith({ slug: 'm-cement', name: 'Xi măng PCB40' }, true))
  })

  it('100804 → lỗi tại dòng, không gọi onAssigned', async () => {
    server.use(mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100804, 'inactive')))
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
})
