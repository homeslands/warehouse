import { screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { InventoryHistory, InventoryItem } from '@/entities/inventory'
import { InventoryHistorySheet } from './InventoryHistorySheet'

const BASE = 'http://localhost:8085/api/v1'

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
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
  baseUnit: null,
  units: [],
  ...over,
})

const history = (over: Partial<InventoryHistory>): InventoryHistory => ({
  slug: 'h-1',
  createdAt: '2026-10-14T03:00:00.000Z',
  updatedAt: '',
  action: 'IMPORT',
  quantityDelta: 0,
  quantityBefore: 0,
  quantityAfter: 0,
  reservedDelta: 0,
  reservedBefore: 0,
  reservedAfter: 0,
  note: null,
  changedBySlug: null,
  changedByName: 'An',
  ...over,
})

const envelope = <T,>(items: T[], page: number, hasNext: boolean) =>
  HttpResponse.json({
    message: 'ok',
    statusCode: 200,
    timestamp: '',
    result: {
      items,
      total: 25,
      page,
      pageSize: 20,
      totalPages: hasNext ? page + 1 : page,
      hasNext,
      hasPrevios: page > 1,
    },
  })

const material = (over: Record<string, unknown> = {}) => ({
  slug: 'm-matcha',
  createdAt: '',
  updatedAt: '',
  code: 'NL04',
  name: 'Matcha',
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 'mt-1', code: 'NL', name: 'Nguyên liệu' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  suppliers: [],
  warehouses: [{ slug: 'w-a', code: 'A', name: 'Kho A', quantity: 30, availableQuantity: 25 }],
  units: [],
  ...over,
})

function setup(
  props: Partial<Parameters<typeof InventoryHistorySheet>[0]> = {},
  historyHandler?: Parameters<typeof mswHttp.get>[1],
) {
  server.use(
    mswHttp.get(
      `${BASE}/warehouses/w-a/materials/:m/histories`,
      historyHandler ?? (() => envelope<InventoryHistory>([], 1, false)),
    ),
  )
  const onRemove = vi.fn()
  const onOpenChange = vi.fn()
  const r = renderWithProviders(
    <InventoryHistorySheet
      warehouseSlug="w-a"
      materialSlug="m-matcha"
      item={item()}
      canRemove
      onRemove={onRemove}
      onOpenChange={onOpenChange}
      {...props}
    />,
    { auth: 'admin' },
  )
  return { ...r, onRemove, onOpenChange }
}

