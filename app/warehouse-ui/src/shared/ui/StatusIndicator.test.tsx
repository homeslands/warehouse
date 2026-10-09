import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusIndicator } from './StatusIndicator'

describe('StatusIndicator', () => {
  it('có chữ — không chỉ dựa vào màu (WCAG 1.4.1)', () => {
    render(<StatusIndicator tone="success">Hoạt động</StatusIndicator>)
    expect(screen.getByText('Hoạt động')).toBeInTheDocument()
  })

  it.each(['success', 'neutral', 'warning', 'info'] as const)(
    'tone %s → data-tone để test/CSS bám',
    (tone) => {
      render(<StatusIndicator tone={tone}>Nhãn</StatusIndicator>)
      const badge = screen.getByText('Nhãn').closest('[data-slot="status"]')
      expect(badge).toHaveAttribute('data-tone', tone)
    },
  )

  it('chấm màu chỉ để trang trí — screen reader không đọc', () => {
    render(<StatusIndicator tone="success">Hoạt động</StatusIndicator>)
    const badge = screen.getByText('Hoạt động').closest('[data-slot="status"]')
    const dot = badge?.querySelector('[data-slot="status-dot"]')
    expect(dot).toHaveAttribute('aria-hidden', 'true')
    expect(badge).toHaveTextContent(/^Hoạt động$/)
  })
})
