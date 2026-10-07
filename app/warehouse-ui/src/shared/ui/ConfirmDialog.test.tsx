import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrashIcon } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  const user = userEvent.setup()
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      icon={<TrashIcon />}
      title="Xoá kho?"
      description="Không khôi phục được."
      confirmLabel="Xoá"
      onConfirm={onConfirm}
      {...overrides}
    />,
  )
  return { user, onConfirm, onOpenChange }
}

describe('ConfirmDialog', () => {
  it('là alertdialog (không phải dialog thường) và hiện tiêu đề + mô tả', () => {
    renderDialog()

    const box = screen.getByRole('alertdialog')
    expect(within(box).getByText('Xoá kho?')).toBeInTheDocument()
    expect(within(box).getByText('Không khôi phục được.')).toBeInTheDocument()
  })

  it('details → khối tóm tắt nằm giữa phần đầu và các nút', () => {
    renderDialog({ details: <div data-testid="summary">Mã: HN</div> })
    const box = screen.getByRole('alertdialog')
    expect(within(box).getByTestId('summary')).toHaveTextContent('Mã: HN')
  })

  it('bấm xác nhận gọi onConfirm mà KHÔNG tự đóng hộp', async () => {
    const { user, onConfirm, onOpenChange } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    // Radix tự đóng AlertDialogAction khi bấm; ConfirmDialog phải chặn để hộp còn mở lúc
    // request đang chạy — lỗi không được làm hộp biến mất như thể đã thành công.
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('nút × có nhãn riêng, không trùng tên với nút Huỷ', () => {
    renderDialog()

    // Hộp có HAI phần tử Cancel của Radix. Trùng tên thì trình đọc màn hình đọc hai nút
    // giống hệt nhau mà không phân biệt được.
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument()
  })

  it('bấm ra ngoài hộp thì đóng', async () => {
    const { user, onOpenChange } = renderDialog()

    // AlertDialog của Radix hard-code preventDefault cho pointer-down-outside; ConfirmDialog vì thế
    // dựng trên Dialog và chỉ đặt lại role="alertdialog". Test này canh đúng lý do của lựa chọn đó.
    await user.click(document.querySelector('[data-slot=dialog-overlay]')!)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đang gửi thì KHÔNG đóng được bằng bấm ra ngoài, và ẩn nút ×', async () => {
    const { user, onOpenChange } = renderDialog({ isPending: true, confirmLabel: 'Đang xoá...' })

    await user.click(document.querySelector('[data-slot=dialog-overlay]')!)

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()
  })

  it('bấm Huỷ thì đóng hộp', async () => {
    const { user, onOpenChange, onConfirm } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Huỷ' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('đang chạy thì khoá nút xác nhận', () => {
    renderDialog({ isPending: true, confirmLabel: 'Đang xoá...' })

    expect(screen.getByRole('button', { name: 'Đang xoá...' })).toBeDisabled()
  })

  describe('confirmPhrase — gõ đúng chữ mới xác nhận được', () => {
    it('không truyền confirmPhrase → không có ô nhập, nút bấm được ngay', () => {
      renderDialog()

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Xoá' })).toBeEnabled()
    })

    it('hiện hướng dẫn kèm chữ cần gõ; chưa gõ hoặc gõ sai thì nút xác nhận khoá', async () => {
      const { user, onConfirm } = renderDialog({ confirmPhrase: '0310000000' })

      const input = screen.getByLabelText('Nhập 0310000000 để xác nhận')
      expect(screen.getByRole('button', { name: 'Xoá' })).toBeDisabled()

      await user.type(input, '031000000')
      expect(screen.getByRole('button', { name: 'Xoá' })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Xoá' }))
      expect(onConfirm).not.toHaveBeenCalled()
    })

    it('gõ đúng (bỏ khoảng trắng hai đầu) → nút mở, bấm gọi onConfirm', async () => {
      const { user, onConfirm } = renderDialog({ confirmPhrase: '0310000000' })

      await user.type(screen.getByLabelText('Nhập 0310000000 để xác nhận'), '  0310000000 ')
      await user.click(screen.getByRole('button', { name: 'Xoá' }))

      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('đóng rồi mở lại → ô nhập trống, nút lại khoá', async () => {
      const user = userEvent.setup()
      const props = {
        onOpenChange: () => {},
        icon: <TrashIcon />,
        title: 'Xoá kho?',
        description: 'Không khôi phục được.',
        confirmLabel: 'Xoá',
        onConfirm: () => {},
        confirmPhrase: 'root',
      }
      const { rerender } = render(<ConfirmDialog open {...props} />)
      await user.type(screen.getByLabelText('Nhập root để xác nhận'), 'root')

      rerender(<ConfirmDialog open={false} {...props} />)
      rerender(<ConfirmDialog open {...props} />)

      expect(screen.getByLabelText('Nhập root để xác nhận')).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Xoá' })).toBeDisabled()
    })
  })
})
