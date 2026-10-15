import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { chooseOption } from '@/shared/test/select'
import type { InventoryItem, MaterialAddAbilities } from '@/entities/inventory'
import { WarehouseInventory } from './WarehouseInventory'

const BASE = 'http://localhost:8085/api/v1'
const ALL: MaterialAddAbilities = { search: true, assign: true, create: true, attachSupplier: true }
const NONE: MaterialAddAbilities = {
  search: true,
  assign: false,
  create: false,
  attachSupplier: false,
}
const row = (over: Partial<InventoryItem>): InventoryItem => ({
  slug: 'inv-1',
  createdAt: '',
  updatedAt: '',
  quantity: 30,
  reservedQuantity: 0,
  availableQuantity: 30,
  minimumInventory: 20,
  maximumInventory: 70,
  effectiveMinimumInventory: 20,
  effectiveMaximumInventory: 70,
  isBelowMinimum: false,
  isAboveMaximum: false,
  warehouseSlug: 'w-a',
  materialSlug: 'm-matcha',
  materialCode: 'NL04',
  materialName: 'Matcha',
  typeSlug: 'mt-1',
  typeName: 'Nguyên liệu',
  ...over,
})
const matcha = row({})
const noUnitAbove = row({
  slug: 'inv-2',
  materialSlug: 'm-no',
  materialCode: 'NO',
  materialName: 'no',
  quantity: 25,
  availableQuantity: 25,
  isAboveMaximum: true,
  effectiveMinimumInventory: 0,
  effectiveMaximumInventory: 0,
})

function LocationProbe() {
  const location = useLocation()
  return (
    <>
      <output data-testid="search">{location.search}</output>
      <output data-testid="path">{location.pathname}</output>
      <output data-testid="state">{JSON.stringify(location.state)}</output>
    </>
  )
}

function setup(
  opts: {
    items?: InventoryItem[]
    add?: MaterialAddAbilities
    canRemove?: boolean
    isActive?: boolean
    searchEnabled?: boolean
    handler?: (params: URLSearchParams) => Response | undefined
    route?: string
  } = {},
) {
  const seen: URLSearchParams[] = []
  server.use(
    mswHttp.get(`${BASE}/warehouses/w-a/materials`, ({ request }) => {
      const params = new URL(request.url).searchParams
      seen.push(params)
      return opts.handler?.(params) ?? paginated(opts.items ?? [matcha, noUnitAbove])
    }),
    mswHttp.get(`${BASE}/warehouses/w-a/materials/:m/histories`, () => paginated([])),
    mswHttp.get(`${BASE}/material-types`, () =>
      paginated([{ slug: 'mt-1', code: 'NL', name: 'Nguyên liệu', createdAt: '', updatedAt: '' }]),
    ),
  )
  const r = renderWithProviders(
    <>
      <WarehouseInventory
        warehouse={{ slug: 'w-a', name: 'Kho A', isActive: opts.isActive ?? true }}
        addAbilities={opts.add ?? ALL}
        canRemove={opts.canRemove ?? true}
        searchEnabled={opts.searchEnabled ?? false}
      />
      <LocationProbe />
    </>,
    { auth: 'admin', route: opts.route ?? '/warehouses/w-a?tab=materials' },
  )
  return { ...r, seen }
}

