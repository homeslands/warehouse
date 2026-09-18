import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Example } from '@/entities/example'
import { DeleteExampleDialog } from './DeleteExampleDialog'

const example: Example = {
  id: '1',
  slug: 'example-a',
  name: 'Example A',
  version: 1,
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
}

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * jsdom không chạy CSS animation nên Presence của Radix gỡ hộp ngay khi đóng. Giả lập hiệu ứng
 * thoát: `animationName` đổi theo `data-state` → Presence giữ hộp trên DOM chờ `animationend`,
 * đúng như trình duyệt lúc hộp đang mờ dần.
 */
function simulateExitAnimation() {
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = original(element, pseudo)
    Object.defineProperty(style, 'animationName', {
      get: () => (element.getAttribute('data-state') === 'closed' ? 'exit' : 'enter'),
    })
    return style
  })
}

describe('DeleteExampleDialog', () => {
  it('đang đóng (example=null) vẫn hiện tên vừa xoá, không để trống', () => {
    simulateExitAnimation()
    const props = { onOpenChange: vi.fn(), onConfirm: vi.fn(), isPending: false }
    const { rerender } = render(<DeleteExampleDialog example={example} {...props} />)
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Xoá Example A?')

    rerender(<DeleteExampleDialog example={null} {...props} />)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('data-state', 'closed')
    expect(dialog).toHaveTextContent('Xoá Example A?')
  })
})
