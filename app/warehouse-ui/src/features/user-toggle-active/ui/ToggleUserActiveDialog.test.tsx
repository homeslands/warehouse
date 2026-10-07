import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@/entities/user'
import { renderWithProviders } from '@/shared/test/render'
import { ToggleUserActiveDialog } from './ToggleUserActiveDialog'

const lan = {
  slug: 'u-lan',
  phonenumber: '0384940599',
  firstName: 'Lan',
  lastName: 'Trần',
  isActive: true,
} as User

describe('ToggleUserActiveDialog', () => {
  it('đang hoạt động → hỏi Khoá, cảnh báo đăng xuất, bắt gõ tên đăng nhập', async () => {
    const onConfirm = vi.fn()
    const { user } = renderWithProviders(
      <ToggleUserActiveDialog
        user={lan}
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        isPending={false}
      />,
    )
    expect(screen.getByText(/đăng xuất khỏi mọi thiết bị/)).toHaveTextContent('Trần Lan')
    expect(screen.queryByText(/chưa thể mở khoá/)).not.toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Khoá' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Nhập 0384940599 để xác nhận'), '0384940599')
    await user.click(submit)
    expect(onConfirm).toHaveBeenCalledWith(lan)
  })

  it('đã khoá → hỏi Mở khoá, KHÔNG bắt gõ xác nhận', async () => {
    const onConfirm = vi.fn()
    const { user } = renderWithProviders(
      <ToggleUserActiveDialog
        user={{ ...lan, isActive: false }}
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        isPending={false}
      />,
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mở khoá' }))
    expect(onConfirm).toHaveBeenCalledWith({ ...lan, isActive: false })
  })
})
