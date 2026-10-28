import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'

describe('Dialog — tooltip nút đóng', () => {
  it('hover × hiện tooltip "Đóng", bấm × vẫn đóng hộp', async () => {
    const { user } = renderWithProviders(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Tiêu đề</DialogTitle>
          <DialogDescription>Mô tả</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const close = screen.getByRole('button', { name: 'Đóng' })
    await user.hover(close)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Đóng')
    await user.click(close)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
