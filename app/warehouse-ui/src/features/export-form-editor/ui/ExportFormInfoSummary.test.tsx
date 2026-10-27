import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ExportFormInfoSummary } from './ExportFormInfoSummary'

const values = { type: 'SALE' as const, receiver: ' Công ty A ', purchaseOrder: ' PO-9 ' }

describe('ExportFormInfoSummary', () => {
  it('"<Lý do> · Giao cho <người nhận> · PO <số>"', () => {
    renderWithProviders(<ExportFormInfoSummary values={values} onEdit={vi.fn()} />)
    expect(screen.getByText('Bán · Giao cho Công ty A · PO PO-9')).toBeInTheDocument()
  })

  it('bấm "sửa" gọi onEdit; disabled thì khoá', async () => {
    const onEdit = vi.fn()
    const { user, rerender } = renderWithProviders(
      <ExportFormInfoSummary values={values} onEdit={onEdit} />,
    )
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    rerender(<ExportFormInfoSummary values={values} onEdit={onEdit} disabled />)
    expect(screen.getByRole('button', { name: 'sửa' })).toBeDisabled()
  })
})
