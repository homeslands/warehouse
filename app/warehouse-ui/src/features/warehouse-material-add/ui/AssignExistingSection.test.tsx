import { screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
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
  suppliers: [],
  warehouses: [],
  units: [],
})
const cement = mat('m-cement', 'VT-09', 'Xi măng PCB40')
const inWarehouse: Material = {
  ...mat('m-in', 'VT-01', 'Xi măng trắng'),
  warehouses: [{ slug: 'w-a', code: 'KA', name: 'Kho A', quantity: 0, availableQuantity: 0 }],
}

function setup(
  opts: {
    search?: string
    canAssign?: boolean
    locked?: boolean
    found?: Material[]
    total?: number
  } = {},
) {
  const seen: URLSearchParams[] = []
  server.use(
    mswHttp.get(`${BASE}/materials`, ({ request }) => {
      seen.push(new URL(request.url).searchParams)
      const items = opts.found ?? [cement, inWarehouse]
      return paginated(items, { size: 50, total: opts.total ?? items.length })
    }),
  )
  const onAssigned = vi.fn()
  const onBusyChange = vi.fn()
  const r = renderWithProviders(
    <AssignExistingSection
      warehouseSlug="w-a"
      search={opts.search ?? 'xi măng'}
      canAssign={opts.canAssign ?? true}
      locked={opts.locked}
      onAssigned={onAssigned}
      onBusyChange={onBusyChange}
    />,
    { auth: 'admin' },
  )
  return { ...r, seen, onAssigned, onBusyChange }
}

/** Gắn vật tư = bấm "Gắn vào kho" (mở bước nhập ngưỡng của dòng) rồi "Xác nhận gắn" (để trống = theo ngưỡng vật tư). */
async function assignFirst(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
  await user.click(await screen.findByRole('button', { name: 'Xác nhận gắn' }))
}

