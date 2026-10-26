import { screen, waitFor, within } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { InventoryItem } from '@/entities/inventory'
import { renderWithProviders } from '@/shared/test/render'
import { Form } from '@/shared/ui/form'
import { ExportFormItemsField } from './ExportFormItemsField'
import {
  EMPTY_EXPORT_ITEM,
  emptyExportFormValues,
  type ExportFormValues,
} from '../model/export-form-editor.schema'

// Hạ trần số dòng xuống 2 để thử "hết chỗ" mà không phải dựng 200 dòng (chậm).
vi.mock('../model/export-form-editor.schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/export-form-editor.schema')>()),
  EXPORT_FORM_ITEMS_MAX: 2,
}))

const stock = (code: string, name: string): InventoryItem =>
  ({
    materialSlug: `m-${code}`,
    materialCode: code,
    materialName: name,
    availableQuantity: 10,
    baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
    units: [
      {
        unitSlug: 'u-kg',
        unitCode: 'KG',
        unitName: 'Kilogram',
        conversionRate: 1,
        isBaseUnit: true,
      },
    ],
  }) as InventoryItem

const STOCK = [stock('VT-01', 'Bột mì'), stock('VT-02', 'Đường')]

let current: ExportFormValues | undefined

function Harness({ items }: { items: ExportFormValues['items'] }) {
  const form = useForm<ExportFormValues>({
    defaultValues: { ...emptyExportFormValues(new Date(2026, 9, 26)), type: 'OTHER', items },
  })
  current = form.watch()
  return (
    <Form {...form}>
      <ExportFormItemsField
        form={form}
        warehouseSlug="w-a"
        stock={STOCK}
        stockTotal={STOCK.length}
        shortages={[]}
        canPickBatch
        batchesBySlug={new Map()}
      />
    </Form>
  )
}

const used = { ...EMPTY_EXPORT_ITEM, materialSlug: 'm-x', unitSlug: 'u-kg' }

describe('ExportFormItemsField — tối đa số dòng', () => {
  it('2 dòng (1 có vật tư, 1 trống hẳn): hộp báo còn chọn được 1; tick 1 thì ô kia khoá; chọn lấp đúng dòng trống', async () => {
    const { user } = renderWithProviders(<Harness items={[used, { ...EMPTY_EXPORT_ITEM }]} />)
    expect(screen.getByRole('button', { name: 'Thêm dòng' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const picker = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    expect(picker).toHaveTextContent('Phiếu tối đa 2 dòng — còn chọn được 1')
    await user.click(within(picker).getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    expect(within(picker).getByRole('checkbox', { name: /VT-02 · Đường/ })).toBeDisabled()
    await user.click(within(picker).getByRole('button', { name: 'Thêm 1 dòng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(current?.items).toHaveLength(2)
    expect(current?.items[1]).toMatchObject({ materialSlug: 'm-VT-01', unitSlug: 'u-kg' })
    expect(current?.items[0]?.materialSlug).toBe('m-x')
  })

  it('đủ dòng, không còn dòng trống: ẩn nút "Chọn nhiều vật tư", "Thêm dòng" khoá kèm câu giải thích', () => {
    renderWithProviders(<Harness items={[used, { ...used, materialSlug: 'm-y' }]} />)
    expect(screen.queryByRole('button', { name: 'Chọn nhiều vật tư' })).not.toBeInTheDocument()
    const add = screen.getByRole('button', { name: 'Thêm dòng' })
    expect(add).toBeDisabled()
    expect(screen.getByText('Đã đủ 200 dòng — tối đa của một phiếu.')).toBeInTheDocument()
  })
})
