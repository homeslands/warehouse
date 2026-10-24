import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormStepper } from './ImportFormStepper'

const setup = (over: Partial<Parameters<typeof ImportFormStepper>[0]> = {}) =>
  renderWithProviders(
    <ImportFormStepper
      current="info"
      infoDone={false}
      itemsDone={false}
      lineCount={0}
      onSelect={vi.fn()}
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
    setup({ current: 'items', infoDone: true, itemsDone: true, lineCount: 3 })
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
    const { container } = setup({ infoDone: true, itemsDone: false })
    const connectors = container.querySelectorAll('li > span[aria-hidden]')
    expect(connectors).toHaveLength(2)
    expect(connectors[0]).toHaveAttribute('data-done')
    expect(connectors[1]).not.toHaveAttribute('data-done')
  })

  it('current="review": nút ③ có aria-current="step"', () => {
    setup({ current: 'review' })
    expect(screen.getByRole('button', { name: '③ Kiểm tra & lưu' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('button', { name: '① Thông tin phiếu' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('bấm từng nút gọi onSelect với đúng bước', async () => {
    const onSelect = vi.fn()
    setup({ onSelect })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '① Thông tin phiếu' }))
    await user.click(screen.getByRole('button', { name: '② Chi tiết vật tư' }))
    await user.click(screen.getByRole('button', { name: '③ Kiểm tra & lưu' }))
    expect(onSelect.mock.calls).toEqual([['info'], ['items'], ['review']])
  })

  it('disabled khoá cả ba nút', () => {
    setup({ disabled: true })
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
  })

  it('lockForward khoá các bước đứng sau bước hiện tại, bước hiện tại và bước trước vẫn bấm được', () => {
    setup({ current: 'items', lockForward: true })
    expect(screen.getByRole('button', { name: '① Thông tin phiếu' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '② Chi tiết vật tư' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '③ Kiểm tra & lưu' })).toBeDisabled()
  })

  it('lockForward ở bước ①: khoá cả ② và ③', () => {
    setup({ current: 'info', lockForward: true })
    expect(screen.getByRole('button', { name: '① Thông tin phiếu' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '② Chi tiết vật tư' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '③ Kiểm tra & lưu' })).toBeDisabled()
  })
})
