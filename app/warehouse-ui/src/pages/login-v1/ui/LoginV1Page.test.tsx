/**
 * UI-01 (API v1) — API là MSW MOCK đúng OpenAPI R2, không phải API thật. Không thay browser evidence.
 */
import { configureStore } from '@reduxjs/toolkit'
import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { endV1Session, injectSessionV1, selectSessionV1 } from '@/entities/session'
import { clearCredentials } from '@/shared/api/v1'
import i18n from '@/shared/i18n'
import { appReducer } from '@/shared/store'
import { V1_BASE, v1LoginResult, v1error, v1ok } from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { LoginV1Page } from './LoginV1Page'

function makeStore() {
  injectSessionV1()
  return configureStore({ reducer: appReducer })
}

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

afterEach(() => {
  clearCredentials()
})

function renderLogin(route = '/login') {
  return renderWithRouter(
    [
      { path: '/login', element: <LoginV1Page /> },
      { path: '/', element: <p>Trang chủ</p> },
      { path: '/warehouses', element: <p>Màn kho</p> },
    ],
    { route, store },
  )
}

describe('LoginV1Page (UI-01)', () => {
  it('hiện tiêu đề, ô có nhãn; focus sẵn ô số điện thoại; không có lựa chọn vai trò', async () => {
    renderLogin()
    expect(screen.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeInTheDocument()
    const phone = screen.getByLabelText('Số điện thoại')
    await waitFor(() => expect(phone).toHaveFocus())
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'password')
    expect(screen.queryByText(/SUPER_ADMIN|vai trò/i)).not.toBeInTheDocument()
  })

  it('gửi trống → lỗi tại ô (đọc được qua role=alert) và focus ô lỗi đầu tiên; không gọi API', async () => {
    const { user } = renderLogin()
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Vui lòng nhập số điện thoại')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Số điện thoại')).toHaveFocus())
  })

  it('mật khẩu > 128 ký tự (Login.password.maxLength) → lỗi tại ô', async () => {
    const { user } = renderLogin()
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000001')
    await user.click(screen.getByLabelText('Mật khẩu'))
    await user.paste('x'.repeat(129))
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Mật khẩu tối đa 128 ký tự')).toBeInTheDocument()
  })

  it('nút hiện/ẩn mật khẩu là nút thật có aria-pressed', async () => {
    const { user } = renderLogin()
    const toggle = screen.getByRole('button', { name: 'Hiện mật khẩu' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('401 → thông điệp CHUNG (không lộ tài khoản tồn tại), xoá ô mật khẩu', async () => {
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () => v1error(401, 'SESSION_INVALID_CREDENTIALS')),
    )
    const { user } = renderLogin()
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000001')
    await user.type(screen.getByLabelText('Mật khẩu'), 'sai-mat-khau')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số điện thoại hoặc mật khẩu không đúng.',
    )
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('')
    expect(selectSessionV1(store.getState()).status).toBe('unknown')
  })

  it('422 errors[] → gắn lỗi vào đúng ô và focus ô đó', async () => {
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () =>
        v1error(422, 'GATEWAY_PAYLOAD_INVALID', {
          errors: [
            {
              field: 'password',
              errorKey: 'PASSWORD_TOO_LONG',
              message: 'Mật khẩu quá dài (server)',
            },
          ],
        }),
      ),
    )
    const { user } = renderLogin()
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000001')
    await user.type(screen.getByLabelText('Mật khẩu'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Mật khẩu quá dài (server)')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu')).toHaveFocus())
  })

  it('429 → báo thử quá nhiều lần', async () => {
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () => v1error(429, 'SESSION_LOGIN_RATE_LIMITED')),
    )
    const { user } = renderLogin()
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000001')
    await user.type(screen.getByLabelText('Mật khẩu'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã thử quá nhiều lần')
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('abc')
  })

  it('500 → lỗi hệ thống kèm mã tra cứu traceId', async () => {
    server.use(mswHttp.post(`${V1_BASE}/auth/login`, () => v1error(500, 'GATEWAY_INTERNAL')))
    const { user } = renderLogin()
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000001')
    await user.type(screen.getByLabelText('Mật khẩu'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('lỗi hệ thống')
    expect(alert).toHaveTextContent('Mã tra cứu: 00000000-0000-4000-8000-000000000001')
  })

  it('mất mạng → báo offline, không tự gửi lại', async () => {
    let calls = 0
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, () => {
        calls += 1
        return Response.error()
      }),
    )
    const { user } = renderLogin()
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000001')
    await user.type(screen.getByLabelText('Mật khẩu'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ')
    expect(calls).toBe(1)
    // Review r1 L1: chỉ xoá mật khẩu khi sai thông tin đăng nhập, không xoá khi lỗi mạng.
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('abc')
  })

  it('thành công → về trang `redirect`; bấm gửi 2 lần chỉ 1 request', async () => {
    let calls = 0
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 20))
        return v1ok(v1LoginResult())
      }),
    )
    const { user, router } = renderLogin('/login?redirect=%2Fwarehouses')
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000001')
    await user.type(screen.getByLabelText('Mật khẩu'), 'dung-mat-khau')
    const submit = screen.getByRole('button', { name: 'Đăng nhập' })
    await user.dblClick(submit)
    expect(await screen.findByText('Màn kho')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/warehouses')
    expect(calls).toBe(1)
  })

  it('redirect ra ngoài (open redirect) → về trang chủ', async () => {
    server.use(mswHttp.post(`${V1_BASE}/auth/login`, () => v1ok(v1LoginResult())))
    const { user } = renderLogin('/login?redirect=%2F%2Fevil.example')
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000001')
    await user.type(screen.getByLabelText('Mật khẩu'), 'p')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByText('Trang chủ')).toBeInTheDocument()
  })

  it.each([
    ['revoked', 'Phiên đăng nhập đã bị thu hồi'],
    ['expired', 'Phiên đăng nhập đã hết hạn'],
  ] as const)('phiên kết thúc vì %s → thông báo (role=status)', (reason, text) => {
    store.dispatch(endV1Session(reason))
    renderLogin()
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })

  it('tự đăng xuất → không hiện thông báo phiên kết thúc', () => {
    store.dispatch(endV1Session('loggedOut'))
    renderLogin()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('tiếng Anh (en)', async () => {
    await i18n.changeLanguage('en')
    try {
      renderLogin()
      expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
      expect(screen.getByLabelText('Phone number')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('vi')
    }
  })
})
