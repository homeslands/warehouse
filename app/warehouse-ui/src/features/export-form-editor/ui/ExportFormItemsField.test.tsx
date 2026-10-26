import { zodResolver } from '@hookform/resolvers/zod'
import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { InventoryItem } from '@/entities/inventory'
import type { MaterialBatch } from '@/entities/material-batch'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { Form } from '@/shared/ui/form'
import { ExportFormItemsField } from './ExportFormItemsField'
import type { Shortage } from '../model/availability'
import {
  EMPTY_EXPORT_ITEM,
  buildExportFormSchema,
  emptyExportFormValues,
  type ExportFormValues,
} from '../model/export-form-editor.schema'
import { clearLinePrices } from '../model/pricing'

const URL_BATCHES = 'http://localhost:8085/api/v1/warehouses/w-a/material-batches'
const KG = { slug: 'u-kg', code: 'KG', name: 'Kilogram' }

const stockItem = (
  code: string,
  name: string,
  availableQuantity: number,
  extra: Partial<InventoryItem> = {},
): InventoryItem =>
  ({
    slug: `i-${code}`,
    materialSlug: `m-${code}`,
    materialCode: code,
    materialName: name,
    availableQuantity,
    baseUnit: KG,
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
    ],
    ...extra,
  }) as InventoryItem

const flour = stockItem('VT-01', 'Bột mì', 120, {
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'u-bag',
      unitCode: 'BAG',
      unitName: 'Bao 25kg',
      conversionRate: 25,
      isBaseUnit: false,
    },
  ],
})
const sugar = stockItem('VT-02', 'Đường cát', 0)
const salt = stockItem('VT-03', 'Muối', 40)
const rice = stockItem('VT-04', 'Gạo', 75)
const STOCK = [flour, sugar, salt, rice]

const batch = (slug: string, extra: Partial<MaterialBatch> = {}): MaterialBatch => ({
  slug,
  entryDate: '2026-09-01',
  expiryDate: '2026-12-31',
  quantity: 50,
  remainingQuantity: 50,
  reservedQuantity: 0,
  availableQuantity: 50,
  status: 1,
  materialSlug: 'm-VT-01',
  materialCode: 'VT-01',
  materialName: 'Bột mì',
  importFormSlug: 'if-1',
  importFormCode: 'PN-001',
  warehouseSlug: 'w-a',
  ...extra,
})

let current: ExportFormValues | undefined
let formRef: ReturnType<typeof useForm<ExportFormValues>> | undefined

function Harness({
  items,
  type = 'OTHER',
  stockTotal = STOCK.length,
  shortages = [],
  canPickBatch = true,
}: {
  items?: ExportFormValues['items']
  type?: ExportFormValues['type']
  stockTotal?: number
  shortages?: Shortage[]
  canPickBatch?: boolean
}) {
  const form = useForm<ExportFormValues>({
    resolver: zodResolver(buildExportFormSchema({ sale: type === 'SALE' })),
    defaultValues: {
      ...emptyExportFormValues(new Date(2026, 9, 26)),
      type,
      ...(items && { items }),
    },
  })
  current = form.watch()
  formRef = form
  return (
    <Form {...form}>
      <button type="button" onClick={() => form.setValue('type', 'OTHER')}>
        đổi sang Khác
      </button>
      <button type="button" onClick={() => form.setValue('type', 'SALE')}>
        đổi sang Bán
      </button>
      <button type="button" onClick={() => void form.handleSubmit(() => undefined)()}>
        gửi
      </button>
      <button type="button" onClick={() => clearLinePrices(form)}>
        xoá giá
      </button>
      <ExportFormItemsField
        form={form}
        warehouseSlug="w-a"
        stock={STOCK}
        stockTotal={stockTotal}
        shortages={shortages}
        canPickBatch={canPickBatch}
        batchesBySlug={new Map()}
      />
    </Form>
  )
}

const line = (extra: Partial<ExportFormValues['items'][number]> = {}) => ({
  ...EMPTY_EXPORT_ITEM,
  ...extra,
})

