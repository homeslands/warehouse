import { zodResolver } from '@hookform/resolvers/zod'
import { screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { UserEvent } from '@testing-library/user-event'
import { http as mswHttp } from 'msw'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import type { AddMaterialDialogProps } from '@/entities/inventory'
import { apiError, paginated } from '@/shared/test/api'
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
  suppliers: [{ slug: 's-1', code: 'NCC-01', name: 'NCC Bột' }],
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
  suppliers: [],
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
  suppliers: [],
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
  ],
}

const steel: AvailableMaterial = {
  slug: 'm-steel',
  code: 'VT-07',
  name: 'Thép cuộn',
  baseUnitSlug: 'u-ton',
  quantity: 8,
  suppliers: [],
  units: [
    { unitSlug: 'u-ton', unitCode: 'TON', unitName: 'Tấn', conversionRate: 1, isBaseUnit: true },
  ],
}

const SUPPLIERS = [
  { slug: 's-1', code: 'NCC-01', name: 'Minh Phát' },
  { slug: 's-2', code: 'NCC-02', name: 'Hoà Phát' },
]
const URL_AVAILABLE = 'http://localhost:8085/api/v1/warehouses/w-a/import-forms/available-materials'

/** Hộp giả: hiện chữ đã gõ, nút "Gắn giả" trả về xi măng (hộp thật có test riêng ở feature của nó). */
function FakeAddDialog({
  open,
  initialSearch,
  defaultSupplierSlug,
  onAdded,
  onOpenChange,
}: AddMaterialDialogProps) {
  if (!open) return null
  return (
    <div role="dialog" aria-label="Thêm vật tư giả">
      <p>Tìm: {initialSearch}</p>
      <p>NCC chọn sẵn: {defaultSupplierSlug ?? 'không'}</p>
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
    </div>
  )
}

let current: ImportFormValues | undefined

function Harness({
  items,
  loadError,
  supplierSlug = '',
  canPickSupplier = false,
}: {
  items?: ImportFormValues['items']
  loadError?: { message: string; onRetry: () => void }
  supplierSlug?: string
  canPickSupplier?: boolean
}) {
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      ...emptyFormValues(new Date(2026, 9, 13)),
      supplierSlug,
      ...(items && { items }),
    },
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
        canPickSupplier={canPickSupplier}
        suppliers={SUPPLIERS}
      />
    </Form>
  )
}

