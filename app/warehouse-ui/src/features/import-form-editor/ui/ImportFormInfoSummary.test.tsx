import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormInfoSummary } from './ImportFormInfoSummary'

describe('ImportFormInfoSummary', () => {
  it('có bên bán → "Mua của … · HĐ … · ngày"', () => {
    renderWithProviders(
      <ImportFormInfoSummary
        seller="Công ty A"
        invoiceCode="HD-9"
        date="2026-10-19"
        onEdit={vi.fn()}
      />,
    )
    expect(screen.getByText('Mua của Công ty A · HĐ HD-9 · 19/10/2026')).toBeInTheDocument()
  })

  it('không bên bán → "HĐ … · ngày"', () => {
    renderWithProviders(
      <ImportFormInfoSummary invoiceCode="HD-9" date="2026-10-19" onEdit={vi.fn()} />,
    )
    expect(screen.getByText('HĐ HD-9 · 19/10/2026')).toBeInTheDocument()
  })

  it('bấm "sửa" gọi onEdit; disabled thì khoá', async () => {
    const onEdit = vi.fn()
    const { user, rerender } = renderWithProviders(
      <ImportFormInfoSummary invoiceCode="HD-9" date="2026-10-19" onEdit={onEdit} />,
    )
    await user.click(screen.getByRole('button', { name: 'sửa' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    rerender(
      <ImportFormInfoSummary invoiceCode="HD-9" date="2026-10-19" onEdit={onEdit} disabled />,
    )
    expect(screen.getByRole('button', { name: 'sửa' })).toBeDisabled()
  })
})