describe('ExportFormItemsField', () => {
  it('ô xổ vật tư lọc tại chỗ theo mã hoặc tên (không dấu), không gọi API', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: /^Vật tư/ }))
    expect(screen.getAllByRole('option')).toHaveLength(4)
    await user.type(screen.getByRole('combobox', { name: /Tìm theo mã hoặc tên/ }), 'duong')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option')).toHaveTextContent('VT-02')
  })

  it('mục ghi mã · tên · "Khả dụng: n KG" · các đơn vị', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: /^Vật tư/ }))
    const option = screen.getByRole('option', { name: /Bột mì/ })
    expect(option).toHaveTextContent('VT-01')
    expect(option).toHaveTextContent('Khả dụng: 120 KG')
    expect(option).toHaveTextContent('KG, BAG')
  })

  it('vật tư khả dụng 0: mục mờ "Hết hàng", không chọn được', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: /^Vật tư/ }))
    const option = screen.getByRole('option', { name: /Đường cát/ })
    expect(option).toHaveAttribute('aria-disabled', 'true')
    expect(option).toHaveTextContent('Hết hàng')
    await user.click(option)
    expect(current?.items[0]?.materialSlug).toBe('')
  })

  it('chọn vật tư → đơn vị gốc, lô tự chọn; đổi vật tư thì lô về tự chọn', async () => {
    const { user } = renderWithProviders(
      <Harness items={[line({ materialSlug: 'm-VT-03', unitSlug: 'u-kg', batchSlug: 'b-1' })]} />,
    )
    await user.click(screen.getByRole('combobox', { name: /^Vật tư/ }))
    await user.click(screen.getByRole('option', { name: /Bột mì/ }))
    expect(current?.items[0]).toMatchObject({
      materialSlug: 'm-VT-01',
      unitSlug: 'u-kg',
      batchSlug: '',
    })
  })

  it('chọn lô → batchSlug; chọn lại "Tự chọn" → rỗng', async () => {
    server.use(
      mswHttp.get(URL_BATCHES, () =>
        paginated([
          batch('b-near', { expiryDate: '2026-11-01' }),
          batch('b-none', { expiryDate: null }),
        ]),
      ),
    )
    const { user } = renderWithProviders(
      <Harness items={[line({ materialSlug: 'm-VT-01', unitSlug: 'u-kg' })]} />,
    )
    await user.click(screen.getByRole('combobox', { name: /^Lô/ }))
    const options = await screen.findAllByRole('option')
    // mục đầu "Tự chọn", rồi lô hạn gần trước, không hạn sau
    expect(options[0]).toHaveTextContent('Tự chọn')
    expect(options[1]).toHaveTextContent('PN-001')
    expect(options[2]).toHaveTextContent('Không hạn')
    await user.click(options[1] as HTMLElement)
    expect(current?.items[0]?.batchSlug).toBe('b-near')
    expect(screen.getByRole('combobox', { name: /^Lô/ })).toHaveTextContent(
      'HSD 01/11/2026 · còn 50 KG',
    )

    await user.click(screen.getByRole('combobox', { name: /^Lô/ }))
    await user.click(await screen.findByRole('option', { name: /Tự chọn/ }))
    expect(current?.items[0]?.batchSlug).toBe('')
  })

  it('lô hết hạn có nhãn "Đã hết hạn" nhưng chọn được; lô giữ chỗ hết thì "Đã giữ chỗ hết" và khoá', async () => {
    server.use(
      mswHttp.get(URL_BATCHES, () =>
        paginated([
          batch('b-old', { expiryDate: '2020-01-01' }),
          batch('b-held', { availableQuantity: 0, reservedQuantity: 50 }),
        ]),
      ),
    )
    const { user } = renderWithProviders(
      <Harness items={[line({ materialSlug: 'm-VT-01', unitSlug: 'u-kg' })]} />,
    )
    await user.click(screen.getByRole('combobox', { name: /^Lô/ }))
    const expired = await screen.findByRole('option', { name: /Đã hết hạn/ })
    const held = screen.getByRole('option', { name: /Đã giữ chỗ hết/ })
    expect(held).toHaveAttribute('aria-disabled', 'true')
    expect(expired).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(expired)
    expect(current?.items[0]?.batchSlug).toBe('b-old')
  })

  it('thiếu quyền chọn lô: chỉ chữ "Tự chọn", không nút, MSW không nhận GET material-batches', async () => {
    const hit = vi.fn()
    server.use(
      mswHttp.get(URL_BATCHES, () => {
        hit()
        return paginated([])
      }),
    )
    renderWithProviders(
      <Harness
        canPickBatch={false}
        items={[line({ materialSlug: 'm-VT-01', unitSlug: 'u-kg' })]}
      />,
    )
    const row = screen.getByTestId('line-0')
    expect(within(row).getByText('Tự chọn')).toBeInTheDocument()
    expect(within(row).queryByRole('combobox', { name: /^Lô/ })).not.toBeInTheDocument()
    // chờ một nhịp để chắc chắn không có yêu cầu muộn
    await new Promise((r) => setTimeout(r, 50))
    expect(hit).not.toHaveBeenCalled()
  })

  it('chưa mở danh sách thì không tải lô', async () => {
    const hit = vi.fn()
    server.use(
      mswHttp.get(URL_BATCHES, () => {
        hit()
        return paginated([])
      }),
    )
    renderWithProviders(<Harness items={[line({ materialSlug: 'm-VT-01', unitSlug: 'u-kg' })]} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(hit).not.toHaveBeenCalled()
  })

  it('lý do Bán có cột Đơn giá + Thành tiền; đổi sang Khác thì ẩn, quay lại Bán giá đã xoá không hồi sinh', async () => {
    const { user } = renderWithProviders(
      <Harness
        type="SALE"
        items={[line({ materialSlug: 'm-VT-01', unitSlug: 'u-kg', quantity: 2, unitPrice: 1500 })]}
      />,
    )
    expect(screen.getByLabelText(/^Đơn giá/)).toHaveValue('1.500')
    expect(screen.getByTestId('line-amount-0')).toHaveTextContent('3.000')

    await user.click(screen.getByRole('button', { name: 'đổi sang Khác' }))
    expect(screen.queryByLabelText(/^Đơn giá/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('line-amount-0')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'xoá giá' }))
    await user.click(screen.getByRole('button', { name: 'đổi sang Bán' }))
    expect(screen.getByLabelText(/^Đơn giá/)).toHaveValue('')
    // Giá trị TRONG FORM cũng phải trống (không chỉ ô hiển thị), kể cả khi defaultValues có giá (nháp đã tải).
    expect(formRef?.getValues('items.0.unitPrice')).toBeUndefined()
    await user.click(screen.getByRole('button', { name: 'gửi' }))
    expect(
      await screen.findByText('Đơn giá phải ≥ 0, tối đa 2 chữ số thập phân'),
    ).toBeInTheDocument()
  })

  it('không phải Bán: không có cột giá', () => {
    renderWithProviders(<Harness items={[line({ materialSlug: 'm-VT-01', unitSlug: 'u-kg' })]} />)
    expect(screen.queryByLabelText(/^Đơn giá/)).not.toBeInTheDocument()
  })

  it('dòng vượt khả dụng hiện câu đỏ và nối aria-describedby vào ô Số lượng', () => {
    renderWithProviders(
      <Harness
        items={[line({ materialSlug: 'm-VT-01', unitSlug: 'u-kg', quantity: 500 })]}
        shortages={[{ index: 0, available: 120, requested: 500, baseUnitCode: 'KG' }]}
      />,
    )
    const message = screen.getByText('Chỉ còn 120 KG khả dụng')
    const quantity = screen.getByLabelText(/^Số lượng/)
    expect(quantity.getAttribute('aria-describedby')).toContain(message.id)
  })

  it('đơn vị quy đổi hiện "= n KG"', () => {
    renderWithProviders(
      <Harness items={[line({ materialSlug: 'm-VT-01', unitSlug: 'u-bag', quantity: 2 })]} />,
    )
    expect(screen.getByText('= 50 KG')).toBeInTheDocument()
  })

  it('stockTotal > 500: ô xổ ghi "Chỉ tìm trong 500 vật tư đầu của kho"', async () => {
    const { user } = renderWithProviders(<Harness stockTotal={800} />)
    await user.click(screen.getByRole('combobox', { name: /^Vật tư/ }))
    expect(screen.getByText('Chỉ tìm trong 500 vật tư đầu của kho')).toBeInTheDocument()
  })

  it('stockTotal ≤ 500: không có chú thích', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: /^Vật tư/ }))
    expect(screen.queryByText(/Chỉ tìm trong/)).not.toBeInTheDocument()
  })

  it('"Thêm dòng" và "Xoá dòng"', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Thêm dòng' }))
    expect(screen.getAllByTestId(/^line-\d+$/)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Xoá dòng 1' }))
    expect(screen.getAllByTestId(/^line-\d+$/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Xoá dòng 1' })).toBeDisabled()
  })

  describe('Chọn nhiều vật tư', () => {
    it('tick 3 vật tư → 3 dòng (lấp dòng trống), focus ô Số lượng dòng mới đầu tiên', async () => {
      const { user } = renderWithProviders(<Harness />)
      await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('checkbox', { name: /Muối/ }))
      await user.click(within(dialog).getByRole('checkbox', { name: /Bột mì/ }))
      await user.click(within(dialog).getByRole('checkbox', { name: /Gạo/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Thêm 3 dòng' }))

      await waitFor(() => expect(current?.items).toHaveLength(3))
      // thứ tự của kho, không theo thứ tự tick
      expect(current?.items.map((i) => i.materialSlug)).toEqual(['m-VT-01', 'm-VT-03', 'm-VT-04'])
      expect(current?.items.every((i) => i.unitSlug === 'u-kg' && i.batchSlug === '')).toBe(true)
      await waitFor(() => expect(screen.getByLabelText(/^Số lượng dòng 1/)).toHaveFocus())
    })

    it('vật tư hết hàng không tick được; ô tìm lọc tại chỗ', async () => {
      const { user } = renderWithProviders(<Harness />)
      await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('checkbox', { name: /Đường cát/ })).toBeDisabled()
      expect(within(dialog).getByText('Hết hàng')).toBeInTheDocument()
      await user.type(within(dialog).getByRole('textbox', { name: /Tìm theo mã hoặc tên/ }), 'gao')
      expect(within(dialog).queryByRole('checkbox', { name: /Muối/ })).not.toBeInTheDocument()
      expect(within(dialog).getByRole('checkbox', { name: /Gạo/ })).toBeEnabled()
    })

    it('"đã có" = vật tư đã có dòng lô tự chọn; dòng lô chọn tay không chặn', async () => {
      const { user } = renderWithProviders(
        <Harness
          items={[
            line({ materialSlug: 'm-VT-01', unitSlug: 'u-kg', quantity: 1, batchSlug: '' }),
            line({ materialSlug: 'm-VT-03', unitSlug: 'u-kg', quantity: 1, batchSlug: 'b-9' }),
          ]}
        />,
      )
      await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('checkbox', { name: /Bột mì/ })).toBeDisabled()
      expect(within(dialog).getByText('đã có')).toBeInTheDocument()
      expect(within(dialog).getByRole('checkbox', { name: /Muối/ })).toBeEnabled()
    })

    it('stockTotal > 500: hộp ghi chú "Chỉ tìm trong 500 vật tư đầu của kho"', async () => {
      const { user } = renderWithProviders(<Harness stockTotal={800} />)
      await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Chỉ tìm trong 500 vật tư đầu của kho')).toBeInTheDocument()
    })

    it('huỷ hộp → focus về nút "Chọn nhiều vật tư"', async () => {
      const { user } = renderWithProviders(<Harness />)
      await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
      await user.click(await screen.findByRole('button', { name: 'Huỷ' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Chọn nhiều vật tư' })).toHaveFocus(),
      )
    })
  })
})
