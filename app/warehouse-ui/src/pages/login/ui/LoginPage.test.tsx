import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http as mswHttp } from 'msw'
import { Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/shared/test/msw'
import { renderWithProviders, type TestAuth } from '@/shared/test/render'
import i18n from '@/shared/i18n'
import { setSessionEndHandler } from '@/shared/api/http'
import type { SessionEndReason } from '@/shared/api/types'
import { useAuthStore } from '@/entities/session'
import { LoginPage } from './LoginPage'

const BASE = 'http://localhost:8085/api/v1'

function Probe() {
  const { pathname, search } = useLocation()
  return (
    <div>
      ĐÃ TỚI {pathname}
      {search}
    </div>
  )
}

function renderPage(initialPath = '/login', auth: TestAuth = 'none') {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Probe />} />
    </Routes>,
    { route: initialPath, auth },
  )
}

// Trước bản sửa của nhánh này, handler 401 toàn cục (thật ra gọi window.location.assign,
// jsdom không cài đặt) sẽ bắt luôn lỗi sai-mật-khẩu và reload cứng trang. Cài một vi.fn()
// vào đúng chỗ đó để không bao giờ chạm tới hàm thật.
let onSessionEnd: ReturnType<typeof vi.fn<(reason: SessionEndReason) => void>>

beforeEach(() => {
  onSessionEnd = vi.fn<(reason: SessionEndReason) => void>()
  setSessionEndHandler(onSessionEnd)
  useAuthStore.setState({
    hasSession: false,
    user: null,
    status: 'unauthenticated',
    endReason: null,
  })
})

describe('LoginPage', () => {
  it('sai mật khẩu (401/INVALID_CREDENTIALS) hiện lỗi ngay trên form, KHÔNG kích hoạt handler 401 toàn cục', async () => {
    server.use(
      mswHttp.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          {
            statusCode: 401,
            code: 100001,
            timestamp: '',
            path: '/auth/login',
            method: 'POST',
            message: 'Invalid phone number or password',
          },
          { status: 401 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(i18n.t('auth:phonenumber')), '0900000000')
    await user.type(screen.getByLabelText(i18n.t('auth:password')), 'wrong-password')
    await user.click(screen.getByRole('button', { name: i18n.t('auth:submit') }))

    expect(await screen.findByText(i18n.t('errors:invalidCredentials'))).toBeInTheDocument()
    expect(onSessionEnd).not.toHaveBeenCalled()
  })

  it('submit form rỗng hiện lỗi validate bắt buộc nhập số điện thoại (ghim cast `as LoginErrorKey`)', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: i18n.t('auth:submit') }))

    expect(await screen.findByText(i18n.t('auth:phonenumberRequired'))).toBeInTheDocument()
  })

  it('xoá lỗi đăng nhập ngay khi người dùng sửa input', async () => {
    server.use(
      mswHttp.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          {
            statusCode: 401,
            code: 100001,
            timestamp: '',
            path: '/auth/login',
            method: 'POST',
            message: 'Invalid phone number or password',
          },
          { status: 401 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(i18n.t('auth:phonenumber')), '0900000000')
    await user.type(screen.getByLabelText(i18n.t('auth:password')), 'wrong-password')
    await user.click(screen.getByRole('button', { name: i18n.t('auth:submit') }))

    expect(await screen.findByText(i18n.t('errors:invalidCredentials'))).toBeInTheDocument()

    // Người dùng sửa mật khẩu — lỗi cũ nói về lần gửi TRƯỚC, không còn đúng nữa.
    await user.type(screen.getByLabelText(i18n.t('auth:password')), 'x')

    // login.reset() thông báo qua notifyManager của react-query, được lên lịch bằng
    // setTimeout(0) — không đồng bộ ngay sau await user.type(). Chờ tường minh thay vì dựa vào
    // việc user-event tình cờ nhường microtask/macrotask đủ lâu để setTimeout(0) kịp chạy trước.
    await waitFor(() =>
      expect(screen.queryByText(i18n.t('errors:invalidCredentials'))).not.toBeInTheDocument(),
    )
  })

  it.each([
    ['expired', 'auth:sessionEnd.expired'],
    ['revoked', 'auth:sessionEnd.revoked'],
    ['userInactive', 'auth:sessionEnd.userInactive'],
    ['unauthorized', 'auth:sessionEnd.unauthorized'],
  ] as const)('endReason=%s → hiện thông báo lý do', (reason, key) => {
    useAuthStore.setState({
      hasSession: false,
      user: null,
      status: 'unauthenticated',
      endReason: reason,
    })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(i18n.t(key))
  })

  it('tự đăng xuất (loggedOut) → không hiện thông báo', () => {
    useAuthStore.setState({
      hasSession: false,
      user: null,
      status: 'unauthenticated',
      endReason: 'loggedOut',
    })
    renderPage()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('đã đăng nhập + redirect hợp lệ → về đúng trang cũ', () => {
    renderPage(`/login?redirect=${encodeURIComponent('/examples?page=3')}`, 'admin')
    expect(screen.getByText('ĐÃ TỚI /examples?page=3')).toBeInTheDocument()
  })

  it('đã đăng nhập + redirect ra site ngoài → về trang Tổng quan /', () => {
    renderPage(`/login?redirect=${encodeURIComponent('//evil.com')}`, 'admin')
    expect(screen.getByText('ĐÃ TỚI /')).toBeInTheDocument()
  })
})
