import { zodResolver } from '@hookform/resolvers/zod'
import { screen, waitFor, within } from '@testing-library/react'
import { useState, type ComponentType } from 'react'
import type { UserEvent } from '@testing-library/user-event'
import { http as mswHttp } from 'msw'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import type { AddMaterialDialogProps } from '@/entities/inventory'
import { apiError, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
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

/** Như `FakeAddDialog` nhưng là `Dialog` thật (Radix) — mở chồng lên hộp "Chọn vật tư" như hộp thật. */
function FakeRadixAddDialog({
  open,
  initialSearch,
  onAdded,
  onOpenChange,
}: AddMaterialDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Thêm vật tư giả</DialogTitle>
        <p>Tìm: {initialSearch}</p>
        <button type="button" onClick={() => onOpenChange(false)}>
          Đóng giả
        </button>
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

let current: ImportFormValues | undefined

function Harness({
  items,
  loadError,
  supplierSlug = '',
  canPickSupplier = false,
  onMaterialPicked,
}: {
  items?: ImportFormValues['items']
  loadError?: { message: string; onRetry: () => void }
  supplierSlug?: string
  canPickSupplier?: boolean
  onMaterialPicked?: (m: AvailableMaterial) => void
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
        onMaterialPicked={onMaterialPicked}
      />
    </Form>
  )
}

function HarnessWithReload({
  withDialog = true,
  supplierSlug = '',
  overrideLine3 = '',
  Dialog: AddDialog = FakeAddDialog,
}: {
  withDialog?: boolean
  supplierSlug?: string
  overrideLine3?: string
  Dialog?: ComponentType<AddMaterialDialogProps>
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
        AddMaterialDialog={withDialog ? AddDialog : undefined}
      />
    </Form>
  )
}

async function pickMaterial(user: UserEvent, line: number, label: string) {
  await user.click(screen.getByRole('combobox', { name: `Vật tư dòng ${line}` }))
  await user.click(await screen.findByRole('option', { name: new RegExp(label) }))
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
    expect(
      within(groups[0] as HTMLElement).getByRole('option', { name: /VT-01 · Bột mì/ }),
    ).toBeInTheDocument()
    expect(
      within(groups[1] as HTMLElement).getByRole('option', { name: /VT-02 · Đường/ }),
    ).toBeInTheDocument()
  })

  it('ô xổ vật tư: mỗi mục có mã, tên, "Tồn: <số> <đơn vị gốc>" và các mã đơn vị; danh sách cao ~60vh; chọn vẫn điền đơn vị gốc', async () => {
    const { user } = renderWithProviders(<Harness supplierSlug="s-1" canPickSupplier />)
    await user.click(screen.getByRole('combobox', { name: 'Vật tư dòng 1' }))

    const row = screen.getByRole('option', { name: /VT-01/ })
    expect(within(row).getByText('VT-01')).toBeInTheDocument()
    expect(within(row).getByText(/Bột mì/)).toBeInTheDocument()
    expect(within(row).getByText('Tồn: 120 KG')).toBeInTheDocument()
    expect(within(row).getByText('KG, BAG')).toBeInTheDocument()
    expect(document.querySelector('[cmdk-list]')).toHaveClass('max-h-[60vh]')
    // Nhóm vẫn đúng thứ tự.
    const headings = Array.from(document.querySelectorAll('[cmdk-group-heading]')).map(
      (h) => h.textContent,
    )
    expect(headings).toEqual(['Hàng thường mua của Minh Phát', 'Vật tư khác trong kho'])

    await user.click(row)
    expect(current?.items[0]).toMatchObject({ materialSlug: 'm-flour', unitSlug: 'u-kg' })
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 1' })).toHaveTextContent(
      'VT-01 · Bột mì',
    )
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

  it('"Chọn nhiều vật tư": tick → lấp dòng trống trước, đơn vị gốc, báo lên sheet, focus Số lượng dòng mới đầu tiên', async () => {
    const onMaterialPicked = vi.fn()
    const { user } = renderWithProviders(
      <Harness
        onMaterialPicked={onMaterialPicked}
        items={[
          { ...EMPTY_ITEM, materialSlug: 'm-sugar', unitSlug: 'u-kg', quantity: 3 },
          { ...EMPTY_ITEM },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    // Đường đã có ở dòng 1 → khoá.
    expect(within(dialog).getByRole('checkbox', { name: /VT-02 · Đường/ })).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Thêm 1 dòng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(current?.items).toHaveLength(2)
    expect(current?.items[0]).toMatchObject({
      materialSlug: 'm-sugar',
      unitSlug: 'u-kg',
      quantity: 3,
    })
    expect(current?.items[1]).toMatchObject({ materialSlug: 'm-flour', unitSlug: 'u-kg' })
    expect(onMaterialPicked).toHaveBeenCalledWith(flour)
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 2' })).toHaveTextContent(
      'VT-01 · Bột mì',
    )
    expect(selectedLabel('Đơn vị dòng 2')).toBe('KG')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Số lượng dòng 2' })).toHaveFocus(),
    )
  })

  it('"Chọn nhiều vật tư": tick 2 vật tư (1 từ kết quả tìm BE) → 2 dòng mới nối cuối với đơn vị gốc', async () => {
    server.use(mswHttp.get(URL_AVAILABLE, () => paginated([steel], { size: 50 })))
    const { user } = renderWithProviders(
      <Harness items={[{ ...EMPTY_ITEM, materialSlug: 'm-sugar', unitSlug: 'u-kg' }]} />,
    )
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    await user.click(within(dialog).getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Tìm theo mã hoặc tên' }), 'thép')
    await user.click(await within(dialog).findByRole('checkbox', { name: /VT-07 · Thép cuộn/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Thêm 2 dòng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(current?.items.map((i) => [i.materialSlug, i.unitSlug])).toEqual([
      ['m-sugar', 'u-kg'],
      // Thứ tự: danh sách tải sẵn trước, vật tư chỉ có trong kết quả tìm sau (không theo ô tìm lúc bấm).
      ['m-flour', 'u-kg'],
      ['m-steel', 'u-ton'],
    ])
    // Vật tư chỉ có trong kết quả tìm vẫn có nhãn và đơn vị ở dòng.
    expect(screen.getByRole('combobox', { name: 'Vật tư dòng 3' })).toHaveTextContent(
      'VT-07 · Thép cuộn',
    )
    expect(selectedLabel('Đơn vị dòng 3')).toBe('TON')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Số lượng dòng 2' })).toHaveFocus(),
    )
  })

  it('hộp "Chọn vật tư" có "＋ Thêm vật tư vào kho…": vật tư vừa thêm thành dòng ngay (dòng trống đầu tiên)', async () => {
    const { user } = renderWithProviders(<HarnessWithReload Dialog={FakeRadixAddDialog} />)
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const picker = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    await user.click(within(picker).getByRole('button', { name: /Thêm vật tư vào kho/ }))
    await user.click(await screen.findByRole('button', { name: 'Gắn giả' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Thêm vật tư giả' })).not.toBeInTheDocument(),
    )
    expect(current?.items[0]).toMatchObject({ materialSlug: 'm-cement', unitSlug: 'u-kg' })
    expect(current?.items).toHaveLength(3)
    // Hộp "Chọn vật tư" vẫn mở (giữ các ô đã tick); dòng đã mang nhãn của vật tư vừa thêm.
    expect(screen.getByRole('dialog', { name: 'Chọn vật tư' })).toBeInTheDocument()
    expect(within(screen.getByTestId('line-0')).getByText('VT-09 · Xi măng')).toBeInTheDocument()
  })

  it('footer của hộp "Chọn vật tư": chữ đang tìm thành initialSearch; đóng hộp thêm → focus vẫn nằm trong hộp chọn', async () => {
    server.use(mswHttp.get(URL_AVAILABLE, () => paginated([steel], { size: 50 })))
    const { user } = renderWithProviders(<HarnessWithReload Dialog={FakeRadixAddDialog} />)
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const picker = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    await user.type(within(picker).getByRole('textbox', { name: /Tìm theo mã hoặc tên/ }), 'thép')
    await user.click(within(picker).getByRole('button', { name: /Thêm vật tư vào kho/ }))
    const adding = await screen.findByRole('dialog', { name: 'Thêm vật tư giả' })
    expect(adding).toHaveTextContent('Tìm: thép')
    await user.click(within(adding).getByRole('button', { name: 'Đóng giả' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Thêm vật tư giả' })).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(picker).toContainElement(document.activeElement as HTMLElement))
    expect(document.body).not.toHaveFocus()
  })

  it('huỷ hộp "Chọn vật tư" → không đổi dòng, focus về nút mở hộp', async () => {
    const { user } = renderWithProviders(<Harness />)
    const open = screen.getByRole('button', { name: 'Chọn nhiều vật tư' })
    await user.click(open)
    const dialog = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    await user.click(within(dialog).getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(current?.items).toEqual([EMPTY_ITEM])
    await waitFor(() => expect(open).toHaveFocus())
  })

  // Render 200 dòng thật nên chậm khi chạy cả bộ test song song: một lần render cho cả hai khẳng định, timeout riêng,
  // và truy vấn bằng chữ (`getByText`) — tính vai trò / tên khả truy cập cho 200 dòng rất chậm.
  const filledLines = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      ...EMPTY_ITEM,
      materialSlug: `m-${i}`,
      unitSlug: 'u-kg',
    }))
  const addLineButton = () => screen.getByText('Thêm dòng').closest('button')

  it('200 dòng đều có vật tư → khoá "Thêm dòng" kèm lý do và ẩn "Chọn nhiều vật tư"', () => {
    renderWithProviders(<Harness items={filledLines(200)} />)
    const add = addLineButton()
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription('Đã đủ 200 dòng — tối đa của một phiếu.')
    expect(screen.queryByText('Chọn nhiều vật tư')).not.toBeInTheDocument()
  }, 20_000)

  it('dòng trống hẳn đang mở ô ghi chú (chưa gõ) → được lấp thì ô ghi chú đóng lại', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Ghi chú dòng 1' }))
    expect(screen.getByRole('textbox', { name: /Ghi chú dòng/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    await user.click(within(dialog).getByRole('checkbox', { name: /VT-01 · Bột mì/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Thêm 1 dòng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(current?.items).toEqual([{ ...EMPTY_ITEM, materialSlug: 'm-flour', unitSlug: 'u-kg' }])
    expect(screen.queryByRole('textbox', { name: /Ghi chú dòng/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ghi chú dòng 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('dòng chưa có vật tư nhưng đã gõ số lượng → giữ nguyên, vật tư chọn từ hộp thành dòng mới phía sau', async () => {
    const { user } = renderWithProviders(<Harness items={[{ ...EMPTY_ITEM, quantity: 4 }]} />)
    await user.click(screen.getByRole('button', { name: 'Chọn nhiều vật tư' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chọn vật tư' })
    await user.click(within(dialog).getByRole('checkbox', { name: /VT-02 · Đường/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Thêm 1 dòng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(current?.items).toEqual([
      { ...EMPTY_ITEM, quantity: 4 },
      { ...EMPTY_ITEM, materialSlug: 'm-sugar', unitSlug: 'u-kg' },
    ])
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Số lượng dòng 2' })).toHaveFocus(),
    )
  })
})