describe('AssignExistingSection', () => {
  it('tìm theo tên (debounce), loại vật tư đã ở kho', async () => {
    const { seen } = setup()
    expect(await screen.findByText(/Xi măng PCB40/)).toBeInTheDocument()
    expect(screen.queryByText(/Xi măng trắng/)).not.toBeInTheDocument()
    expect(seen.at(-1)?.get('name')).toBe('xi măng')
  })

  it('nhiều nhà cung cấp → 2 tên đầu + "+N", đủ tên ở title', async () => {
    const ncc = (slug: string, name: string) => ({ slug, code: slug.toUpperCase(), name })
    setup({
      found: [
        {
          ...cement,
          hasSupplier: true,
          suppliers: [ncc('s-1', 'NCC Bột'), ncc('s-2', 'NCC Đường'), ncc('s-3', 'NCC Muối')],
        },
      ],
    })
    const shown = await screen.findByText('NCC Bột, NCC Đường')
    expect(shown.parentElement).toHaveTextContent('NCC Bột, NCC Đường +1')
    expect(shown.closest('[title]')).toHaveAttribute('title', 'NCC Bột, NCC Đường, NCC Muối')
  })

  it('có units → dòng phụ liệt kê mã mọi đơn vị, đơn vị gốc trước', async () => {
    const unit = (unitCode: string, conversionRate: number, isBaseUnit: boolean) => ({
      unitSlug: `u-${unitCode.toLowerCase()}`,
      unitCode,
      unitName: unitCode,
      conversionRate,
      isBaseUnit,
    })
    setup({
      found: [
        {
          ...cement,
          units: [unit('KG', 1, true), unit('BAO', 50, false), unit('THUNG', 20, false)],
        },
      ],
    })
    expect(await screen.findByText('Vật liệu · KG, BAO, THUNG')).toBeInTheDocument()
  })

  it('units rỗng nhưng có baseUnit → vẫn hiện mã đơn vị gốc', async () => {
    setup({ found: [{ ...cement, units: [] }] })
    expect(await screen.findByText('Vật liệu · KG')).toBeInTheDocument()
  })

  it('gõ giống mã → gửi code viết hoa', async () => {
    const { seen } = setup({ search: 'vt-09' })
    await screen.findByText(/Xi măng PCB40/)
    expect(seen.at(-1)?.get('code')).toBe('VT-09')
  })

  it('gõ ký tự BE không nhận → bỏ ký tự đó trước khi gửi', async () => {
    const { seen } = setup({ search: 'xi măng (PCB40)' })
    await screen.findByText(/Xi măng PCB40/)
    expect(seen.at(-1)?.get('name')).toBe('xi măng')
  })

  it('chỉ toàn ký tự bị bỏ (@@@) → không gọi API, hiện câu gợi ý như ô trống', async () => {
    const { seen } = setup({ search: '@@@' })
    expect(
      await screen.findByText('Gõ mã hoặc tên để tìm vật tư trong danh mục.'),
    ).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 400))
    expect(seen).toHaveLength(0)
  })

  it('ô tìm trống → tải sẵn 50 vật tư đầu của danh mục (không lọc), bỏ vật tư đã ở kho', async () => {
    const { seen } = setup({ search: '  ' })
    expect(await screen.findByText(/Xi măng PCB40/)).toBeInTheDocument()
    expect(screen.queryByText(/Xi măng trắng/)).not.toBeInTheDocument()
    const params = seen.at(-1)!
    expect(params.get('size')).toBe('50')
    expect(params.has('name')).toBe(false)
    expect(params.has('code')).toBe(false)
    // Danh mục không có thêm → không có dòng "gõ để tìm thêm".
    expect(screen.queryByText(/gõ mã hoặc tên để tìm thêm/)).not.toBeInTheDocument()
  })

  it('ô tìm trống, danh mục nhiều hơn số đã tải → dòng "Hiện N vật tư đầu… gõ để tìm thêm"', async () => {
    setup({ search: '', total: 120 })
    expect(
      await screen.findByText(
        // N = số vật tư thực tải về (dữ liệu giả có 2; thật thì tối đa 50).
        'Hiện 2 vật tư đầu của danh mục — gõ mã hoặc tên để tìm thêm.',
      ),
    ).toBeInTheDocument()
  })

  it('ô tìm trống, kho đã có hết vật tư tải về → câu "không còn vật tư nào chưa có ở kho"', async () => {
    setup({ search: '', found: [inWarehouse] })
    expect(await screen.findByText(/Không tìm thấy vật tư nào chưa có ở kho/)).toBeInTheDocument()
  })

  it('Gắn vào kho → Xác nhận gắn → PUT rồi onAssigned(material, false); bấm nhanh hai lần chỉ một request', async () => {
    let calls = 0
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, async () => {
        calls++
        await new Promise((r) => setTimeout(r, 50))
        return ok({ materialSlug: 'm-cement' })
      }),
    )
    const { user, onAssigned } = setup()
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    await user.dblClick(screen.getByRole('button', { name: 'Xác nhận gắn' }))
    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith(cement, false))
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
    await assignFirst(user)
    await waitFor(() => expect(order).toEqual(['busy:true', 'assigned', 'busy:false']))
  })

  it('onBusyChange: lỗi → false', async () => {
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100804, 'inactive')),
    )
    const { user, onBusyChange } = setup()
    await assignFirst(user)
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false))
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  it('100802 → onAssigned(material, true)', async () => {
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100802, 'exists')),
    )
    const { user, onAssigned } = setup()
    await assignFirst(user)
    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith(cement, true))
  })

  it('100804 → lỗi tại dòng, không gọi onAssigned', async () => {
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100804, 'inactive')),
    )
    const { user, onAssigned } = setup()
    await assignFirst(user)
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
        canAssign
        onAssigned={onAssigned}
      />,
      { auth: 'admin' },
    )
    await assignFirst(user)
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
      <AssignExistingSection warehouseSlug="w-a" search={search} canAssign onAssigned={vi.fn()} />
    )
    const { rerender } = renderWithProviders(el(''), { auth: 'admin' })
    rerender(el('x'))
    rerender(el('xi'))
    rerender(el('xi m'))
    rerender(el('xi măng'))
    expect(await screen.findByText(/Xi măng PCB40/)).toBeInTheDocument()
    // Lúc mở (ô trống) có một request liệt kê danh mục; các lần gõ nhanh chỉ thêm MỘT request cho giá trị cuối.
    await waitFor(() => expect(seen.filter((p) => p.has('name'))).toHaveLength(1))
    expect(seen.filter((p) => p.has('name'))[0].get('name')).toBe('xi măng')
    expect(seen.filter((p) => !p.has('name') && !p.has('code'))).toHaveLength(1)
  })

  it('onAssigned chạy xong rồi mới mở khoá: bấm dòng khác trong lúc đó không gửi PUT thứ hai', async () => {
    let puts = 0
    server.use(
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => {
        puts++
        return ok({ materialSlug: 'm-cement' })
      }),
    )
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const other = mat('m-other', 'VT-10', 'Xi măng đen')
    const { user, onAssigned } = setup({ found: [cement, other] })
    onAssigned.mockImplementation(() => gate)
    await user.click((await screen.findAllByRole('button', { name: 'Gắn vào kho' }))[0])
    await user.click(screen.getByRole('button', { name: 'Xác nhận gắn' }))
    await waitFor(() => expect(onAssigned).toHaveBeenCalledTimes(1))
    // isPending đã false nhưng onAssigned chưa xong → vẫn khoá: mở dòng khác và xác nhận cũng không gửi PUT thứ hai.
    await user.click(screen.getAllByRole('button', { name: 'Gắn vào kho' }).at(-1)!)
    await user.click(screen.getByRole('button', { name: 'Xác nhận gắn' }))
    expect(puts).toBe(1)
    release()
    await waitFor(() => expect(onAssigned).toHaveBeenCalledTimes(1))
  })

  it('locked → mọi nút Gắn vào kho bị khoá', async () => {
    setup({ locked: true })
    expect(await screen.findByRole('button', { name: 'Gắn vào kho' })).toBeDisabled()
  })

  it('vật tư chưa có đơn vị gốc → nút khoá kèm lý do', async () => {
    const legacy = { ...mat('m-old', 'VT-77', 'Xi măng cũ'), baseUnit: null }
    setup({ found: [legacy] })
    const btn = await screen.findByRole('button', { name: 'Gắn vào kho' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAccessibleDescription('chưa có đơn vị gốc')
  })

  it('một kết quả duy nhất đã có ở kho → hiện câu trung tính', async () => {
    setup({ found: [inWarehouse] })
    expect(await screen.findByText('Vật tư này đã có ở kho.')).toBeInTheDocument()
  })

  it('nhiều kết quả đều đã có ở kho → báo không tìm thấy', async () => {
    setup({
      found: [inWarehouse, { ...inWarehouse, slug: 'm-in2', code: 'VT-02', name: 'Xi măng xám' }],
    })
    expect(await screen.findByText(/Không tìm thấy vật tư nào chưa có ở kho/)).toBeInTheDocument()
    expect(screen.queryByText('Vật tư này đã có ở kho.')).not.toBeInTheDocument()
  })

  it('vật tư thuộc kho KHÁC vẫn là ứng viên; thuộc chính kho này thì loại', async () => {
    const otherWh = {
      ...mat('m-other', 'VT-11', 'Xi măng xám'),
      warehouses: [{ slug: 'w-b', code: 'KB', name: 'Kho B', quantity: 5, availableQuantity: 5 }],
    }
    setup({ found: [otherWh, inWarehouse] })
    expect(await screen.findByText(/Xi măng xám/)).toBeInTheDocument()
    expect(screen.queryByText(/Xi măng trắng/)).not.toBeInTheDocument()
  })

  describe('bước nhập ngưỡng riêng của kho', () => {
    const steel: Material = {
      ...mat('m-steel', 'VT-07', 'Thép'),
      minimumInventory: 10,
      maximumInventory: 100,
    }

    it('hiện ngưỡng mặc định của vật tư; nhập tối đa → PUT chỉ kèm ngưỡng đã nhập', async () => {
      let body: unknown
      server.use(
        mswHttp.put(`${BASE}/warehouses/w-a/materials`, async ({ request }) => {
          body = await request.json()
          return ok({ materialSlug: 'm-steel' })
        }),
      )
      const { user, onAssigned } = setup({ found: [steel] })
      await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
      const step = screen.getByRole('group', { name: 'Ngưỡng tồn riêng của kho này' })
      expect(step).toHaveTextContent('Mặc định của vật tư: tối thiểu 10 · tối đa 100')
      expect(screen.getByRole('textbox', { name: 'Tồn tối thiểu' })).toHaveFocus()
      expect(screen.getByRole('textbox', { name: 'Tồn tối đa' })).toHaveAttribute(
        'placeholder',
        '100',
      )
      await user.type(screen.getByRole('textbox', { name: 'Tồn tối đa' }), '50')
      await user.click(screen.getByRole('button', { name: 'Xác nhận gắn' }))
      await waitFor(() => expect(onAssigned).toHaveBeenCalledWith(steel, false))
      expect(body).toEqual({ materialSlug: 'm-steel', maximumInventory: 50 })
    })

    it('vật tư chưa đặt ngưỡng → hiện "Chưa đặt"', async () => {
      const { user } = setup({ found: [cement] })
      await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
      expect(screen.getByRole('group', { name: 'Ngưỡng tồn riêng của kho này' })).toHaveTextContent(
        'tối thiểu Chưa đặt · tối đa Chưa đặt',
      )
    })

    it('tối đa riêng < tối thiểu mặc định → lỗi tại ô, không PUT; sửa đúng thì lỗi tự mất và gắn được', async () => {
      let puts = 0
      server.use(
        mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => {
          puts++
          return ok({ materialSlug: 'm-steel' })
        }),
      )
      const { user, onAssigned } = setup({ found: [steel] })
      await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
      const max = screen.getByRole('textbox', { name: 'Tồn tối đa' })
      await user.type(max, '5')
      await user.click(screen.getByRole('button', { name: 'Xác nhận gắn' }))
      expect(max).toHaveAccessibleDescription('Tồn tối đa phải lớn hơn hoặc bằng tồn tối thiểu')
      expect(puts).toBe(0)
      await user.type(max, '0')
      expect(max).not.toHaveAccessibleDescription()
      await user.click(screen.getByRole('button', { name: 'Xác nhận gắn' }))
      await waitFor(() => expect(onAssigned).toHaveBeenCalled())
      expect(puts).toBe(1)
    })

    it('Huỷ → đóng bước nhập, không PUT, nút "Gắn vào kho" hiện lại', async () => {
      const { user } = setup({ found: [steel] })
      await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
      await user.click(screen.getByRole('button', { name: 'Huỷ' }))
      expect(
        screen.queryByRole('group', { name: 'Ngưỡng tồn riêng của kho này' }),
      ).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Gắn vào kho' })).toBeInTheDocument()
    })

    it('100811 từ backend → lỗi tại ô đã nhập, không gọi onAssigned', async () => {
      server.use(
        mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => apiError(400, 100811, 'range')),
      )
      const { user, onAssigned } = setup({ found: [steel] })
      await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
      const max = screen.getByRole('textbox', { name: 'Tồn tối đa' })
      await user.type(max, '50')
      await user.click(screen.getByRole('button', { name: 'Xác nhận gắn' }))
      await waitFor(() =>
        expect(max).toHaveAccessibleDescription('Tồn tối đa phải lớn hơn hoặc bằng tồn tối thiểu'),
      )
      expect(onAssigned).not.toHaveBeenCalled()
    })
  })
})
