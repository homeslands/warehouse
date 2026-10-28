import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { InventoryItem } from '@/entities/inventory'
import { renderWithProviders } from '@/shared/test/render'
import { ExportFormReviewStep } from './ExportFormReviewStep'
import {
  EMPTY_EXPORT_ITEM,
  emptyExportFormValues,
  type ExportFormValues,
} from '../model/export-form-editor.schema'

const KG = {
  unitSlug: 'u-kg',
  unitCode: 'KG',
  unitName: 'Kilogram',
  conversionRate: 1,
  isBaseUnit: true,
}
const flour = {
  materialSlug: 'm-1',
  materialCode: 'VT-01',
  materialName: 'Bột mì',
  availableQuantity: 100,
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  units: [KG],
} as InventoryItem

const values = (over: Partial<ExportFormValues> = {}): ExportFormValues => ({
  ...emptyExportFormValues(new Date(2026, 9, 27)),
  type: 'SALE',
  receiver: ' Cửa hàng B ',
  purchaseOrder: ' PO-12 ',
  items: [
    {
      ...EMPTY_EXPORT_ITEM,
      materialSlug: 'm-1',
      unitSlug: 'u-kg',
      quantity: 10,
      unitPrice: 25_000,
    },
    { ...EMPTY_EXPORT_ITEM, materialSlug: 'm-1', unitSlug: 'u-kg', quantity: 2, unitPrice: 1_000 },
  ],
  ...over,
})

const render = (v: ExportFormValues, extra: { onEditStep?: () => void; disabled?: boolean } = {}) =>
  renderWithProviders(
    <ExportFormReviewStep
      values={v}
      stock={new Map([['m-1', flour]])}
      batches={new Map()}
      fallbackMaterials={new Map()}
      canSubmit
      onJumpToLine={vi.fn()}
      onEditStep={extra.onEditStep ?? vi.fn()}
      disabled={extra.disabled}
      now={new Date(2026, 9, 27)}
    />,
  )

describe('ExportFormReviewStep', () => {
  it('mỗi phần có nút "Sửa" về đúng bước: Thông tin phiếu → ①, Chi tiết vật tư → ②', async () => {
    const onEditStep = vi.fn()
    const { user } = render(values(), { onEditStep })
    expect(screen.getByRole('heading', { name: 'Thông tin phiếu' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sửa thông tin phiếu' }))
    expect(onEditStep).toHaveBeenLastCalledWith('info')
    await user.click(screen.getByRole('button', { name: 'Sửa chi tiết vật tư' }))
    expect(onEditStep).toHaveBeenLastCalledWith('items')
  })

  it('đang gửi thì nút "Sửa" khoá', () => {
    render(values(), { disabled: true })
    expect(screen.getByRole('button', { name: 'Sửa thông tin phiếu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sửa chi tiết vật tư' })).toBeDisabled()
  })

  it('thông tin phiếu là dòng meta như bước ②: Lý do xuất · Người nhận · Số PO', () => {
    render(values())
    expect(screen.getAllByRole('term').map((el) => el.textContent)).toEqual(
      expect.arrayContaining(['Lý do xuất', 'Người nhận', 'Số PO']),
    )
    expect(screen.getAllByRole('definition').map((el) => el.textContent)).toEqual(
      expect.arrayContaining(['Bán', 'Cửa hàng B', 'PO-12']),
    )
  })

  it('phần dòng có tiêu đề "Chi tiết vật tư" và dòng tổng cộng: số dòng + tổng tiền (Bán)', () => {
    render(values())
    const lines = screen.getByRole('region', { name: 'Chi tiết vật tư' })
    const totals = within(lines).getByTestId('review-totals')
    expect(totals).toHaveTextContent('Số dòng2')
    expect(totals).toHaveTextContent(/Tổng tiền252\.000\s₫/)
  })

  it('không phải Bán: dòng tổng cộng chỉ có số dòng', () => {
    render(values({ type: 'PRODUCTION' }))
    const totals = screen.getByTestId('review-totals')
    expect(totals).toHaveTextContent('Số dòng2')
    expect(totals).not.toHaveTextContent('Tổng tiền')
  })
})
