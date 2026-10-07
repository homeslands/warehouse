import { screen, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { AccountPage } from '@/pages/account'

const BASE = 'http://localhost:8085/api/v1'

beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/auth/me`, () =>
      // Đúng payload thật của /auth/me hôm nay: `scope` là MẢNG, KHÔNG có `version`,
      // và `userName` là định danh đăng nhập chứ không chắc là số điện thoại.
      ok({
        userName: 'root',
        roleName: 'SUPER_ADMIN',
        sessionId: '37f5eb91',
        scope: [],
      }),
    ),
  )
})

describe('AccountPage — cờ mặc định (backend chưa hỗ trợ)', () => {
  it('hiện tên đăng nhập và vai trò', async () => {
    renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })

    expect(await screen.findByText('root')).toBeInTheDocument()
    expect(screen.getByText('Quản trị cấp cao')).toBeInTheDocument()
  })

  it('/auth/me có họ tên → tiêu đề là họ tên, dòng dưới là tên đăng nhập · email', async () => {
    server.use(
      mswHttp.get(`${BASE}/auth/me`, () =>
        ok({
          userName: '0901234567',
          roleName: 'MANAGER',
          scope: [],
          phonenumber: '0901234567',
          firstName: 'Văn A',
          lastName: 'Nguyễn',
          email: 'a.nguyen@example.com',
          dob: null,
          address: null,
        }),
      ),
    )
    renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nguyễn Văn A' }),
    ).toBeInTheDocument()
    expect(screen.getByText('0901234567 · a.nguyen@example.com')).toBeInTheDocument()
    expect(screen.getByText('Quản lý')).toBeInTheDocument()
  })

  it('nói rõ đây là tên dùng để đăng nhập', async () => {
    renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })

    // Khớp phần đặc trưng: mô tả của thẻ Bảo mật cũng chứa cụm "dùng để đăng nhập".
    expect(await screen.findByText(/cột số điện thoại/)).toBeInTheDocument()
  })

  it('KHÔNG hiện form hồ sơ và danh sách thiết bị — backend chưa có', async () => {
    renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })
    await screen.findByText('root')

    expect(screen.queryByText('Hồ sơ')).not.toBeInTheDocument()
    expect(screen.queryByText('Thiết bị đang đăng nhập')).not.toBeInTheDocument()
  })

  it('có đủ đổi mật khẩu, đăng xuất và đăng xuất mọi thiết bị', async () => {
    renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })
    await screen.findByText('root')

    expect(screen.getByRole('button', { name: 'Đổi mật khẩu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đăng xuất khỏi thiết bị này' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đăng xuất khỏi mọi thiết bị' })).toBeInTheDocument()
  })

  it('mở được hộp đổi mật khẩu', async () => {
    const { user } = renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })
    await screen.findByText('root')

    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('/auth/me lỗi vẫn hiện được thông tin từ token, không vỡ màn', async () => {
    server.use(mswHttp.get(`${BASE}/auth/me`, () => new Response(null, { status: 500 })))
    renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })

    // `auth: 'admin'` tiêm user `root` / `SUPER_ADMIN` vào store — màn phải lùi về đó
    // thay vì trống trơn.
    expect(await screen.findByText('Quản trị cấp cao')).toBeInTheDocument()
    expect(screen.getByText('root')).toBeInTheDocument()
  })
})

describe('AccountPage — phần đầu trang', () => {
  it('chưa có họ tên → tiêu đề "Người dùng", tên đăng nhập ở dòng dưới, không dựng chữ viết tắt từ nó', async () => {
    renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Người dùng' })).toBeInTheDocument()
    expect(screen.getByText('root')).toBeInTheDocument()
    expect(screen.queryByText('RO')).not.toBeInTheDocument()
  })

  it('vai trò hiện dưới dạng badge, không lặp lại tên đăng nhập ở thẻ riêng', async () => {
    renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })

    expect(await screen.findByText('Quản trị cấp cao')).toBeInTheDocument()
    expect(screen.getAllByText('root')).toHaveLength(1)
  })
})

describe('AccountPage — xác nhận đăng xuất', () => {
  it('bấm Đăng xuất khỏi thiết bị này thì HỎI LẠI trước', async () => {
    const { user } = renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })
    await screen.findByText('root')

    await user.click(screen.getByRole('button', { name: 'Đăng xuất khỏi thiết bị này' }))

    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByText('Đăng xuất?')).toBeInTheDocument()
  })
})
