import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ExportFormInfoSummary } from './ExportFormInfoSummary'

const values = { type: 'SALE' as const, receiver: ' Công ty A ', purchaseOrder: ' PO-9 ' }

describe('ExportFormInfoSummary', () => {
  it('hiện Lý do xuất · Người nhận · Số PO kèm nhãn, giá trị đã trim', () => {
    renderWithProviders(<ExportFormInfoSummary values={values} />)
    const terms = screen.getAllByRole('term').map((el) => el.textContent)
    const defs = screen.getAllByRole('definition').map((el) => el.textContent)
    expect(terms).toEqual(['Lý do xuất', 'Người nhận', 'Số PO'])
    expect(defs).toEqual(['Bán', 'Công ty A', 'PO-9'])
  })

  it('chỉ để xem: không có nút sửa', () => {
    renderWithProviders(<ExportFormInfoSummary values={values} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('có onEdit: nút "Sửa" căn phải gọi onEdit; đang gửi thì khoá', async () => {
    const onEdit = vi.fn()
    const { user, rerender } = renderWithProviders(
      <ExportFormInfoSummary values={values} onEdit={onEdit} />,
    )
    await user.click(screen.getByRole('button', { name: 'Sửa thông tin phiếu' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    rerender(<ExportFormInfoSummary values={values} onEdit={onEdit} disabled />)
    expect(screen.getByRole('button', { name: 'Sửa thông tin phiếu' })).toBeDisabled()
  })
})
