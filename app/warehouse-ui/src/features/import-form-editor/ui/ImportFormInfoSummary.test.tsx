import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormInfoSummary } from './ImportFormInfoSummary'

const terms = () => screen.getAllByRole('term').map((el) => el.textContent)
const defs = () => screen.getAllByRole('definition').map((el) => el.textContent)

describe('ImportFormInfoSummary', () => {
  it('có bên bán và PO → Bên bán · Số hoá đơn · Ngày nhập · Số PO kèm nhãn', () => {
    renderWithProviders(
      <ImportFormInfoSummary
        seller="Công ty A"
        invoiceCode=" HD-9 "
        date="2026-10-19"
        purchaseOrder=" PO-3 "
      />,
    )
    expect(terms()).toEqual(['Bên bán', 'Số hoá đơn', 'Ngày nhập', 'Số PO'])
    expect(defs()).toEqual(['Công ty A', 'HD-9', '19/10/2026', 'PO-3'])
  })

  it('không bên bán, không PO → chỉ Số hoá đơn · Ngày nhập', () => {
    renderWithProviders(<ImportFormInfoSummary invoiceCode="HD-9" date="2026-10-19" />)
    expect(terms()).toEqual(['Số hoá đơn', 'Ngày nhập'])
    expect(defs()).toEqual(['HD-9', '19/10/2026'])
  })

  it('chỉ để xem: không có nút sửa', () => {
    renderWithProviders(<ImportFormInfoSummary invoiceCode="HD-9" date="2026-10-19" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('có onEdit: nút "Sửa" căn phải gọi onEdit; đang gửi thì khoá', async () => {
    const onEdit = vi.fn()
    const { user, rerender } = renderWithProviders(
      <ImportFormInfoSummary invoiceCode="HD-9" date="2026-10-19" onEdit={onEdit} />,
    )
    await user.click(screen.getByRole('button', { name: 'Sửa thông tin phiếu' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    rerender(
      <ImportFormInfoSummary invoiceCode="HD-9" date="2026-10-19" onEdit={onEdit} disabled />,
    )
    expect(screen.getByRole('button', { name: 'Sửa thông tin phiếu' })).toBeDisabled()
  })
})
