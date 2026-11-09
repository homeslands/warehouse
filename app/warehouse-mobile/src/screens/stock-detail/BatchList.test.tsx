import { fireEvent, render, screen, within } from '@testing-library/react-native'

import type { MaterialBatch } from '@/entities/inventory'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { BatchList, type BatchListProps } from './BatchList'

const TODAY = new Date(2026, 10, 8, 12, 0)

function batch(over: Partial<MaterialBatch>): MaterialBatch {
  return {
    slug: 'b',
    entryDate: '2026-10-05',
    expiryDate: null,
    quantity: 10,
    remainingQuantity: 10,
    reservedQuantity: 0,
    availableQuantity: 10,
    status: 1,
    materialSlug: 'xi-mang-pcb40',
    baseUnit: null,
    ...over,
  }
}

async function show(props: Partial<BatchListProps> = {}) {
  await render(
    <BatchList
      batches={[]}
      failed={false}
      retrying={false}
      onRetry={() => {}}
      locale="vi"
      today={TODAY}
      {...props}
    />,
  )
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('BatchList', () => {
  it('đang tải (batches undefined, không lỗi) → khung chờ, không có nút Thử lại', async () => {
    await show({ batches: undefined, failed: false })
    expect(screen.getByLabelText('Đang tải tồn kho', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('Thử lại')).toBeNull()
  })

  it('có HSD: "HSD dd/MM/yyyy" + ngày nhập cùng năm ngắn dd/MM', async () => {
    await show({
      batches: [batch({ slug: 'b-1', expiryDate: '2027-03-12', entryDate: '2026-10-05' })],
    })
    const row = within(screen.getByTestId('batch-row'))
    expect(row.getByText('Nhập 05/10')).toBeOnTheScreen()
    expect(row.getByText('HSD 12/03/2027')).toBeOnTheScreen()
  })

  it('không HSD: "Không HSD"; ngày nhập khác năm đủ dd/MM/yyyy', async () => {
    await show({
      batches: [batch({ slug: 'b-2', expiryDate: null, entryDate: '2025-12-01' })],
    })
    const row = within(screen.getByTestId('batch-row'))
    expect(row.getByText('Nhập 01/12/2025')).toBeOnTheScreen()
    expect(row.getByText('Không HSD')).toBeOnTheScreen()
  })

  it('lỗi lần đầu → Thử lại gọi onRetry', async () => {
    const onRetry = jest.fn()
    await show({ batches: undefined, failed: true, onRetry })
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