describe('WarehouseInventory', () => {
  it('cột Vật tư / Loại / Tồn; chưa có đơn vị → chỉ số; nhãn Trên max; ngưỡng 0–0 → "Chưa đặt"', async () => {
    setup()
    const matchaRow = (await screen.findByText(/Matcha/)).closest('tr')!
    expect(within(matchaRow).getByRole('link', { name: 'NL04' })).toHaveAttribute(
      'href',
      '/materials/m-matcha',
    )
    // Tồn và Còn xuất được cùng là 30.
    expect(within(matchaRow).getAllByText('30')).toHaveLength(2)
    expect(within(matchaRow).getByText('20 – 70')).toBeInTheDocument()
    const noRow = screen.getByText(/· no$/).closest('tr')!
    // Vượt ngưỡng (cả dưới min lẫn trên max) đều là nhãn destructive (nền đỏ, chữ trắng).
    expect(within(noRow).getByText('Trên max')).toHaveAttribute('data-variant', 'destructive')
    expect(within(noRow).getByText('Chưa đặt')).toBeInTheDocument()
    expect(noRow).not.toHaveTextContent('undefined')
  })

  it('bấm mã vật tư → sang trang vật tư, state.backTo là tab Vật tư của kho (có cả ?tab=)', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('link', { name: 'NL04' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/materials/m-matcha')
    expect(JSON.parse(screen.getByTestId('state').textContent!)).toEqual({
      backTo: '/warehouses/w-a?tab=materials',
    })
  })

  it('có đơn vị gốc → "30 KG"', async () => {
    setup({ items: [row({ baseUnitCode: 'KG', baseUnitName: 'Kilogram', baseUnitSlug: 'u-kg' })] })
    expect((await screen.findAllByText('30 KG')).length).toBeGreaterThan(0)
  })

  it('lọc Cảnh báo "Dưới ngưỡng min" → belowMinimum=true, về trang 1', async () => {
    const { user, seen } = setup()
    await screen.findByText(/Matcha/)
    await chooseOption(user, 'Cảnh báo', 'Dưới ngưỡng min')
    await waitFor(() => expect(seen.at(-1)?.get('belowMinimum')).toBe('true'))
    expect(seen.at(-1)?.get('page')).toBe('1')
    expect(seen.at(-1)?.has('aboveMaximum')).toBe(false)
  })

  it('lọc loại vật tư → typeSlug', async () => {
    const { user, seen } = setup()
    await screen.findByText(/Matcha/)
    await chooseOption(user, 'Loại vật tư', 'NL · Nguyên liệu')
    await waitFor(() => expect(seen.at(-1)?.get('typeSlug')).toBe('mt-1'))
    expect(seen.at(-1)?.get('page')).toBe('1')
  })

  it('kho trống → "Kho chưa có vật tư nào"; đang lọc mà trống → "Không có vật tư phù hợp"', async () => {
    const { user } = setup({ items: [] })
    expect(await screen.findByText('Kho chưa có vật tư nào')).toBeInTheDocument()
    await chooseOption(user, 'Cảnh báo', 'Trên ngưỡng max')
    expect(await screen.findByText('Không có vật tư phù hợp')).toBeInTheDocument()
  })

  it('bấm dòng → ?material=<slug> trên URL', async () => {
    const { user } = setup()
    await user.click(await screen.findByText(/Matcha/))
    expect(screen.getByTestId('search')).toHaveTextContent('material=m-matcha')
    expect(screen.getByTestId('search')).toHaveTextContent('tab=materials')
  })

  it('không quyền gắn lẫn tạo → không có nút Thêm vật tư', async () => {
    setup({ add: NONE })
    await screen.findByText(/Matcha/)
    expect(screen.queryByRole('button', { name: /Thêm vật tư/ })).not.toBeInTheDocument()
  })

  it('kho ngừng hoạt động → nút Thêm khoá, mô tả bằng lý do', async () => {
    setup({ isActive: false })
    const btn = await screen.findByRole('button', { name: /Thêm vật tư/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAccessibleDescription('Kho đã ngừng hoạt động — không thêm được vật tư.')
  })

  it('menu ⋯: còn tồn → "Gỡ khỏi kho" khoá kèm lý do', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Thao tác cho NL04' }))
    expect(screen.getByRole('menuitem', { name: 'Gỡ khỏi kho' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByText('Chỉ gỡ được khi tồn bằng 0')).toBeInTheDocument()
  })

  it('không quyền gỡ → menu không có mục gỡ', async () => {
    const { user } = setup({ canRemove: false })
    await user.click(await screen.findByRole('button', { name: 'Thao tác cho NL04' }))
    expect(screen.getByRole('menuitem', { name: 'Xem lịch sử' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Gỡ khỏi kho' })).not.toBeInTheDocument()
  })

  it('"Xem lịch sử" trong menu → ?material=<slug>, bấm ⋯ không mở thêm qua dòng', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Thao tác cho NL04' }))
    expect(screen.getByTestId('search')).not.toHaveTextContent('material=')
    await user.click(screen.getByRole('menuitem', { name: 'Xem lịch sử' }))
    expect(screen.getByTestId('search')).toHaveTextContent('material=m-matcha')
  })

  it('tồn 0, giữ chỗ 0 → "Gỡ khỏi kho" mở hộp xác nhận', async () => {
    const empty = row({ quantity: 0, availableQuantity: 0 })
    const { user } = setup({ items: [empty] })
    await user.click(await screen.findByRole('button', { name: 'Thao tác cho NL04' }))
    await user.click(screen.getByRole('menuitem', { name: 'Gỡ khỏi kho' }))
    expect(await screen.findByText('Gỡ NL04 · Matcha khỏi kho?')).toBeInTheDocument()
  })

  it('cờ inventorySearch tắt → không có ô tìm; bật → gõ mã gửi code', async () => {
    const off = setup()
    await screen.findByText(/Matcha/)
    expect(screen.queryByPlaceholderText('Tìm theo mã hoặc tên vật tư')).not.toBeInTheDocument()
    off.unmount()
    const { user, seen } = setup({ searchEnabled: true })
    await user.type(await screen.findByPlaceholderText('Tìm theo mã hoặc tên vật tư'), 'NL04')
    await waitFor(() => expect(seen.at(-1)?.get('code')).toBe('NL04'))
  })

  it('đang ở trang 2 mà tổng trang co về 1 → tự lùi về page=1', async () => {
    const { user, seen } = setup({
      handler: (p) => {
        const page = Number(p.get('page'))
        // Trang 1 có 11 dòng (2 trang); trang 2 rỗng và báo chỉ còn 1 trang.
        return page === 1
          ? paginated([matcha], { page: 1, total: 11 })
          : paginated([], { page, total: 1 })
      },
    })
    await screen.findByText(/Matcha/)
    await user.click(screen.getByRole('button', { name: /trang sau|next/i }))
    await waitFor(() => expect(seen.some((p) => p.get('page') === '2')).toBe(true))
    await waitFor(() => expect(seen.at(-1)?.get('page')).toBe('1'))
    expect(await screen.findByText(/Matcha/)).toBeInTheDocument()
  })

  it('bấm dòng mở sheet lịch sử; Đóng bỏ ?material=', async () => {
    const { user } = setup()
    await user.click(await screen.findByText(/Matcha/))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('NL04 · Matcha')).toBeInTheDocument()
    expect(await within(dialog).findByText('Chưa có biến động nào')).toBeInTheDocument()
    await user.click(within(dialog).getAllByRole('button', { name: 'Đóng' }).at(-1)!)
    await waitFor(() => expect(screen.getByTestId('search')).not.toHaveTextContent('material='))
  })

  it('gỡ từ sheet: xác nhận xong sheet đóng', async () => {
    const empty = row({ quantity: 0, availableQuantity: 0 })
    server.use(mswHttp.delete(`${BASE}/warehouses/w-a/materials/m-matcha`, () => ok(null)))
    const { user } = setup({ items: [empty] })
    await user.click(await screen.findByText(/Matcha/))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Gỡ khỏi kho' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'Gỡ' }))
    await waitFor(() => expect(screen.getByTestId('search')).not.toHaveTextContent('material='))
  })

  it('route có sẵn ?material= → sheet mở ngay', async () => {
    setup({ route: '/warehouses/w-a?tab=materials&material=m-matcha' })
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('NL04 · Matcha')).toBeInTheDocument()
  })
})
