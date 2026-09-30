import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { FormSheet } from './FormSheet'

type Overrides = Partial<Parameters<typeof FormSheet>[0]>

function renderSheet(overrides: Overrides = {}) {
  const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
  const onOpenChange = vi.fn()
  const result = renderWithProviders(
    <FormSheet
      open
      onOpenChange={onOpenChange}
      title="Tạo kho"
      submitLabel="Lưu"
      isPending={false}
      onSubmit={onSubmit}
      {...overrides}
    >
      <label>
        Tên
        <input name="name" />
      </label>
    </FormSheet>,
  )
  return { ...result, onSubmit, onOpenChange }
}

describe('FormSheet', () => {
  it('đóng thì không render gì', () => {
    renderSheet({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mở thì hiện tiêu đề, nội dung và hai nút Huỷ / Lưu', () => {
    renderSheet()

    const sheet = screen.getByRole('dialog')
    expect(sheet).toHaveAttribute('data-side', 'right')
    expect(screen.getByRole('heading', { name: 'Tạo kho' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tên')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toHaveAttribute('type', 'submit')
  })

  it('mô tả chỉ render khi được truyền', () => {
    const { rerender } = renderSheet()
    expect(screen.queryByText('Điền thông tin kho')).not.toBeInTheDocument()

    rerender(
      <FormSheet
        open
        onOpenChange={vi.fn()}
        title="Tạo kho"
        description="Điền thông tin kho"
        submitLabel="Lưu"
        isPending={false}
        onSubmit={vi.fn()}
      >
        <input aria-label="Tên" />
      </FormSheet>,
    )
    expect(screen.getByText('Điền thông tin kho')).toBeInTheDocument()
  })

  it('bấm Lưu submit form (nút nằm trong <form>, không dùng thuộc tính form=)', async () => {
    const { user, onSubmit } = renderSheet()

    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('bấm Huỷ đóng sheet mà KHÔNG submit', async () => {
    const { user, onSubmit, onOpenChange } = renderSheet()

    await user.click(screen.getByRole('button', { name: 'Huỷ' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('đang gửi: nhãn thành "Đang lưu..." và cả hai nút bị khoá', () => {
    renderSheet({ isPending: true })

    expect(screen.getByRole('button', { name: 'Đang lưu...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled()
  })

  it('submitDisabled khoá nút Lưu nhưng vẫn cho Huỷ (form sửa chưa đổi gì)', () => {
    renderSheet({ submitDisabled: true })

    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeEnabled()
  })

  it('đang gửi: nhấn Escape không đóng sheet', async () => {
    const { user, onOpenChange } = renderSheet({ isPending: true })

    await user.keyboard('{Escape}')

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('không gửi: nhấn Escape đóng sheet', async () => {
    const { user, onOpenChange } = renderSheet()

    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đang gửi: bấm ra ngoài (overlay) không đóng sheet', async () => {
    const { user, onOpenChange } = renderSheet({ isPending: true })
    const overlay = document.querySelector('[data-slot="sheet-overlay"]')
    expect(overlay).not.toBeNull()

    await user.click(overlay as HTMLElement)

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('không gửi: bấm ra ngoài (overlay) đóng sheet', async () => {
    const { user, onOpenChange } = renderSheet()
    const overlay = document.querySelector('[data-slot="sheet-overlay"]')
    expect(overlay).not.toBeNull()

    await user.click(overlay as HTMLElement)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('không gửi: nút × ở góc đóng sheet', async () => {
    const { user, onOpenChange } = renderSheet()

    await user.click(screen.getByRole('button', { name: 'Đóng' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // `Dialog.Close` của Radix gọi thẳng `onOpenChange`, không đi qua `onEscapeKeyDown` /
  // `onPointerDownOutside` — chốt isPending không chặn được nó, nên phải giấu hẳn nút.
  it('đang gửi: không còn nút × ở góc để đóng sheet giữa chừng', () => {
    renderSheet({ isPending: true })

    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()
  })
})