describe('InventoryHistorySheet', () => {
  it('mở từ dòng: tiêu đề, tóm tắt, lịch sử nhập / giữ chỗ', async () => {
    setup({}, () =>
      envelope(
        [
          history({
            slug: 'h-1',
            action: 'IMPORT',
            quantityDelta: 5,
            quantityBefore: 20,
            quantityAfter: 25,
            note: 'Import form P500D03',
            changedByName: '',
          }),
          history({
            slug: 'h-2',
            action: 'RESERVE',
            reservedDelta: 10,
            reservedBefore: 0,
            reservedAfter: 10,
          }),
        ],
        1,
        false,
      ),
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('NL04 · Matcha')).toBeInTheDocument()
    // Tồn và Còn xuất được cùng là 30.
    expect(within(dialog).getAllByText('30')).toHaveLength(2)
    expect(within(dialog).getByText('20 – 70')).toBeInTheDocument()
    expect(await within(dialog).findByText('Nhập kho')).toBeInTheDocument()
    // Dạng sao kê: trái = thao tác / ghi chú / "thời gian · người"; phải = lượng thay đổi + trước → sau.
    const importRow = within(dialog).getByText('Nhập kho').closest('li')!
    const change = within(importRow).getByTestId('history-change')
    expect(within(change).getByText('+5')).toBeInTheDocument()
    expect(within(change).getByText('20 → 25')).toBeInTheDocument()
    expect(within(importRow).getByText('Phiếu nhập P500D03')).toBeInTheDocument()
    expect(within(importRow).getByText(/· Người dùng$/)).toBeInTheDocument()
    expect(importRow).not.toHaveTextContent('bởi')
    expect(within(dialog).getByText('Giữ chỗ +10 (0 → 10)')).toBeInTheDocument()
    expect(within(dialog).queryByText(/0 → 0/)).not.toBeInTheDocument()
  })

  it('mở từ dòng có baseUnit → số kèm mã đơn vị, ngưỡng kèm đơn vị', async () => {
    setup({ item: item({ baseUnit: { slug: 'u-chai', code: 'CHAI', name: 'Chai' } }) })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('30 CHAI')).toHaveLength(2)
    expect(within(dialog).getByText('20 – 70 CHAI')).toBeInTheDocument()
  })

  it('mở bằng URL (không có dòng): tải vật tư, không hiện ngưỡng', async () => {
    server.use(mswHttp.get(`${BASE}/materials/m-matcha`, () => ok(material())))
    setup({ item: undefined })
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('NL04 · Matcha')).toBeInTheDocument()
    expect(within(dialog).getByText('30 KG')).toBeInTheDocument()
    expect(within(dialog).getByText('5 KG')).toBeInTheDocument()
    expect(within(dialog).queryByText('Ngưỡng')).not.toBeInTheDocument()
  })

  it('vật tư không thuộc kho (100801): thông báo, không nút Gỡ, hết khung chờ', async () => {
    setup({ item: undefined }, () => apiError(404, 100801))
    server.use(mswHttp.get(`${BASE}/materials/m-matcha`, () => ok(material())))
    expect(await screen.findByText('Vật tư không còn ở kho này')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gỡ khỏi kho' })).not.toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('slug lạ khi mở bằng URL: vật tư 100701 + lịch sử 100801', async () => {
    server.use(mswHttp.get(`${BASE}/materials/x`, () => apiError(404, 100701)))
    setup({ item: undefined, materialSlug: 'x' }, () => apiError(404, 100801))
    expect(await screen.findByText('Vật tư không còn ở kho này')).toBeInTheDocument()
  })

  it('Xem thêm: tải trang 2, hết trang thì nút biến mất', async () => {
    const pages: string[] = []
    const { user } = setup({}, ({ request }) => {
      const page = new URL(request.url).searchParams.get('page') ?? '1'
      pages.push(page)
      return page === '1'
        ? envelope(
            [
              history({
                slug: 'h-1',
                action: 'ADJUST',
                quantityDelta: 1,
                quantityBefore: 1,
                quantityAfter: 2,
              }),
            ],
            1,
            true,
          )
        : envelope([history({ slug: 'h-2', action: 'REMOVE' })], 2, false)
    })
    await user.click(await screen.findByRole('button', { name: 'Xem thêm' }))
    const list = await screen.findByRole('list')
    expect(await within(list).findByText('Gỡ khỏi kho')).toBeInTheDocument()
    expect(pages).toEqual(['1', '2'])
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Xem thêm' })).not.toBeInTheDocument(),
    )
  })

  it('mã thao tác lạ → hiện nguyên mã', async () => {
    setup({}, () => envelope([history({ action: 'TRANSFER' })], 1, false))
    expect(await screen.findByText('TRANSFER')).toBeInTheDocument()
  })

  it('lịch sử rỗng → "Chưa có biến động nào"', async () => {
    setup()
    expect(await screen.findByText('Chưa có biến động nào')).toBeInTheDocument()
  })

  it('nút Gỡ: còn tồn → khoá kèm lý do', async () => {
    setup()
    const btn = await screen.findByRole('button', { name: 'Gỡ khỏi kho' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAccessibleDescription('Chỉ gỡ được khi tồn bằng 0')
  })

  it('nút Gỡ: tồn 0 → gọi onRemove', async () => {
    const { user, onRemove } = setup({
      item: item({ quantity: 0, availableQuantity: 0 }),
    })
    await user.click(await screen.findByRole('button', { name: 'Gỡ khỏi kho' }))
    expect(onRemove).toHaveBeenCalledWith({
      materialSlug: 'm-matcha',
      materialCode: 'NL04',
      materialName: 'Matcha',
    })
  })

  it('không quyền gỡ → không có nút', async () => {
    setup({ canRemove: false })
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'Gỡ khỏi kho' })).not.toBeInTheDocument()
  })

  it('lịch sử lỗi 500: báo lỗi tại chỗ, không nói "chưa có biến động"; Thử lại tải lại', async () => {
    let fail = true
    const { user } = setup({}, () =>
      fail ? apiError(500) : envelope([history({ action: 'TRANSFER' })], 1, false),
    )
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(within(dialog).queryByText('Chưa có biến động nào')).not.toBeInTheDocument()
    fail = false
    await user.click(within(dialog).getByRole('button', { name: 'Thử lại' }))
    expect(await within(dialog).findByText('TRANSFER')).toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mở bằng URL, vật tư lỗi 500: báo lỗi tại chỗ, không khung chờ vô tận', async () => {
    server.use(mswHttp.get(`${BASE}/materials/m-matcha`, () => apiError(500)))
    setup({ item: undefined })
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('trang 2 lỗi 500: báo lỗi cạnh nút, giữ dòng trang 1 và nút Xem thêm', async () => {
    const { user } = setup({}, ({ request }) =>
      new URL(request.url).searchParams.get('page') === '2'
        ? apiError(500)
        : envelope([history({ action: 'TRANSFER' })], 1, true),
    )
    await user.click(await screen.findByRole('button', { name: 'Xem thêm' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(within(dialog).getByText('TRANSFER')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Xem thêm' })).toBeInTheDocument()
  })
})
