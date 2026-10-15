import { zodResolver } from '@hookform/resolvers/zod'
import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useState } from 'react'
import type { UserEvent } from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import type { Material } from '@/entities/material'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
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

const cementAvail: AvailableMaterial = {
  slug: 'm-cement',
  code: 'VT-09',
  name: 'Xi măng',
  baseUnitSlug: 'u-kg',
  quantity: 0,
  supplierSlug: null,
  supplierName: null,
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
  ],
}

const cementMaterial: Material = {
  slug: 'm-cement',
  createdAt: '',
  updatedAt: '',
  code: 'VT-09',
  name: 'Xi măng',
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 'mt-1', code: 'MT', name: 'Vật liệu' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  suppliers: [],
}

const BASE = 'http://localhost:8085/api/v1'

let current: ImportFormValues | undefined

function Harness({
  items,
  loadError,
}: {
  items?: ImportFormValues['items']
  loadError?: { message: string; onRetry: () => void }
}) {
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { ...emptyFormValues(new Date(2026, 9, 13)), ...(items && { items }) },
  })
  current = form.watch()
  return (
    <Form {...form}>
      <ImportFormItemsField
        form={form}
        materials={loadError ? [] : [flour, sugar]}
        fallbackLabels={{}}
        warehouseSlug="w-a"
        warehouseName="Kho A"
        loadError={loadError}
      />
    </Form>
  )
}

function HarnessWithReload() {
  const [mats, setMats] = useState<AvailableMaterial[]>([flour])
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      ...emptyFormValues(new Date(2026, 9, 13)),
      items: [{ ...EMPTY_ITEM }, { ...EMPTY_ITEM }, { ...EMPTY_ITEM }],
    },
  })
  current = form.watch()
  return (
    <Form {...form}>
      <button type="button" onClick={() => setMats([flour, cementAvail])}>
        RELOAD
      </button>
      <ImportFormItemsField
        form={form}
        materials={mats}
        fallbackLabels={{}}
        warehouseSlug="w-a"
        warehouseName="Kho A"
        materialAbilities={{ search: true, assign: true, create: true, attachSupplier: true }}
      />
    </Form>
  )
}

async function pickMaterial(user: UserEvent, line: number, label: string) {
  await user.click(screen.getByRole('combobox', { name: `Vật tư dòng ${line}` }))
  await user.click(await screen.findByText(label))
}

describe('ImportFormItemsField', () => {
  it('tải vật tư lỗi → báo dưới tiêu đề kèm Thử lại; ô chọn báo không tải được thay vì "không có vật tư"', async () => {
    const onRetry = vi.fn()
    const { user } = renderWithProviders(
      <Harness loadError={{ message: 'Internal server error', onRetry }} />,
    )
    const section = screen.getByRole('region', { name: 'Dòng vật tư' })
    const alert = within(section).getByRole('alert')
    expect(alert).toHaveTextContent('Không tải được vật tư của kho: Internal server error')
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    expect(await screen.findByText('Không tải được vật tư của kho')).toBeInTheDocument()
    expect(screen.queryByText('Không có vật tư phù hợp')).not.toBeInTheDocument()
  })

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

  // Render 200 dòng thật nên chậm khi chạy cả bộ test song song; cho timeout riêng.
  it('đủ 200 dòng → khoá Thêm dòng kèm lý do', () => {
    renderWithProviders(<Harness items={Array.from({ length: 200 }, () => ({ ...EMPTY_ITEM }))} />)
    const add = screen.getByRole('button', { name: 'Thêm dòng' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription('Đã đủ 200 dòng — tối đa của một phiếu.')
  }, 20_000)

  it('ghi chú dòng ẩn, bấm biểu tượng thì hiện ô', async () => {
    const { user } = renderWithProviders(<Harness />)
    expect(screen.queryByRole('textbox', { name: 'Ghi chú dòng dòng 1' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ghi chú dòng 1' }))
    const row = screen.getByTestId('line-0')
    expect(within(row).getByRole('textbox', { name: /Ghi chú dòng/ })).toBeInTheDocument()
  })

  const withNote = [{ ...EMPTY_ITEM, materialSlug: 'm-flour', unitSlug: 'u-kg', note: 'abc' }]

  it('ghi chú có sẵn → hiện ô; xoá hết chữ thì ô vẫn còn và giữ focus', async () => {
    const { user } = renderWithProviders(<Harness items={withNote} />)
    const input = screen.getByRole('textbox', { name: /Ghi chú dòng/ })
    expect(input).toHaveValue('abc')
    await user.clear(input)
    const after = screen.getByRole('textbox', { name: /Ghi chú dòng/ })
    expect(after).toBe(input)
    expect(after).toHaveFocus()
  })

  it('bấm biểu tượng ghi chú đang mở (có chữ) → ẩn ô, aria-pressed = false', async () => {
    const { user } = renderWithProviders(<Harness items={withNote} />)
    const toggle = screen.getByRole('button', { name: 'Ghi chú dòng 1' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('textbox', { name: /Ghi chú dòng/ })).not.toBeInTheDocument()
  })

  it('dòng "＋ Thêm vật tư vào kho…" mở hộp với chữ đã gõ; gắn xong chọn NGAY chỉ dòng đó + đơn vị gốc', async () => {
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([cementMaterial])),
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => ok({ materialSlug: 'm-cement' })),
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () => paginated([])),
    )
    const { user } = renderWithProviders(<HarnessWithReload />, { auth: 'admin' })
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 3' }))
    await user.type(screen.getByRole('combobox', { name: /Tìm theo mã hoặc tên/ }), 'xi măng')
    await user.click(screen.getByRole('button', { name: /Thêm vật tư vào kho/ }))
    expect(screen.getByRole('textbox', { name: /Tìm vật tư trong danh mục/ })).toHaveValue(
      'xi măng',
    )
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Không cần tải lại: hộp trả về nhãn + đơn vị gốc nên dòng chọn ngay.
    expect(current?.items[2]).toMatchObject({ materialSlug: 'm-cement', unitSlug: 'u-kg' })
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 3' })).toHaveTextContent(
      'VT-09 · Xi măng',
    )
    expect(current?.items[0].materialSlug).toBe('')
    expect(current?.items[1].materialSlug).toBe('')
  })

  it('vật tư vừa gắn không nằm trong materials (ngoài 100 bản ghi) → dòng vẫn hiện nhãn và đơn vị gốc', async () => {
    server.use(
      mswHttp.get(`${BASE}/materials`, () => paginated([cementMaterial])),
      mswHttp.put(`${BASE}/warehouses/w-a/materials`, () => ok({ materialSlug: 'm-cement' })),
      mswHttp.get(`${BASE}/warehouses/w-a/import-forms/available-materials`, () => paginated([])),
    )
    const { user } = renderWithProviders(<HarnessWithReload />, { auth: 'admin' })
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.type(screen.getByRole('combobox', { name: /Tìm theo mã hoặc tên/ }), 'xi măng')
    await user.click(screen.getByRole('button', { name: /Thêm vật tư vào kho/ }))
    await user.click(await screen.findByRole('button', { name: 'Gắn vào kho' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(current?.items[0]).toMatchObject({ materialSlug: 'm-cement', unitSlug: 'u-kg' })
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 1' })).toHaveTextContent(
      'VT-09 · Xi măng',
    )
    expect(selectedLabel('Đơn vị dòng 1')).toBe('KG · Kilogram')
  })

  it('không có quyền tìm danh mục → không có dòng "Thêm vật tư vào kho…"', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    expect(screen.queryByRole('button', { name: /Thêm vật tư vào kho/ })).not.toBeInTheDocument()
  })
})
