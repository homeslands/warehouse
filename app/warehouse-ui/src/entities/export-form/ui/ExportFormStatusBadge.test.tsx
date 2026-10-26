import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ExportFormStatusBadge } from './ExportFormStatusBadge'

describe('ExportFormStatusBadge', () => {
  it.each([
    ['DRAFT', 'Nháp', 'neutral'],
    ['PENDING', 'Chờ duyệt', 'warning'],
    ['CONFIRMED', 'Đã xác nhận', 'success'],
    ['CANCELLED', 'Đã huỷ', 'danger'],
  ] as const)('%s → "%s", tông %s', (status, label, tone) => {
    renderWithProviders(<ExportFormStatusBadge status={status} />)
    expect(screen.getByText(label).closest('[data-tone]')).toHaveAttribute('data-tone', tone)
  })
})
