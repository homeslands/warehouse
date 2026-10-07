import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { renderWithProviders } from '@/shared/test/render'
import { AccountMenu } from './AccountMenu'

const named = {
  userName: '0901234567',
  roleName: 'ADMIN',
  scope: [],
  phonenumber: '0901234567',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  email: 'a.nguyen@example.com',
}

describe('AccountMenu', () => {
  it('có họ tên → nút hiện họ tên, vai trò tiếng Việt và chữ viết tắt; menu có số điện thoại, email', async () => {
    const { user } = renderWithProviders(<AccountMenu />, { auth: named })

    const trigger = screen.getByRole('button', { name: 'Nguyễn Văn A (Quản trị viên)' })
    expect(within(trigger).getByText('NA')).toBeInTheDocument()
    expect(within(trigger).getByText('Quản trị viên')).toBeInTheDocument()

    await user.click(trigger)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Nguyễn Văn A')).toBeInTheDocument()
    // Liên hệ gộp một dòng: số điện thoại · email.
    expect(within(menu).getByText('0901234567 · a.nguyen@example.com')).toBeInTheDocument()
    expect(within(menu).getByText('Quản trị viên')).toBeInTheDocument()
  })

  it('chưa có họ tên → hiện "Người dùng" kèm icon (không lấy số điện thoại làm tên); menu vẫn có tên đăng nhập và vai trò', async () => {
    const { user } = renderWithProviders(<AccountMenu />, {
      auth: {
        userName: 'root',
        roleName: 'SUPER_ADMIN',
        scope: [],
        firstName: '',
        lastName: '',
      },
    })

    const trigger = screen.getByRole('button', { name: 'Người dùng (Quản trị cấp cao)' })
    // Không có chữ viết tắt nào (tên đăng nhập không phải tên) — icon người thay cho nó.
    expect(within(trigger).queryByText('RO')).not.toBeInTheDocument()

    await user.click(trigger)
    const menu = await screen.findByRole('menu')
    // Menu vẫn cho biết tài khoản nào: tên đăng nhập + vai trò.
    expect(within(menu).getByText('Người dùng')).toBeInTheDocument()
    expect(within(menu).getByText('root')).toBeInTheDocument()
    expect(within(menu).getByText('Quản trị cấp cao')).toBeInTheDocument()
  })

  it('vai trò backend mới mà FE chưa biết → hiện nguyên mã', () => {
    renderWithProviders(<AccountMenu />, {
      auth: { userName: 'kt', roleName: 'ACCOUNTANT', scope: [] },
    })
    expect(screen.getByRole('button', { name: 'Người dùng (ACCOUNTANT)' })).toBeInTheDocument()
  })

  it('đổi sang tiếng Anh → nhãn vai trò dịch theo', async () => {
    await i18n.changeLanguage('en')
    try {
      renderWithProviders(<AccountMenu />, { auth: named })
      expect(
        screen.getByRole('button', { name: 'Nguyễn Văn A (Administrator)' }),
      ).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('vi')
    }
  })
})
