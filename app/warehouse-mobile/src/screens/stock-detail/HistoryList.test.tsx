import { fireEvent, render, screen, within } from '@testing-library/react-native'

import type { InventoryHistory } from '@/entities/inventory'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { HistoryList, type HistoryListProps } from './HistoryList'

const TODAY = new Date(2026, 10, 4, 12, 0)
const at = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m).toISOString()

function row(over: Partial<InventoryHistory>): InventoryHistory {
  return {
    slug: 'h',
    createdAt: at(4, 9, 0),
    updatedAt: at(4, 9, 0),
    action: 'IMPORT',
    quantityDelta: 0,
    quantityBefore: 0,
    quantityAfter: 0,
    reservedDelta: 0,
    reservedBefore: 0,
    reservedAfter: 0,
    note: null,
    changedBySlug: null,
    changedByName: '',
    ...over,
  }
}

/** 4 dòng của mockup (phone 3), mới → cũ như API. */
const MOCKUP: InventoryHistory[] = [
  row({
    slug: 'h-in',
    createdAt: at(4, 10, 24),
    action: 'IMPORT',
    quantityDelta: 48,
    quantityBefore: 120,
    quantityAfter: 168,
    note: 'Import form PN-2611-0123',
    changedBySlug: 'u-tuan',
    changedByName: 'Tuấn',
  }),
  row({
    slug: 'h-res',
    createdAt: at(4, 9, 2),
    action: 'RESERVE',
    reservedDelta: 30,
    reservedBefore: 0,
    reservedAfter: 30,
    changedBySlug: 'u-xa',
    changedByName: 'Xưởng A',
  }),
  row({
    slug: 'h-out',
    createdAt: at(3, 16, 40),
    action: 'EXPORT',
    quantityDelta: -25,
    quantityBefore: 145,
    quantityAfter: 120,
    changedBySlug: 'u-lan',
    changedByName: 'KT Lan',
  }),
  row({
    slug: 'h-adj',
    createdAt: at(3, 8, 5),
    action: 'ADJUST',
    quantityDelta: -2,
    quantityBefore: 147,
    quantityAfter: 145,
    note: 'Bao rách, huỷ 2',
    changedByName: '',
  }),
]

async function show(props: Partial<HistoryListProps> = {}) {
  await render(
    <HistoryList
      rows={MOCKUP}
      failed={false}
      retrying={false}
      onRetry={() => {}}
      loadingMore={false}
      loadMoreFailed={false}
      onRetryMore={() => {}}
      locale="vi"
      today={TODAY}
      {...props}
    />,
  )
}

const rows = () => screen.getAllByTestId('history-row').map((r) => within(r))

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('HistoryList', () => {
  it('nhóm "Hôm nay" (2 dòng) / "Hôm qua" (2 dòng), giữ thứ tự mới → cũ', async () => {
    await show()
    const headers = screen.getAllByRole('header').map((h) => h.props.children)
    expect(headers).toEqual(['Hôm nay', 'Hôm qua'])
    expect(within(screen.getByTestId('history-day-0')).getAllByTestId('history-row')).toHaveLength(
      2,
    )
    expect(within(screen.getByTestId('history-day-1')).getAllByTestId('history-row')).toHaveLength(
      2,
    )
  })

  it('ngày cũ hơn hôm qua → tiêu đề dd/MM/yyyy', async () => {
    await show({ rows: [row({ createdAt: at(1, 7, 0) })] })
    expect(screen.getByRole('header')).toHaveTextContent('01/11/2026')
  })

  it('Nhập kho: +48 xanh, 120 → 168, dòng phụ "ghi chú · người · giờ"', async () => {
    await show()
    const r = rows()[0]
    expect(r.getByText('Nhập kho')).toBeOnTheScreen()
    expect(r.getByText('Import form PN-2611-0123 · Tuấn · 10:24')).toBeOnTheScreen()
    expect(r.getByText('+48')).toHaveStyle({ color: lightColors.successText })
    expect(r.getByText('120 → 168')).toBeOnTheScreen()
  })

  it('Giữ chỗ: 30 màu info + "đang giữ 30" (không phải số tồn)', async () => {
    await show()
    const r = rows()[1]
    expect(r.getByText('Giữ chỗ cho phiếu xuất')).toBeOnTheScreen()
    expect(r.getByText('Xưởng A · 09:02')).toBeOnTheScreen()
    expect(r.getByText('30')).toHaveStyle({ color: lightColors.infoText })
    expect(r.getByText('đang giữ 30')).toBeOnTheScreen()
  })

  it('Xuất kho: −25 đỏ, 145 → 120', async () => {
    await show()
    const r = rows()[2]
    expect(r.getByText('Xuất kho')).toBeOnTheScreen()
    expect(r.getByText('−25')).toHaveStyle({ color: lightColors.destructiveText })
    expect(r.getByText('145 → 120')).toBeOnTheScreen()
  })

  it('Điều chỉnh tay, người làm trống → không có " · " thừa', async () => {
    await show()
    const r = rows()[3]
    expect(r.getByText('Điều chỉnh tay')).toBeOnTheScreen()
    expect(r.getByText('Bao rách, huỷ 2 · 08:05')).toBeOnTheScreen()
    expect(r.getByText('−2')).toBeOnTheScreen()
  })

  it('không ghi chú, không người làm → dòng phụ chỉ có giờ', async () => {
    await show({ rows: [row({ createdAt: at(4, 7, 30), changedByName: null as never })] })
    expect(rows()[0].getByText('07:30')).toBeOnTheScreen()
  })

  it('mã biến động lạ → hiện nguyên mã, không vỡ', async () => {
    await show({ rows: [row({ action: 'MERGE', quantityDelta: 3, quantityAfter: 3 })] })
    expect(rows()[0].getByText('MERGE')).toBeOnTheScreen()
    expect(rows()[0].getByText('+3')).toBeOnTheScreen()
  })

  it('dòng không bấm được (không có role button)', async () => {
    await show()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('trống → "Chưa có biến động"', async () => {
    await show({ rows: [] })
    expect(screen.getByText('Chưa có biến động')).toBeOnTheScreen()
    expect(screen.queryAllByTestId('history-row')).toHaveLength(0)
  })

  it('đang tải trang sau → vòng quay nhỏ cuối danh sách', async () => {
    await show({ loadingMore: true })
    expect(screen.getByTestId('history-loading-more')).toBeOnTheScreen()
  })

  it('tải trang sau lỗi → giữ danh sách + nút Thử lại gọi onRetryMore', async () => {
    const onRetryMore = jest.fn()
    await show({ loadMoreFailed: true, onRetryMore })
    expect(screen.getAllByTestId('history-row')).toHaveLength(4)
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetryMore).toHaveBeenCalledTimes(1)
  })

  it('lỗi lần đầu → câu lỗi + Thử lại gọi onRetry', async () => {
    const onRetry = jest.fn()
    await show({ rows: undefined, failed: true, onRetry })
    expect(screen.getByText('Không tải được lịch sử')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('chưa có dữ liệu, chưa lỗi → vòng quay có nhãn a11y inventory:loading', async () => {
    await show({ rows: undefined })
    expect(screen.getByLabelText('Đang tải tồn kho')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })

  it('rỗng → chữ rỗng, không có nút Thử lại', async () => {
    await show({ rows: [] })
    expect(screen.getByText('Chưa có biến động')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })
})
