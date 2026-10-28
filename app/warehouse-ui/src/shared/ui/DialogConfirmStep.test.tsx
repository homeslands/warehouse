import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveIcon } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent } from '@/shared/ui/dialog'
import { DialogConfirmStep } from './DialogConfirmStep'
import { renderWithTooltip } from '@/shared/test/render'

function setup(overrides: Partial<React.ComponentProps<typeof DialogConfirmStep>> = {}) {
  const onConfirm = vi.fn()
  const onBack = vi.fn()
  const user = userEvent.setup()
  renderWithTooltip(
    <Dialog open>
      <DialogContent>
        <DialogConfirmStep
          icon={<SaveIcon />}
          title="Xác nhận?"
          description="Mô tả"
          details={<div>Chi tiết</div>}
          confirmLabel="Đồng ý"
          onBack={onBack}
          onConfirm={onConfirm}
          {...overrides}
        />
      </DialogContent>
    </Dialog>,
  )
  return { user, onConfirm, onBack }
}

describe('DialogConfirmStep', () => {
  it('hiện tiêu đề, mô tả, chi tiết; đặt tên cho hộp theo tiêu đề', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Xác nhận?' })).toBeInTheDocument()
    expect(screen.getByText('Mô tả')).toBeInTheDocument()
    expect(screen.getByText('Chi tiết')).toBeInTheDocument()
  })

  it('bấm xác nhận gọi onConfirm một lần', async () => {
    const { user, onConfirm } = setup()
    await user.click(screen.getByRole('button', { name: 'Đồng ý' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('đang gửi: nút khoá, bấm đúp không gọi onConfirm', async () => {
    const { user, onConfirm } = setup({ isPending: true, confirmLabel: 'Đang lưu...' })
    const button = screen.getByRole('button', { name: 'Đang lưu...' })
    expect(button).toBeDisabled()
    await user.dblClick(button)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('"Quay lại" gọi onBack', async () => {
    const { user, onBack } = setup()
    await user.click(screen.getByRole('button', { name: 'Quay lại' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
