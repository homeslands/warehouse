import { screen, within } from '@testing-library/react'
import { useState } from 'react'
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

  describe('đã sửa mà chưa lưu (isDirty)', () => {
    const closePaths = [
      [
        'nút Huỷ',
        async (user: ReturnType<typeof renderSheet>['user']) =>
          user.click(screen.getByRole('button', { name: 'Huỷ' })),
      ],
      [
        'nút × ở góc',
        async (user: ReturnType<typeof renderSheet>['user']) =>
          user.click(screen.getByRole('button', { name: 'Đóng' })),
      ],
      ['Escape', async (user: ReturnType<typeof renderSheet>['user']) => user.keyboard('{Escape}')],
      [
        'bấm ra ngoài',
        async (user: ReturnType<typeof renderSheet>['user']) =>
          user.click(document.querySelector('[data-slot="sheet-overlay"]') as HTMLElement),
      ],
    ] as const

    it.each(closePaths)('%s → hỏi "Bỏ thay đổi chưa lưu?", chưa đóng sheet', async (_, close) => {
      const { user, onOpenChange } = renderSheet({ isDirty: true })

      await close(user)

      expect(await screen.findByRole('alertdialog')).toHaveTextContent('Bỏ thay đổi chưa lưu?')
      expect(onOpenChange).not.toHaveBeenCalled()
    })

    it('"Tiếp tục sửa" → đóng hộp hỏi, sheet vẫn mở, form giữ nguyên', async () => {
      const { user, onOpenChange } = renderSheet({ isDirty: true })
      await user.type(screen.getByLabelText('Tên'), 'Kho A')
      await user.click(screen.getByRole('button', { name: 'Huỷ' }))

      await user.click(await screen.findByRole('button', { name: 'Tiếp tục sửa' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(onOpenChange).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Tên')).toHaveValue('Kho A')
    })

    it('Escape trong hộp hỏi chỉ đóng hộp hỏi, không đóng sheet', async () => {
      const { user, onOpenChange } = renderSheet({ isDirty: true })
      await user.click(screen.getByRole('button', { name: 'Huỷ' }))
      await screen.findByRole('alertdialog')

      await user.keyboard('{Escape}')

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(onOpenChange).not.toHaveBeenCalled()
    })

    it('"Bỏ thay đổi" → đóng sheet', async () => {
      const { user, onOpenChange } = renderSheet({ isDirty: true })
      await user.click(screen.getByRole('button', { name: 'Huỷ' }))

      await user.click(await screen.findByRole('button', { name: 'Bỏ thay đổi' }))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('chưa sửa gì → đóng thẳng, không hỏi', async () => {
      const { user, onOpenChange } = renderSheet({ isDirty: false })
      await user.click(screen.getByRole('button', { name: 'Huỷ' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('bấm Lưu không hỏi — submit thẳng', async () => {
      const { user, onSubmit } = renderSheet({ isDirty: true })
      await user.click(screen.getByRole('button', { name: 'Lưu' }))
      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  describe('xác nhận trước khi gửi (confirmation)', () => {
    // Như luồng thật: sheet mở trước, hộp xác nhận mở SAU (khi form hợp lệ và bấm gửi).
    function renderConfirm(overrides: { isPending?: boolean } = {}) {
      const onConfirm = vi.fn()
      const onConfirmOpenChange = vi.fn()
      const onOpenChange = vi.fn()
      function Harness() {
        const [confirmOpen, setConfirmOpen] = useState(false)
        return (
          <FormSheet
            open
            onOpenChange={onOpenChange}
            title="Tạo kho"
            submitLabel="Tạo kho"
            isPending={overrides.isPending ?? false}
            onSubmit={(event) => {
              event.preventDefault()
              setConfirmOpen(true)
            }}
            confirmation={{
              open: confirmOpen,
              onOpenChange: (next) => {
                onConfirmOpenChange(next)
                setConfirmOpen(next)
              },
              icon: <span />,
              title: 'Xác nhận tạo kho',
              description: 'Tạo kho HN – Kho Hà Nội.',
              confirmLabel: 'Xác nhận',
              onConfirm,
            }}
          >
            <input aria-label="Tên" />
          </FormSheet>
        )
      }
      const result = renderWithProviders(<Harness />)
      return { ...result, onConfirm, onConfirmOpenChange, onOpenChange }
    }

    async function openConfirm(user: ReturnType<typeof renderWithProviders>['user']) {
      await user.click(screen.getByRole('button', { name: 'Tạo kho' }))
      return screen.findByRole('alertdialog')
    }

    it('bấm gửi (form hợp lệ) → hiện hộp xác nhận với tiêu đề, mô tả', async () => {
      const { user } = renderConfirm()
      const dialog = await openConfirm(user)
      expect(dialog).toHaveTextContent('Xác nhận tạo kho')
      expect(dialog).toHaveTextContent('Tạo kho HN – Kho Hà Nội.')
    })

    it('bấm nút xác nhận → onConfirm', async () => {
      const { user, onConfirm } = renderConfirm()
      const dialog = await openConfirm(user)
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('Huỷ trong hộp xác nhận → chỉ đóng hộp, không đóng sheet', async () => {
      const { user, onConfirmOpenChange, onOpenChange } = renderConfirm()
      const dialog = await openConfirm(user)
      await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }))
      expect(onConfirmOpenChange).toHaveBeenCalledWith(false)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(onOpenChange).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('chưa bấm gửi → không có hộp xác nhận', () => {
      renderConfirm()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })
})
