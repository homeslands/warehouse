import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AvailableMaterial } from '@/entities/import-form'
import { renderWithProviders } from '@/shared/test/render'
import { EMPTY_ITEM, type ImportFormValues } from '../model/import-form-editor.schema'
import { ImportFormReviewStep } from './ImportFormReviewStep'

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

const line = (materialSlug: string, unitPrice: number, supplierOverride = '', quantity = 2) => ({
  ...EMPTY_ITEM,
  materialSlug,
  unitSlug: 'u-kg',
  quantity,
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
  overrides: Partial<Parameters<typeof ImportFormReviewStep>[0]> = {},
  v: ImportFormValues = values([line('m-1', 1000), line('m-3', 500)]),
) {
  const props = {
    values: v,
    materials,
    supplierName: (slug: string) => `Tên ${slug}`,
    materialLabel: () => undefined as string | undefined,
    unitLabel: () => 'KG · Kilogram' as string | undefined,
    canConfirm: true,
    onJumpToLine: vi.fn(),
    onEditStep: vi.fn(),
    ...overrides,
  }
  const r = renderWithProviders(<ImportFormReviewStep {...props} />)
  return { ...r, props }
}

describe('ImportFormReviewStep', () => {
  it('mỗi phần có nút "Sửa" về đúng bước: Thông tin phiếu → ①, Chi tiết vật tư → ②', async () => {
    const { user, props } = setup()
    expect(screen.getByRole('heading', { name: 'Thông tin phiếu' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sửa thông tin phiếu' }))
    expect(props.onEditStep).toHaveBeenLastCalledWith('info')
    await user.click(screen.getByRole('button', { name: 'Sửa chi tiết vật tư' }))
    expect(props.onEditStep).toHaveBeenLastCalledWith('items')
  })

  it('đang gửi thì nút "Sửa" khoá', () => {
    setup({ disabled: true })
    expect(screen.getByRole('button', { name: 'Sửa thông tin phiếu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sửa chi tiết vật tư' })).toBeDisabled()
  })

  it('có tiêu đề h2 focus được; thông tin phiếu là dòng meta: bên bán, hoá đơn, ngày (số dòng / tổng tiền không nằm ở đây)', () => {
    setup()
    const h = screen.getByRole('heading', { level: 2, name: 'Kiểm tra phiếu nhập' })
    expect(h).toHaveAttribute('tabindex', '-1')
    const meta = screen
      .getAllByRole('term')
      .filter((el) => !el.closest('[data-testid=review-totals]'))
    expect(meta.map((el) => el.textContent)).toEqual(['Bên bán', 'Số hoá đơn', 'Ngày nhập'])
    expect(screen.getByText('Bên bán').nextSibling).toHaveTextContent('Tên s-1')
    expect(screen.getByText('Số hoá đơn').nextSibling).toHaveTextContent('HD-9')
    expect(screen.getByText('Ngày nhập').nextSibling).toHaveTextContent('19/10/2026')
  })

  it('có số PO → thêm mục Số PO vào dòng meta', () => {
    setup({}, { ...values([line('m-1', 1000)]), purchaseOrder: 'PO-7' })
    expect(screen.getByText('Số PO').nextSibling).toHaveTextContent('PO-7')
  })

  it('tổng cộng nằm dưới bảng, kiểu chứng từ: Số dòng + Tổng tiền', () => {
    setup()
    const section = screen.getByRole('region', { name: 'Chi tiết vật tư' })
    const totals = within(section).getByTestId('review-totals')
    expect(totals).toHaveTextContent('Số dòng2')
    expect(totals).toHaveTextContent(/Tổng tiền3\.000\s*₫/)
    expect(totals).toHaveClass('border-t')
    expect(
      section.querySelector('table')!.compareDocumentPosition(totals) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('"Cần xem lại" nằm trong khung cảnh báo', () => {
    setup({}, values([line('m-4', 0)]))
    expect(screen.getByText('Cần xem lại (1)').closest('section')).toHaveClass(
      'border-warning/40',
      'bg-warning/5',
    )
  })

  it('hai bên bán → "Nhiều bên bán (2)" và mỗi bên một câu thông tin gắn NCC mới', () => {
    setup({}, values([line('m-1', 1000, 's-2'), line('m-3', 500, 's-3')]))
    expect(screen.getByText('Nhiều bên bán (2)')).toBeInTheDocument()
    expect(screen.getAllByText(/Sẽ gắn .* làm nhà cung cấp/)).toHaveLength(2)
    expect(
      screen.getByText('Sẽ gắn Tên s-2 làm nhà cung cấp cho 1 vật tư chưa từng mua của họ.'),
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

  it('đơn giá 0 ở dòng 4 → cảnh báo; bấm "sửa" gọi onJumpToLine(3)', async () => {
    const v = values([line('m-1', 1), line('m-1', 1), line('m-3', 1), line('m-4', 0)])
    const { user, props } = setup({}, v)
    expect(screen.getByText('Cần xem lại (1)')).toBeInTheDocument()
    expect(screen.getByText('Dòng 4 · Tiêu — đơn giá 0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    expect(props.onJumpToLine).toHaveBeenCalledWith(3)
  })

  it('disabled → nút "sửa" bị khoá', () => {
    setup({ disabled: true }, values([line('m-4', 0)]))
    expect(screen.getByRole('button', { name: 'sửa' })).toBeDisabled()
  })

  it('dòng có vật tư ngoài map: bên bán vẫn được tính; tên lấy từ materialLabel', () => {
    setup(
      { materialLabel: (slug) => (slug === 'm-new' ? 'VT-NEW · Bơ' : undefined) },
      values([line('m-new', 0, 's-2')]),
    )
    expect(screen.getByText('Bên bán').nextSibling).toHaveTextContent('Tên s-2')
    expect(screen.getByText('Dòng 1 · VT-NEW · Bơ — đơn giá 0')).toBeInTheDocument()
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText('VT-NEW · Bơ')).toBeInTheDocument()
  })

  it('không biết tên vật tư → bỏ phần tên, không còn " ·  — "', () => {
    setup({}, values([line('m-unknown', 0)]))
    expect(screen.getByText('Dòng 1 — đơn giá 0')).toBeInTheDocument()
  })

  it('mô tả theo quyền: có quyền xác nhận nhắc cộng tồn, không có thì chỉ nói nháp', () => {
    const { unmount } = setup()
    expect(screen.getByText(/Lưu & xác nhận cộng tồn ngay/)).toBeInTheDocument()
    unmount()
    setup({ canConfirm: false })
    expect(screen.getByText(/lưu ở trạng thái Nháp, chưa cộng tồn kho/)).toBeInTheDocument()
  })

  it('bảng chỉ xem có đủ dòng: #, vật tư, SL + đơn vị, đơn giá, thành tiền', () => {
    setup({}, values([line('m-1', 12000, '', 5), line('m-3', 500)]))
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    const first = within(rows[1]).getAllByRole('cell')
    expect(first[0]).toHaveTextContent('1')
    expect(first[1]).toHaveTextContent('M-1 · Bột mì')
    expect(first[2]).toHaveTextContent('5 KG')
    expect(first[3]).toHaveTextContent(/^12\.000\s*₫/)
    expect(first[4]).toHaveTextContent(/^60\.000\s*₫/)
    expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent('M-3 · Muối')
  })

  it('khung hẹp: mỗi dòng là một mục xếp chồng — tên trên, "SL · đơn giá → thành tiền" dưới', () => {
    setup({}, values([line('m-1', 12000, '', 5), line('m-3', 500)]))
    const items = within(screen.getByRole('list', { name: 'Chi tiết vật tư' })).getAllByRole(
      'listitem',
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('M-1 · Bột mì')
    expect(items[0]).toHaveTextContent(/5 KG\s*·\s*12\.000\s*₫\s*→\s*60\.000\s*₫/)
    expect(items[1]).toHaveTextContent('M-3 · Muối')
  })

  it('sửa (editing): câu mô tả nói "Lưu" thay cho "Lưu nháp"', () => {
    setup({ editing: true })
    expect(
      screen.getByText(
        'Xem lại trước khi lưu. Lưu chưa cộng tồn kho; Lưu & xác nhận cộng tồn ngay.',
      ),
    ).toBeInTheDocument()
  })

  it('sửa (editing) không có quyền xác nhận: phiếu vẫn là Nháp', () => {
    setup({ editing: true, canConfirm: false })
    expect(
      screen.getByText('Xem lại trước khi lưu. Phiếu vẫn là Nháp, chưa cộng tồn kho.'),
    ).toBeInTheDocument()
  })
})
