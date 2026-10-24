import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormMaterialPicker } from './ImportFormMaterialPicker'

const KG = {
  unitSlug: 'u-kg',
  unitCode: 'KG',
  unitName: 'Kilogram',
  conversionRate: 1,
  isBaseUnit: true,
}

const flour: AvailableMaterial = {
  slug: 'm-flour',
  code: 'VT-01',
  name: 'Bột mì',
  baseUnitSlug: 'u-kg',
  quantity: 120,
  suppliers: [
    { slug: 's-1', code: 'NCC-01', name: 'Minh Phát' },
    { slug: 's-2', code: 'NCC-02', name: 'Hoà Phát' },
    { slug: 's-3', code: 'NCC-03', name: 'An Khang' },
  ],
  units: [
    KG,
    {
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      conversionRate: 25,
      isBaseUnit: false,
    },
  ],
}
const sugar: AvailableMaterial = {
  slug: 'm-sugar',
  code: 'VT-02',
  name: 'Đường',
  baseUnitSlug: 'u-kg',
  quantity: 0,
  suppliers: [],
  units: [KG],
}
const salt: AvailableMaterial = { ...sugar, slug: 'm-salt', code: 'VT-03', name: 'Muối' }
const noBase: AvailableMaterial = {
  ...sugar,
  slug: 'm-nobase',
  code: 'VT-04',
  name: 'Chưa có đơn vị',
  baseUnitSlug: null,
  units: [],
}
const steel: AvailableMaterial = {
  slug: 'm-steel',
  code: 'VT-07',
  name: 'Thép cuộn',
  baseUnitSlug: 'u-ton',
  quantity: 8,
  suppliers: [],
  units: [
    { unitSlug: 'u-ton', unitCode: 'TON', unitName: 'Tấn', conversionRate: 1, isBaseUnit: true },
  ],
}

const URL_AVAILABLE = 'http://localhost:8085/api/v1/warehouses/w-a/import-forms/available-materials'
const NAMES: Record<string, string> = { 's-1': 'Minh Phát', 's-2': 'Hoà Phát' }

