import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormStatusBadge } from './ImportFormStatusBadge'

describe('ImportFormStatusBadge', () => {
  it.each([
    ['DRAFT', 'Nháp', 'neutral'],
    ['CONFIRMED', 'Đã xác nhận', 'success'],
    ['CANCELLED', 'Đã huỷ', 'danger'],
  ] as const)(
    '%s → "%s", tông %s (nháp xám · đã xác nhận xanh lá · đã huỷ đỏ)',
    (status, label, tone) => {
      renderWithProviders(<ImportFormStatusBadge status={status} />)
      expect(screen.getByText(label).closest('[data-tone]')).toHaveAttribute('data-tone', tone)
    },
  )
})
