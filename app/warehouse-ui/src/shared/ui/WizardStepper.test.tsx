import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { WizardStepper } from './WizardStepper'

const steps = [
  { key: 'a', label: 'Bước A', done: false },
  { key: 'b', label: 'Bước B', done: false, extra: '· 3 dòng' },
  { key: 'c', label: 'Bước C', done: false },
]

const setup = (over: Partial<Parameters<typeof WizardStepper>[0]> = {}) =>
  renderWithProviders(
    <WizardStepper steps={steps} current="a" onSelect={vi.fn()} ariaLabel="Các bước" {...over} />,
  )

describe('WizardStepper', () => {
  it('có nav với ariaLabel; bước đang xem có aria-current="step"', () => {
    setup()
    expect(screen.getByRole('navigation', { name: 'Các bước' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '① Bước A' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: '② Bước B · · 3 dòng' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('bước xong: tên "Đã xong: …" thay glyph', () => {
    setup({
      current: 'b',
      steps: [{ ...steps[0], done: true }, steps[1], steps[2]],
    })
    expect(screen.getByRole('button', { name: 'Đã xong: Bước A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '② Bước B · · 3 dòng' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('đường nối sau bước đã xong có data-done', () => {
    const { container } = setup({ steps: [{ ...steps[0], done: true }, steps[1], steps[2]] })
    const connectors = container.querySelectorAll('li > span[aria-hidden]')
    expect(connectors).toHaveLength(2)
    expect(connectors[0]).toHaveAttribute('data-done')
    expect(connectors[1]).not.toHaveAttribute('data-done')
  })

  it('bấm nút gọi onSelect với key', async () => {
    const onSelect = vi.fn()
    setup({ onSelect })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '① Bước A' }))
    await user.click(screen.getByRole('button', { name: '③ Bước C' }))
    expect(onSelect.mock.calls).toEqual([['a'], ['c']])
  })

  it('disabled khoá cả ba nút', () => {
    setup({ disabled: true })
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
  })

  it('lockForward khoá các bước sau bước hiện tại', () => {
    setup({ current: 'b', lockForward: true })
    expect(screen.getByRole('button', { name: '① Bước A' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '② Bước B · · 3 dòng' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '③ Bước C' })).toBeDisabled()
  })
})