function renderPicker(props: Partial<Parameters<typeof ImportFormMaterialPicker>[0]> = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  const view = renderWithProviders(
    <ImportFormMaterialPicker
      open
      onOpenChange={onOpenChange}
      warehouseSlug="w-a"
      materials={[flour, sugar, salt, noBase]}
      supplierName={(slug) => NAMES[slug] ?? slug}
      existingSlugs={new Set()}
      capacity={200}
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { ...view, onConfirm, onOpenChange }
}

describe('ImportFormMaterialPicker', () => {
  it('hàng: mã, tên, tồn + đơn vị gốc, các đơn vị, NCC 1 tên + "+N"; nhóm theo bên bán đầu phiếu', () => {
    renderPicker({ headerSupplierSlug: 's-1' })
    const dialog = screen.getByRole('dialog', { name: 'Chọn vật tư' })
    expect(dialog).toHaveTextContent(
      'Tick các vật tư cần nhập — mỗi vật tư thành một dòng với đơn vị gốc.',
    )
    const groups = within(dialog).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Hàng thường mua của Minh Phát',
      'Vật tư khác trong kho',
    ])
    const row = within(groups[0] as HTMLElement).getByTestId('picker-row-m-flour')
    expect(within(row).getByText('VT-01')).toBeInTheDocument()
    expect(within(row).getByText(/Bột mì/)).toBeInTheDocument()
    // Số và đơn vị là hai span (số không gãy giữa chữ số) — kiểm cả ô.
    expect(within(row).getByText('120').parentElement).toHaveTextContent('120 KG')
    expect(within(row).getByText('KG, BAG')).toBeInTheDocument()
    // Cột NCC gọn: 1 tên + "+N" (tên pháp nhân dài làm hàng cao), đủ tên ở title / trình đọc màn hình.
    expect(within(row).getByText('Minh Phát')).toBeInTheDocument()
    expect(within(row).getByText(/\+2/)).toBeInTheDocument()
    expect(within(row).getByTitle('Minh Phát, Hoà Phát, An Khang')).toBeInTheDocument()
  })

  it('vật tư đã có trong phiếu → ô tick khoá + "đã có"; chưa có đơn vị gốc → khoá', () => {
    renderPicker({ existingSlugs: new Set(['m-flour']) })
    const added = screen.getByRole('checkbox', { name: /VT-01 · Bột mì/ })
    expect(added).toBeDisabled()
    expect(within(screen.getByTestId('picker-row-m-flour')).getByText('đã có')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /VT-04/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /VT-02 · Đường/ })).toBeEnabled()
  })

  it('tick 2 → "Thêm 2 dòng" → onConfirm đúng 2 vật tư theo thứ tự hiển thị rồi đóng', async () => {
    const { user, onConfirm, onOpenChange } = renderPicker()
    const add = screen.getByRole('button', { name: 'Thêm 0 dòng' })
    expect(add).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /VT-03 · Muối/ }))
    await user.click(screen.getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    await user.click(screen.getByRole('button', { name: 'Thêm 2 dòng' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0]?.[0].map((m: AvailableMaterial) => m.slug)).toEqual([
      'm-flour',
      'm-salt',
    ])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('capacity 2 < số vật tư tick được (3) → câu giới hạn hiện sẵn, đếm lùi khi tick; đủ thì khoá ô chưa tick', async () => {
    const { user } = renderPicker({ capacity: 2 })
    expect(screen.getByText('Phiếu tối đa 200 dòng — còn chọn được 2')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    expect(screen.getByText('Phiếu tối đa 200 dòng — còn chọn được 1')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /VT-02 · Đường/ })).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: /VT-02 · Đường/ }))
    const limit = screen.getByText('Phiếu tối đa 200 dòng — còn chọn được 0')
    const salt = screen.getByRole('checkbox', { name: /VT-03 · Muối/ })
    expect(salt).toBeDisabled()
    expect(salt).toHaveAccessibleDescription(limit.textContent ?? '')
    expect(screen.getByRole('checkbox', { name: /VT-01 · Bột mì/ })).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    expect(salt).toBeEnabled()
    expect(screen.getByText('Phiếu tối đa 200 dòng — còn chọn được 1')).toBeInTheDocument()
  })

  it('capacity ≥ số vật tư tick được → không có câu giới hạn (giới hạn không chặn được gì)', () => {
    // 4 vật tư, 1 không có đơn vị gốc, 1 đã có → chỉ 2 tick được.
    renderPicker({ capacity: 2, existingSlugs: new Set(['m-flour']) })
    expect(screen.queryByText(/Phiếu tối đa 200 dòng/)).not.toBeInTheDocument()
  })

  it('tìm "thep" → hỏi BE và hiện kết quả không có trong danh sách tải sẵn; tick được và trả về', async () => {
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(URL_AVAILABLE, ({ request }) => {
        seen.push(new URL(request.url).searchParams)
        return paginated([steel], { size: 50 })
      }),
    )
    const { user, onConfirm } = renderPicker()
    await user.type(screen.getByRole('textbox', { name: 'Tìm theo mã hoặc tên' }), 'thep')
    const box = await screen.findByRole('checkbox', { name: /VT-07 · Thép cuộn/ })
    expect(seen.at(-1)?.get('name')).toBe('thep')
    expect(screen.queryByRole('checkbox', { name: /VT-01/ })).not.toBeInTheDocument()
    await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Thêm 1 dòng' }))
    expect(onConfirm.mock.calls[0]?.[0]).toEqual([steel])
  })

  it('đóng rồi mở lại → bỏ chọn, ô tìm trống', async () => {
    server.use(mswHttp.get(URL_AVAILABLE, () => paginated([flour], { size: 50 })))
    const onConfirm = vi.fn()
    const props = {
      warehouseSlug: 'w-a',
      materials: [flour, sugar],
      supplierName: (slug: string) => slug,
      existingSlugs: new Set<string>(),
      capacity: 200,
      onConfirm,
      onOpenChange: () => {},
    }
    const { user, rerender } = renderWithProviders(<ImportFormMaterialPicker open {...props} />)
    await user.click(screen.getByRole('checkbox', { name: /VT-01/ }))
    await user.type(screen.getByRole('textbox', { name: 'Tìm theo mã hoặc tên' }), 'b')
    rerender(<ImportFormMaterialPicker open={false} {...props} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    rerender(<ImportFormMaterialPicker open {...props} />)
    expect(screen.getByRole('textbox', { name: 'Tìm theo mã hoặc tên' })).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: /VT-01/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Thêm 0 dòng' })).toBeDisabled()
  })

  it('thứ tự trả về không phụ thuộc ô tìm: theo danh sách tải sẵn (đã nhóm), rồi vật tư chỉ có trong kết quả tìm theo thứ tự tick', async () => {
    const cement: AvailableMaterial = { ...sugar, slug: 'm-cement', code: 'VT-09', name: 'Xi măng' }
    server.use(
      mswHttp.get(URL_AVAILABLE, ({ request }) => {
        const name = new URL(request.url).searchParams.get('name')
        return paginated(name === 'xi' ? [cement] : name === 'thep' ? [steel] : [], { size: 50 })
      }),
    )
    // Bên bán s-2: Bột mì (hàng thường mua) đứng đầu dù nằm sau trong `materials`.
    const { user, onConfirm } = renderPicker({
      headerSupplierSlug: 's-2',
      materials: [sugar, salt, flour],
    })
    const searchBox = screen.getByRole('textbox', { name: 'Tìm theo mã hoặc tên' })
    await user.click(screen.getByRole('checkbox', { name: /VT-03 · Muối/ }))
    await user.type(searchBox, 'xi')
    await user.click(await screen.findByRole('checkbox', { name: /VT-09 · Xi măng/ }))
    await user.clear(searchBox)
    await user.click(screen.getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    await user.type(searchBox, 'thep')
    await user.click(await screen.findByRole('checkbox', { name: /VT-07 · Thép cuộn/ }))
    // Xác nhận khi ô tìm vẫn đang là "thep".
    await user.click(screen.getByRole('button', { name: 'Thêm 4 dòng' }))
    expect(onConfirm.mock.calls[0]?.[0].map((m: AvailableMaterial) => m.slug)).toEqual([
      'm-flour',
      'm-salt',
      'm-cement',
      'm-steel',
    ])
  })

  it('hết chỗ (capacity 0) → không có footer "Thêm vật tư vào kho"', () => {
    renderPicker({
      capacity: 0,
      addMaterialFooter: () => <button type="button">Footer giả</button>,
    })
    expect(screen.queryByRole('button', { name: 'Footer giả' })).not.toBeInTheDocument()
  })

  it('footer "Thêm vật tư vào kho" do bên gọi truyền hiện trong hộp', () => {
    renderPicker({ addMaterialFooter: () => <button type="button">Footer giả</button> })
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Footer giả' }),
    ).toBeInTheDocument()
  })

  it('footer nhận chữ đang tìm (đã cắt khoảng trắng)', async () => {
    server.use(mswHttp.get(URL_AVAILABLE, () => paginated([steel], { size: 50 })))
    const { user } = renderPicker({
      addMaterialFooter: (search) => <button type="button">Footer [{search}]</button>,
    })
    await user.type(screen.getByRole('textbox', { name: /Tìm theo mã hoặc tên/ }), ' thép ')
    expect(screen.getByRole('button', { name: 'Footer [thép]' })).toBeInTheDocument()
  })

  it('nhãn Tồn / Đơn vị / NCC của hàng chỉ ẩn khi mắt thấy (sr-only từ lg), không bị display:none', () => {
    renderPicker({ materials: [flour] })
    const row = screen.getByTestId('picker-row-m-flour')
    const labels = Array.from(row.querySelectorAll('.lg\\:sr-only')).map((el) => el.textContent)
    expect(labels).toEqual(['Tồn: ', 'Đơn vị: ', 'NCC: '])
    expect(row.querySelector('.lg\\:hidden')).toBeNull()
  })

  it('đã tải sẵn đủ 100 vật tư và ô tìm trống → nhắc gõ để tìm thêm; ít hơn hoặc đang tìm thì không', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      ...sugar,
      slug: `m-${i}`,
      code: `VT-${i}`,
      name: `Vật tư ${i}`,
    }))
    server.use(mswHttp.get(URL_AVAILABLE, () => paginated([steel], { size: 50 })))
    const { user, unmount } = renderPicker({ materials: many })
    const hint = 'Đang hiện 100 vật tư đầu — gõ để tìm thêm'
    expect(screen.getByText(hint)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /Tìm theo mã hoặc tên/ }), 'thép')
    expect(screen.queryByText(hint)).not.toBeInTheDocument()
    unmount()
    renderPicker({ materials: many.slice(0, 99) })
    expect(screen.queryByText(/gõ để tìm thêm/)).not.toBeInTheDocument()
  })
})
