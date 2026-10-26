/**
 * `break-ui`: bước ② phiếu xuất với dữ liệu worst-case — tên vật tư 120 ký tự không dấu cách, 200 dòng, lô không hạn,
 * số khả dụng rất lớn. Chỉ kiểm bất biến dựng được ở jsdom (không đo layout): không crash, đủ nội dung,
 * tên đầy đủ còn trong DOM (CSS `break-words` / `truncate` lo phần cắt).
 */
import { screen, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import type { InventoryItem } from '@/entities/inventory'
import type { MaterialBatch } from '@/entities/material-batch'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { Form } from '@/shared/ui/form'
import { ExportFormItemsField } from './ExportFormItemsField'
import {
  EMPTY_EXPORT_ITEM,
  EXPORT_FORM_ITEMS_MAX,
  emptyExportFormValues,
  type ExportFormValues,
} from '../model/export-form-editor.schema'

const LONG_NAME = 'Thep'.repeat(30) // 120 ký tự, không khoảng trắng
const LONG_CODE = 'MAT-THEP-CUON-CB300V-D10-XXXXXXXX' // dài hơn mã thường gặp
const HUGE = 99_999_999.123456

const worst: InventoryItem = {
  slug: 'i-1',
  materialSlug: 'm-long',
  materialCode: LONG_CODE,
  materialName: LONG_NAME,
  availableQuantity: HUGE,
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'u-coil',
      unitCode: 'CUON-2T-TC',
      unitName: 'Cuộn 2 tấn tiêu chuẩn nhà máy',
      conversionRate: 2000,
      isBaseUnit: false,
    },
  ],
} as InventoryItem
const oneLetter = {
  ...worst,
  slug: 'i-2',
  materialSlug: 'm-a',
  materialCode: 'A',
  materialName: 'B',
}
const STOCK = [worst, oneLetter] as InventoryItem[]

const noExpiry: MaterialBatch = {
  slug: 'b-none',
  entryDate: '2026-01-01',
  expiryDate: null,
  quantity: HUGE,
  remainingQuantity: HUGE,
  reservedQuantity: 0,
  availableQuantity: HUGE,
  status: 1,
  materialSlug: 'm-long',
  materialCode: LONG_CODE,
  materialName: LONG_NAME,
  importFormSlug: 'if-1',
  importFormCode: 'PN-' + 'X'.repeat(29),
  warehouseSlug: 'w-a',
}

function Harness({
  items,
  type = 'SALE',
}: {
  items: ExportFormValues['items']
  type?: 'SALE' | 'PRODUCTION'
}) {
  const form = useForm<ExportFormValues>({
    defaultValues: { ...emptyExportFormValues(new Date(2026, 9, 26)), type, items },
  })
  return (
    <Form {...form}>
      <ExportFormItemsField
        form={form}
        warehouseSlug="w-a"
        stock={STOCK}
        stockTotal={800}
        shortages={[{ index: 0, available: HUGE, requested: HUGE * 2, baseUnitCode: 'KG' }]}
        canPickBatch
        batchesBySlug={new Map([[noExpiry.slug, noExpiry]])}
      />
    </Form>
  )
}

const longLine = (extra: Partial<ExportFormValues['items'][number]> = {}) => ({
  ...EMPTY_EXPORT_ITEM,
  materialSlug: 'm-long',
  unitSlug: 'u-coil',
  quantity: 123456789.123456,
  unitPrice: 9_999_999_999.99,
  ...extra,
})

