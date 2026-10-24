import { zodResolver } from '@hookform/resolvers/zod'
import { screen, waitFor, within } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import type { AddMaterialDialogProps } from '@/entities/inventory'
import { renderWithProviders } from '@/shared/test/render'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Form } from '@/shared/ui/form'
import { ImportFormItemsField } from './ImportFormItemsField'
import {
  EMPTY_ITEM,
  emptyFormValues,
  importFormSchema,
  type ImportFormValues,
} from '../model/import-form-editor.schema'

// Hạ trần số dòng xuống 2 để thử "hết chỗ" mà không phải dựng 200 dòng (chậm).
vi.mock('../model/import-form-editor.schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/import-form-editor.schema')>()),
  IMPORT_FORM_ITEMS_MAX: 2,
}))

const flour: AvailableMaterial = {
  slug: 'm-flour',
  code: 'VT-01',
  name: 'Bột mì',
  baseUnitSlug: 'u-kg',
  quantity: 120,
  suppliers: [],
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
  ],
}

/** `Dialog` thật (Radix) — mở chồng lên hộp "Chọn vật tư" như hộp thêm vật tư thật. */
function FakeAddDialog({ open, onAdded, onOpenChange }: AddMaterialDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Thêm vật tư giả</DialogTitle>
        <button
          type="button"
          onClick={() => {
            onAdded({
              slug: 'm-cement',
              label: 'VT-09 · Xi măng',
              baseUnit: { slug: 'u-kg', label: 'KG · Kilogram' },
            })
            onOpenChange(false)
          }}
        >
          Gắn giả
        </button>
      </DialogContent>
    </Dialog>
  )
}

const sugar: AvailableMaterial = {
  ...flour,
  slug: 'm-sugar',
  code: 'VT-02',
  name: 'Đường',
  quantity: 0,
}

let current: ImportFormValues | undefined

function Harness({ items }: { items: ImportFormValues['items'] }) {
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { ...emptyFormValues(new Date(2026, 9, 13)), items },
  })
  current = form.watch()
  return (
    <Form {...form}>
      <ImportFormItemsField
        form={form}
        materials={[flour, sugar]}
        fallbackLabels={{}}
        warehouseSlug="w-a"
        warehouseName="Kho A"
        materialAbilities={{ search: true, assign: true, create: true, attachSupplier: true }}
        AddMaterialDialog={FakeAddDialog}
      />
    </Form>
  )
}

describe('ImportFormItemsField — hết chỗ khi hộp "Chọn vật tư" đang mở', () => {
  it('thêm qua footer lấp chỗ cuối → footer ẩn; đóng hộp → focus tiêu đề (nút mở hộp đã ẩn, "Thêm dòng" khoá)', async () => {
    const { user } = renderWithProviders(
      <Harness
        items={[{ ...EMPTY_ITEM, materialSlug: 'm-x', unitSlug: 'u-kg' }, { ...EMPTY_ITEM }]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const picker = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    await user.click(within(picker).getByRole('button', { name: /Thêm vật tư vào kho/ }))
    await user.click(await screen.findByRole('button', { name: 'Gắn giả' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Thêm vật tư giả' })).not.toBeInTheDocument(),
    )
    expect(current?.items[1]).toMatchObject({ materialSlug: 'm-cement', unitSlug: 'u-kg' })

    // Hộp chọn vẫn mở nhưng hết chỗ: không còn lối thêm vật tư, ô tick khoá.
    expect(
      within(picker).queryByRole('button', { name: /Thêm vật tư vào kho/ }),
    ).not.toBeInTheDocument()
    expect(within(picker).getByRole('checkbox', { name: /VT-01 · Bột mì/ })).toBeDisabled()
    // Footer (nơi focus đang đứng trước khi mở hộp thêm) đã ẩn → focus vẫn phải ở trong hộp chọn, không rơi về body.
    expect(picker).toContainElement(document.activeElement as HTMLElement)
    expect(document.body).not.toHaveFocus()

    await user.click(within(picker).getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Chọn nhiều vật tư' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm dòng' })).toBeDisabled()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Chi tiết vật tư' })).toHaveFocus(),
    )
  })

  it('2 dòng (1 có vật tư, 1 trống hẳn) → "Thêm dòng" khoá, hộp báo còn chọn được 1; tick 1 thì ô kia khoá; chọn lấp đúng dòng trống', async () => {
    const { user } = renderWithProviders(
      <Harness
        items={[{ ...EMPTY_ITEM, materialSlug: 'm-x', unitSlug: 'u-kg' }, { ...EMPTY_ITEM }]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Thêm dòng' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const picker = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    expect(picker).toHaveTextContent('Phiếu tối đa 2 dòng — còn chọn được 1')
    await user.click(within(picker).getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    expect(within(picker).getByRole('checkbox', { name: /VT-02 · Đường/ })).toBeDisabled()
    await user.click(within(picker).getByRole('button', { name: 'Thêm 1 dòng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(current?.items).toHaveLength(2)
    expect(current?.items[1]).toMatchObject({ materialSlug: 'm-flour', unitSlug: 'u-kg' })
    expect(current?.items[0]?.materialSlug).toBe('m-x')
  })
})
