// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import type { MaterialBatch } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { BatchPicker } from './BatchPicker'

const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const YEAR = new Date().getFullYear()
const batch = (slug: string, over: Partial<MaterialBatch>): MaterialBatch => ({
  slug,
  entryDate: `${YEAR}-10-05`,
  expiryDate: null,
  quantity: 100,
  remainingQuantity: 100,
  reservedQuantity: 0,
  availableQuantity: 100,
  status: 1,
  materialSlug: 'm-1',
  baseUnit: { slug: 'u-1', code: 'H', name: 'hộp' },
  ...over,
})

let client: QueryClient
let calls: unknown[] = []
function lots(rows: MaterialBatch[], soldOut: MaterialBatch[] = []) {
  route('get', '/warehouses/wh-a/material-batches', (c) => {
    calls.push(c.params)
    // `status` vắng = tải cả lô đã hết hàng (useLotInfo).
    const items = (c.params as { status?: number }).status === 1 ? rows : [...rows, ...soldOut]
    return ok({
      items,
      total: items.length,
      page: 1,
      pageSize: 100,
      totalPages: 1,
      hasNext: false,
    })
  })
}
async function show(value: string | null, onChange = jest.fn(), expiryDate: string | null = null) {
  await render(
    <QueryClientProvider client={client}>
      <BatchPicker materialSlug="m-1" value={value} onChange={onChange} expiryDate={expiryDate} />
    </QueryClientProvider>,
  )
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
  return onChange
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  resetFakeApi()
  calls = []
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
})
afterEach(() => client.clear())

describe('BatchPicker', () => {
  it('mục đầu "Tự động (HSD sớm nhất)"; sau đó lô còn hàng, HSD sớm trước, không HSD cuối; mỗi lô có nhãn + "còn n <đv gốc>"', async () => {
    lots([
      batch('b-none', { availableQuantity: 20 }),
      batch('b-late', { expiryDate: '2027-06-01', availableQuantity: 8 }),
      batch('b-early', { expiryDate: '2027-03-12', availableQuantity: 5.5 }),
    ])
    await show(null)
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(names).toEqual([
      'Tự động (HSD sớm nhất)',
      `HSD 12/03/2027 · nhập 05/10, còn 5,5 hộp`,
      `HSD 01/06/2027 · nhập 05/10, còn 8 hộp`,
      `Không HSD · nhập 05/10, còn 20 hộp`,
    ])
    expect(calls[0]).toEqual(expect.objectContaining({ materialSlug: 'm-1', status: 1 }))
  })

  it('value null → "Tự động" được chọn; value = slug → lô đó được chọn', async () => {
    lots([batch('b-1', { expiryDate: '2027-03-12' })])
    await show('b-1')
    expect(screen.getByRole('button', { name: /^HSD 12\/03\/2027/ })).toBeSelected()
    expect(screen.getByRole('button', { name: 'Tự động (HSD sớm nhất)' })).not.toBeSelected()
  })

  it('chọn lô → onChange(lô); chọn "Tự động" → onChange(null)', async () => {
    const b = batch('b-1', { expiryDate: '2027-03-12' })
    lots([b])
    const onChange = await show('b-1')
    await fireEvent.press(screen.getByRole('button', { name: 'Tự động (HSD sớm nhất)' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
    await screen.unmount()
    const onChange2 = await show(null)
    await fireEvent.press(screen.getByRole('button', { name: /^HSD 12\/03\/2027/ }))
    expect(onChange2).toHaveBeenLastCalledWith(b)
  })

  it('không có lô còn hàng → chỉ "Tự động" kèm câu giải thích', async () => {
    lots([])
    await show(null)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('Không có lô nào còn hàng — dùng “Tự động”.')).toBeOnTheScreen()
  })

  it('lô đang chọn đã hết hàng (không có trong danh sách) → vẫn hiện, được chọn, ghi "hết hàng" (HSD + ngày nhập nếu biết)', async () => {
    lots(
      [batch('b-1', { expiryDate: '2027-03-12' })],
      [batch('b-gone', { expiryDate: '2027-01-15', availableQuantity: 0, status: 0 })],
    )
    const onChange = await show('b-gone', jest.fn(), '2027-01-15')
    const gone = screen.getByRole('button', { name: 'HSD 15/01/2027 · nhập 05/10, hết hàng' })
    expect(gone).toBeSelected()
    expect(screen.getByRole('button', { name: 'Tự động (HSD sớm nhất)' })).not.toBeSelected()
    expect(screen.getByRole('button', { name: /^HSD 12\/03\/2027/ })).not.toBeSelected()
    await fireEvent.press(gone)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('lô đã hết hàng mà chưa biết ngày nhập → nhãn chỉ có HSD của dòng + "hết hàng"', async () => {
    lots([batch('b-1', { expiryDate: '2027-03-12' })])
    await show('b-gone', jest.fn(), '2027-01-15')
    expect(screen.getByRole('button', { name: 'HSD 15/01/2027, hết hàng' })).toBeSelected()
  })
})