describe('ExportFormItemsField — worst case', () => {
  it('tên 120 ký tự, lô không hạn, số chạm trần: dựng được, đủ chữ, nút lô ghi "Không hạn"', async () => {
    renderWithProviders(<Harness items={[longLine({ batchSlug: 'b-none' })]} />)
    const row = screen.getByTestId('line-0')
    expect(within(row).getByRole('combobox', { name: /^Vật tư/ })).toHaveTextContent(LONG_NAME)
    expect(within(row).getByRole('combobox', { name: /^Lô/ })).toHaveTextContent('Không hạn')
    expect(within(row).getByText(/Chỉ còn .* KG khả dụng/)).toBeInTheDocument()
    expect(screen.getByTestId('line-amount-0')).toBeInTheDocument()
  })

  it('không phải Bán: lưới bật từ khung 48rem (`@3xl`), không phải `@4xl` — lưới ≈ 39.75rem vừa khung', () => {
    renderWithProviders(<Harness type="PRODUCTION" items={[longLine({ unitPrice: undefined })]} />)
    const cls = screen.getByTestId('line-0').className
    expect(cls).toContain('@3xl:grid-cols-')
    expect(cls).not.toContain('@4xl:')
  })

  it('Bán, thành tiền 99.999.999.999 ₫ / dòng: số xuống dòng trong cột, không đè nút ghi chú / xoá', () => {
    // Lưới chỉ bật từ khung 56rem (`@4xl`): tổng cột tối thiểu của lưới Bán ≈ 55.75rem — ở 48rem nó tràn khung.
    renderWithProviders(
      <Harness
        items={[
          longLine({ quantity: 1, unitPrice: 99_999_999_999 }),
          longLine({ materialSlug: 'm-a', unitSlug: 'u-coil', quantity: 12_345.123456 }),
        ]}
      />,
    )
    const amount = screen.getByTestId('line-amount-0')
    expect(amount).toHaveTextContent(/^99\.999\.999\.999\s₫$/)
    expect(amount.className).toContain('[overflow-wrap:anywhere]')
    expect(screen.getByTestId('line-0').className).toContain('@4xl:grid-cols-')
    expect(screen.getByTestId('line-0').className).not.toContain('@3xl:')
    // Số quy đổi dài (12.345,123456 × 2000) gãy trong ô Số lượng, ô không phình sang cột Đơn giá.
    const converted = within(screen.getByTestId('line-1')).getByText(/^= 24\.690\.246,912 KG$/)
    expect(converted.className).toContain('[overflow-wrap:anywhere]')
    expect(converted.closest('[data-slot="form-item"]')).toHaveClass('min-w-0')
  })

  it('danh sách lô: lô không hạn + mã phiếu nhập rất dài vẫn đủ chữ', async () => {
    server.use(
      mswHttp.get('http://localhost:8085/api/v1/warehouses/w-a/material-batches', () =>
        paginated([noExpiry]),
      ),
    )
    const { user } = renderWithProviders(<Harness items={[longLine()]} />)
    await user.click(screen.getByRole('combobox', { name: /^Lô/ }))
    const option = await screen.findByRole('option', { name: /PN-X+/ })
    expect(option).toHaveTextContent('Không hạn')
    expect(option).toHaveTextContent('PN-' + 'X'.repeat(29))
  })

  it('ô xổ vật tư: tên dài đủ chữ trong mục; vật tư một chữ cái vẫn hiện', async () => {
    const { user } = renderWithProviders(<Harness items={[{ ...EMPTY_EXPORT_ITEM }]} />)
    await user.click(screen.getByRole('combobox', { name: /^Vật tư/ }))
    expect(screen.getByRole('option', { name: new RegExp(LONG_NAME) })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^A · B/ })).toBeInTheDocument()
    expect(screen.getByText('Chỉ tìm trong 500 vật tư đầu của kho')).toBeInTheDocument()
  })

  it('đủ 200 dòng: dựng được, "Thêm dòng" khoá, không còn nút "Chọn nhiều vật tư"', () => {
    const items = Array.from({ length: EXPORT_FORM_ITEMS_MAX }, (_, i) =>
      longLine({ quantity: i + 1, unitPrice: i }),
    )
    renderWithProviders(<Harness items={items} />)
    expect(screen.getAllByTestId(/^line-\d+$/)).toHaveLength(EXPORT_FORM_ITEMS_MAX)
    expect(screen.getByRole('button', { name: 'Thêm dòng' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Chọn nhiều vật tư' })).not.toBeInTheDocument()
    expect(screen.getByText('Đã đủ 200 dòng — tối đa của một phiếu.')).toBeInTheDocument()
  }, 30_000)

  it('zero dòng có vật tư (1 dòng trống): không crash, ô đơn vị và lô khoá', () => {
    renderWithProviders(<Harness items={[{ ...EMPTY_EXPORT_ITEM }]} />)
    expect(screen.getByRole('combobox', { name: /^Lô/ })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: /^Đơn vị/ })).toBeDisabled()
  })
})
