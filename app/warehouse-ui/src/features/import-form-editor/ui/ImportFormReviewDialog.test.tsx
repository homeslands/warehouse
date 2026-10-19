import { screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import { renderWithProviders } from '@/shared/test/render'
import { EMPTY_ITEM, type ImportFormValues } from '../model/import-form-editor.schema'
import { ImportFormReviewDialog } from './ImportFormReviewDialog'

const material = (slug: string, name: string, sellers: string[]): AvailableMaterial => ({
  slug,
  code: slug.toUpperCase(),
  name,
  baseUnitSlug: 'u-kg',
  quantity: 0,
  suppliers: sellers.map((s) => ({ slug: s, code: s, name: s })),
  units: [
    { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
  ],
})

const materials = new Map([
  ['m-1', material('m-1', 'Bột mì', ['s-1'])],
  ['m-2', material('m-2', 'Đường', [])],
  ['m-3', material('m-3', 'Muối', ['s-1'])],
  ['m-4', material('m-4', 'Tiêu', ['s-1'])],
])

const line = (materialSlug: string, unitPrice: number, supplierOverride = '') => ({
  ...EMPTY_ITEM,
  materialSlug,
  unitSlug: 'u-kg',
  quantity: 2,
  unitPrice,
  supplierOverride,
})

const values = (items: ImportFormValues['items'], supplierSlug = 's-1'): ImportFormValues => ({
  code: 'PN-1',
  invoiceCode: 'HD-9',
  purchaseOrder: '',
  date: '2026-10-19',
  file: '',
  note: '',
  supplierSlug,
  items,
})

function setup(
  overrides: Partial<Parameters<typeof ImportFormReviewDialog>[0]> = {},
  v: ImportFormValues = values([line('m-1', 1000), line('m-3', 500)]),
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    values: v,
    materials,
    supplierName: (slug: string) => `Tên ${slug}`,
    canConfirm: true,
    isPending: false,
    onSaveDraft: vi.fn(),
    onSaveAndConfirm: vi.fn(),
    onJumpToLine: vi.fn(),
    ...overrides,
  }
  // Hộp đóng thật khi `onOpenChange(false)` — lối nhảy tới dòng chỉ chạy sau khi hộp đóng xong.
  function Harness() {
    const [open, setOpen] = useState(true)
    return (
      <ImportFormReviewDialog
        {...props}
        open={open}
        onOpenChange={(next) => {
          props.onOpenChange(next)
          setOpen(next)
        }}
      />
    )
  }
  const r = renderWithProviders(<Harness />)
  return { ...r, props }
}

describe('ImportFormReviewDialog', () => {
  it('tóm tắt đủ 4 dòng: bên bán, số hoá đơn, số dòng, tổng tiền', () => {
    setup()
    const dialog = screen.getByRole('alertdialog', { name: 'Kiểm tra phiếu nhập' })
    expect(within(dialog).getByText('Bên bán').nextSibling).toHaveTextContent('Tên s-1')
    expect(within(dialog).getByText('Số hoá đơn').nextSibling).toHaveTextContent('HD-9')
    expect(within(dialog).getByText('Số dòng').nextSibling).toHaveTextContent('2')
    expect(within(dialog).getByText('Tổng tiền').nextSibling).toHaveTextContent(/^3\.000/)
  })

  it('hai bên bán → "Nhiều bên bán (2)" và mỗi bên một câu thông tin gắn NCC mới', () => {
    setup({}, values([line('m-1', 1000, 's-2'), line('m-3', 500, 's-3')]))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Nhiều bên bán (2)')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/Sẽ gắn .* làm nhà cung cấp/)).toHaveLength(2)
    expect(
      within(dialog).getByText(
        'Sẽ gắn Tên s-2 làm nhà cung cấp cho 1 vật tư chưa từng mua của họ.',
      ),
    ).toBeInTheDocument()
  })

  it('không chọn được bên bán → không có dòng Bên bán', () => {
    setup({}, values([line('m-1', 1000)], ''))
    expect(screen.queryByText('Bên bán')).not.toBeInTheDocument()
  })

  it('không có cảnh báo → không có mục "Cần xem lại"', () => {
    setup()
    expect(screen.queryByText(/Cần xem lại/)).not.toBeInTheDocument()
  })

  it('bề rộng ghi đè cùng tiền tố `sm:` với DialogContent (class trần thua `sm:max-w-sm`, chân 3 nút tràn)', () => {
    setup()
    const classes = screen.getByRole('alertdialog').className.split(' ')
    expect(classes).toContain('sm:max-w-lg')
    expect(classes).not.toContain('sm:max-w-sm')
  })

  it('canConfirm:false → không có nút "Lưu & xác nhận"', () => {
    setup({ canConfirm: false })
    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu & xác nhận' })).not.toBeInTheDocument()
  })

  it('đơn giá 0 ở dòng 4 → cảnh báo; bấm "sửa" gọi onJumpToLine(3)', async () => {
    const v = values([line('m-1', 1), line('m-1', 1), line('m-3', 1), line('m-4', 0)])
    const { user, props } = setup({}, v)
    expect(screen.getByText('Cần xem lại (1)')).toBeInTheDocument()
    expect(screen.getByText('Dòng 4 · Tiêu — đơn giá 0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    await waitFor(() => expect(props.onJumpToLine).toHaveBeenCalledWith(3))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('dòng có vật tư ngoài map: bên bán vẫn được tính; đơn giá 0 lấy tên từ materialLabel', () => {
    setup(
      { materialLabel: (slug) => (slug === 'm-new' ? 'VT-NEW · Bơ' : undefined) },
      values([line('m-new', 0, 's-2')]),
    )
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Bên bán').nextSibling).toHaveTextContent('Tên s-2')
    expect(within(dialog).getByText('Dòng 1 · VT-NEW · Bơ — đơn giá 0')).toBeInTheDocument()
  })

  it('không biết tên vật tư → bỏ phần tên, không còn " ·  — "', () => {
    setup({}, values([line('m-unknown', 0)]))
    expect(screen.getByText('Dòng 1 — đơn giá 0')).toBeInTheDocument()
  })

  it('các nút gọi đúng hàm', async () => {
    const { user, props } = setup()
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await user.click(screen.getByRole('button', { name: 'Lưu & xác nhận' }))
    await user.click(screen.getByRole('button', { name: 'Quay lại sửa' }))
    expect(props.onSaveDraft).toHaveBeenCalledTimes(1)
    expect(props.onSaveAndConfirm).toHaveBeenCalledTimes(1)
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đang gửi → khoá các nút và nút ×', () => {
    setup({ isPending: true })
    for (const name of ['Quay lại sửa', 'Lưu nháp', 'Lưu & xác nhận']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()
  })

  it('không đang gửi → có nút ×; Esc và bấm ra ngoài đều đóng', async () => {
    const esc = setup()
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument()
    await esc.user.keyboard('{Escape}')
    expect(esc.props.onOpenChange).toHaveBeenCalledWith(false)
    esc.unmount()

    const outside = setup()
    await outside.user.click(document.querySelector('[data-slot=dialog-overlay]')!)
    expect(outside.props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đang gửi → Esc và bấm ra ngoài KHÔNG gọi onOpenChange', async () => {
    const { user, props } = setup({ isPending: true })
    await user.keyboard('{Escape}')
    await user.click(document.querySelector('[data-slot=dialog-overlay]')!)
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it('mô tả theo quyền: có quyền xác nhận nhắc cộng tồn, không có thì chỉ nói nháp', () => {
    const { unmount } = setup()
    expect(screen.getByText(/Lưu & xác nhận cộng tồn ngay/)).toBeInTheDocument()
    unmount()
    setup({ canConfirm: false })
    expect(screen.getByText(/lưu ở trạng thái Nháp, chưa cộng tồn kho/)).toBeInTheDocument()
  })
})
