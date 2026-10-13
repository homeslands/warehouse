import { zodResolver } from '@hookform/resolvers/zod'
import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import { Form } from '@/shared/ui/form'
import { renderWithProviders } from '@/shared/test/render'
import { chooseOption, selectedLabel } from '@/shared/test/select'
import { ImportFormItemsField } from './ImportFormItemsField'
import {
  EMPTY_ITEM,
  emptyFormValues,
  importFormSchema,
  type ImportFormValues,
} from '../model/import-form-editor.schema'

const flour: AvailableMaterial = {
  slug: 'm-flour',
  code: 'VT-01',
  name: 'Bột mì',
  baseUnitSlug: 'u-kg',
  quantity: 120,
  supplierSlug: 's-1',
  supplierName: 'NCC Bột',
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
}

const sugar: AvailableMaterial = {
  slug: 'm-sugar',
  code: 'VT-02',
  name: 'Đường',
  baseUnitSlug: 'u-kg',
  quantity: 0,
  supplierSlug: null,
  supplierName: null,
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
  ],
}

let current: ImportFormValues | undefined

function Harness({ items }: { items?: ImportFormValues['items'] }) {
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { ...emptyFormValues(new Date(2026, 9, 13)), ...(items && { items }) },
  })
  current = form.watch()
  return (
    <Form {...form}>
      <ImportFormItemsField form={form} materials={[flour, sugar]} fallbackLabels={{}} />
    </Form>
  )
}

async function pickMaterial(user: UserEvent, line: number, label: string) {
  await user.click(screen.getByRole('combobox', { name: `Vật tư dòng ${line}` }))
  await user.click(await screen.findByText(label))
}

describe('ImportFormItemsField', () => {
  it('chọn vật tư → đơn vị mặc định là đơn vị gốc, hiện tồn', async () => {
    const { user } = renderWithProviders(<Harness />)
    await pickMaterial(user, 1, 'VT-01 · Bột mì')
    expect(current?.items[0]).toMatchObject({ materialSlug: 'm-flour', unitSlug: 'u-kg' })
    expect(screen.getByText('Tồn: 120 KG')).toBeInTheDocument()
  })

  it('đơn vị quy đổi → hiện số quy đổi; đổi vật tư → đơn vị về gốc của vật tư mới', async () => {
    const { user } = renderWithProviders(<Harness />)
    await pickMaterial(user, 1, 'VT-01 · Bột mì')
    await chooseOption(user, 'Đơn vị dòng 1', 'BAG · Bao 25kg')
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '2')
    expect(screen.getByText('= 50 KG')).toBeInTheDocument()

    await pickMaterial(user, 1, 'VT-02 · Đường')
    expect(current?.items[0]).toMatchObject({ materialSlug: 'm-sugar', unitSlug: 'u-kg' })
    expect(selectedLabel('Đơn vị dòng 1')).toContain('KG')
  })

  it('thành tiền = SL × đơn giá, làm tròn', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.type(screen.getByRole('textbox', { name: 'Số lượng dòng 1' }), '3')
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '0.1')
    expect(screen.getByTestId('line-amount-0')).toHaveTextContent(/0,3/)
  })

  it('thêm / xoá dòng; còn 1 dòng thì không xoá được', async () => {
    const { user } = renderWithProviders(<Harness />)
    expect(screen.getByRole('button', { name: 'Xoá dòng 1' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Thêm dòng' }))
    expect(current?.items).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Xoá dòng 2' }))
    expect(current?.items).toHaveLength(1)
  })

  it('đủ 200 dòng → khoá Thêm dòng kèm lý do', () => {
    renderWithProviders(<Harness items={Array.from({ length: 200 }, () => ({ ...EMPTY_ITEM }))} />)
    const add = screen.getByRole('button', { name: 'Thêm dòng' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription('Đã đủ 200 dòng — tối đa của một phiếu.')
  })

  it('ghi chú dòng ẩn, bấm biểu tượng thì hiện ô', async () => {
    const { user } = renderWithProviders(<Harness />)
    expect(screen.queryByRole('textbox', { name: 'Ghi chú dòng dòng 1' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ghi chú dòng 1' }))
    const row = screen.getByTestId('line-0')
    expect(within(row).getByRole('textbox', { name: /Ghi chú dòng/ })).toBeInTheDocument()
  })
})
