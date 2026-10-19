import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormStepper } from './ImportFormStepper'

const setup = (over: Partial<Parameters<typeof ImportFormStepper>[0]> = {}) =>
  renderWithProviders(
    <ImportFormStepper
      active="seller"
      sellerDone={false}
      itemsDone={false}
      lineCount={0}
      onSeller={vi.fn()}
      onItems={vi.fn()}
      onReview={vi.fn()}
      {...over}
    />,
  )

describe('ImportFormStepper', () => {
  it('chưa xong: hiện số bước, bước đang xem có aria-current="step"', () => {
    setup()
    expect(screen.getByRole('button', { name: '① Thông tin phiếu' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('button', { name: '② Chi tiết vật tư' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('xong: số bước đổi thành ✓ kèm chữ "Đã xong" cho trình đọc màn hình, ② kèm số dòng', () => {
    setup({ active: 'items', sellerDone: true, itemsDone: true, lineCount: 3 })
    expect(screen.getByRole('button', { name: 'Đã xong: Thông tin phiếu' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(
      screen.getByRole('button', { name: 'Đã xong: Chi tiết vật tư · 3 dòng' }),
    ).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: '③ Kiểm tra & lưu' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('đường nối sau bước đã xong đổi màu (data-done), bước chưa xong thì không', () => {
    const { container } = setup({ sellerDone: true, itemsDone: false })
    const connectors = container.querySelectorAll('li > span[aria-hidden]')
    expect(connectors).toHaveLength(2)
    expect(connectors[0]).toHaveAttribute('data-done')
    expect(connectors[1]).not.toHaveAttribute('data-done')
  })
})