function HarnessWithReload({
  withDialog = true,
  supplierSlug = '',
  overrideLine3 = '',
}: {
  withDialog?: boolean
  supplierSlug?: string
  overrideLine3?: string
}) {
  const [mats, setMats] = useState<AvailableMaterial[]>([flour])
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      ...emptyFormValues(new Date(2026, 9, 13)),
      supplierSlug,
      items: [
        { ...EMPTY_ITEM },
        { ...EMPTY_ITEM },
        { ...EMPTY_ITEM, supplierOverride: overrideLine3 },
      ],
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
        AddMaterialDialog={withDialog ? FakeAddDialog : undefined}
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
    const section = screen.getByRole('region', { name: 'Chi tiết vật tư' })
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
    // Ô tiền tiếng Việt: dấu phẩy là thập phân (dấu chấm là nhóm nghìn).
    await user.type(screen.getByRole('textbox', { name: 'Đơn giá dòng 1' }), '0,1')
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
    const { user } = renderWithProviders(<HarnessWithReload />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 3' }))
    await user.type(screen.getByRole('combobox', { name: /Tìm theo mã hoặc tên/ }), 'xi măng')
    await user.click(screen.getByRole('button', { name: /Thêm vật tư vào kho/ }))
    expect(screen.getByText('Tìm: xi măng')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Gắn giả' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Không cần tải lại: hộp trả về nhãn + đơn vị gốc nên dòng chọn ngay.
    expect(current?.items[2]).toMatchObject({ materialSlug: 'm-cement', unitSlug: 'u-kg' })
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 3' })).toHaveTextContent(
      'VT-09 · Xi măng',
    )
    expect(current?.items[0].materialSlug).toBe('')
    expect(current?.items[1].materialSlug).toBe('')
  })

  it('hộp thêm vật tư nhận NCC hiệu lực của dòng mở hộp (theo đầu phiếu, hoặc ghi đè riêng); không có NCC → không chọn sẵn', async () => {
    const open = async (user: UserEvent) => {
      await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 3' }))
      await user.click(screen.getByRole('button', { name: /Thêm vật tư vào kho/ }))
    }
    const header = renderWithProviders(<HarnessWithReload supplierSlug="s-1" />)
    await open(header.user)
    expect(screen.getByText('NCC chọn sẵn: s-1')).toBeInTheDocument()
    header.unmount()

    const override = renderWithProviders(
      <HarnessWithReload supplierSlug="s-1" overrideLine3="s-2" />,
    )
    await open(override.user)
    expect(screen.getByText('NCC chọn sẵn: s-2')).toBeInTheDocument()
    override.unmount()

    const none = renderWithProviders(<HarnessWithReload />)
    await open(none.user)
    expect(screen.getByText('NCC chọn sẵn: không')).toBeInTheDocument()
  })

  it('vật tư vừa gắn không nằm trong materials (ngoài 100 bản ghi) → dòng vẫn hiện nhãn và đơn vị gốc', async () => {
    const { user } = renderWithProviders(<HarnessWithReload />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.type(screen.getByRole('combobox', { name: /Tìm theo mã hoặc tên/ }), 'xi măng')
    await user.click(screen.getByRole('button', { name: /Thêm vật tư vào kho/ }))
    await user.click(await screen.findByRole('button', { name: 'Gắn giả' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(current?.items[0]).toMatchObject({ materialSlug: 'm-cement', unitSlug: 'u-kg' })
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 1' })).toHaveTextContent(
      'VT-09 · Xi măng',
    )
    expect(selectedLabel('Đơn vị dòng 1')).toBe('KG')
    expect(screen.getByRole('combobox', { name: 'Đơn vị dòng 1' })).toHaveAttribute(
      'title',
      'KG · Kilogram',
    )
  })

  it('không có quyền tìm danh mục → không có dòng "Thêm vật tư vào kho…"', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    expect(screen.queryByRole('button', { name: /Thêm vật tư vào kho/ })).not.toBeInTheDocument()
  })

  it('không truyền AddMaterialDialog (dù có quyền tìm) → không có dòng "Thêm vật tư vào kho…"', async () => {
    const { user } = renderWithProviders(<HarnessWithReload withDialog={false} />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    expect(screen.queryByRole('button', { name: /Thêm vật tư vào kho/ })).not.toBeInTheDocument()
  })

  it('đầu phiếu có bên bán → ô vật tư chia nhóm "Hàng thường mua của …" rồi "Vật tư khác trong kho"', async () => {
    const { user } = renderWithProviders(<Harness supplierSlug="s-1" canPickSupplier />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    const headings = Array.from(document.querySelectorAll('[cmdk-group-heading]')).map(
      (h) => h.textContent,
    )
    expect(headings).toEqual(['Hàng thường mua của Minh Phát', 'Vật tư khác trong kho'])
    const groups = Array.from(document.querySelectorAll('[cmdk-group]'))
    expect(within(groups[0] as HTMLElement).getAllByRole('option')).toHaveLength(1)
    expect(within(groups[0] as HTMLElement).getByText('VT-01 · Bột mì')).toBeInTheDocument()
    expect(within(groups[1] as HTMLElement).getByText('VT-02 · Đường')).toBeInTheDocument()
  })

  it('chưa có bên bán hiệu lực → một nhóm, không tiêu đề', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    expect(document.querySelectorAll('[cmdk-group-heading]')).toHaveLength(0)
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('gõ "thép" → hỏi BE theo tên; chọn vật tư chỉ có trong kết quả tìm vẫn có nhãn, tồn và đơn vị', async () => {
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(URL_AVAILABLE, ({ request }) => {
        seen.push(new URL(request.url).searchParams)
        return paginated([steel], { size: 50 })
      }),
    )
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.type(screen.getByRole('combobox', { name: /Tìm theo mã hoặc tên/ }), 'thép')
    await user.click(await screen.findByRole('option', { name: 'VT-07 · Thép cuộn' }))

    expect(seen.at(-1)?.get('name')).toBe('thép')
    expect(current?.items[0]).toMatchObject({ materialSlug: 'm-steel', unitSlug: 'u-ton' })
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 1' })).toHaveTextContent(
      'VT-07 · Thép cuộn',
    )
    expect(screen.getByText('Tồn: 8 TON')).toBeInTheDocument()
    expect(selectedLabel('Đơn vị dòng 1')).toBe('TON')
    expect(screen.getByRole('combobox', { name: 'Đơn vị dòng 1' })).toHaveAttribute(
      'title',
      'TON · Tấn',
    )
  })

  it('tìm vật tư lỗi → ô chọn báo không tải được, không nói "không có vật tư"', async () => {
    server.use(mswHttp.get(URL_AVAILABLE, () => apiError(500, 100500, 'Internal error')))
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))
    await user.type(screen.getByRole('combobox', { name: /Tìm theo mã hoặc tên/ }), 'thép')
    expect(await screen.findByText('Không tải được vật tư của kho')).toBeInTheDocument()
    expect(screen.queryByText('Không có vật tư phù hợp')).not.toBeInTheDocument()
  })

  it('mở "đổi bên bán" rồi Esc không chọn gì → dòng quay lại "theo đầu phiếu", lại thấy nút "đổi bên bán"', async () => {
    const { user } = renderWithProviders(
      <Harness supplierSlug="s-1" canPickSupplier items={[{ ...EMPTY_ITEM }, { ...EMPTY_ITEM }]} />,
    )
    const line2 = screen.getByTestId('line-1')
    await user.click(within(line2).getByRole('button', { name: 'đổi bên bán' }))
    expect(await screen.findByRole('option', { name: 'NCC-02 · Hoà Phát' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(within(line2).getByRole('button', { name: 'đổi bên bán' })).toBeInTheDocument(),
    )
    expect(within(line2).queryByRole('combobox', { name: /Bên bán/ })).not.toBeInTheDocument()
    expect(within(line2).queryByRole('button', { name: 'theo đầu phiếu' })).not.toBeInTheDocument()
    expect(current?.items[1].supplierOverride).toBe('')
  })

  it('đổi bên bán cho một dòng → "Bên bán: …"; "theo đầu phiếu" trả về rỗng', async () => {
    const { user } = renderWithProviders(
      <Harness supplierSlug="s-1" canPickSupplier items={[{ ...EMPTY_ITEM }, { ...EMPTY_ITEM }]} />,
    )
    const line2 = screen.getByTestId('line-1')
    expect(within(line2).queryByText(/Mua của/)).not.toBeInTheDocument()
    await user.click(within(line2).getByRole('button', { name: 'đổi bên bán' }))
    await user.click(await screen.findByRole('option', { name: 'NCC-02 · Hoà Phát' }))

    expect(current?.items[1].supplierOverride).toBe('s-2')
    expect(current?.items[0].supplierOverride).toBe('')
    expect(within(line2).getByText('Bên bán: Hoà Phát')).toBeInTheDocument()

    await user.click(within(line2).getByRole('button', { name: 'theo đầu phiếu' }))
    expect(current?.items[1].supplierOverride).toBe('')
    expect(within(line2).queryByText(/Mua của/)).not.toBeInTheDocument()
  })

  it('không có quyền chọn bên bán → không có nút "đổi bên bán"', () => {
    renderWithProviders(<Harness supplierSlug="s-1" />)
    expect(screen.queryByRole('button', { name: 'đổi bên bán' })).not.toBeInTheDocument()
  })
})
