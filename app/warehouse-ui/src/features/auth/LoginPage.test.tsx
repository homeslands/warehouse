import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http as mswHttp } from 'msw'
import { ThemeProvider } from 'next-themes'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw'
import i18n from '@/shared/i18n'
import { setUnauthorizedHandler } from '@/shared/api/http'
import { useAuthStore } from '@/shared/auth/auth.store'
import { LoginPage } from './LoginPage'

const BASE = 'http://localhost:8085/api/v1'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

// Trước bản sửa của nhánh này, handler 401 toàn cục (thật ra gọi window.location.assign,
// jsdom không cài đặt) sẽ bắt luôn lỗi sai-mật-khẩu và reload cứng trang. Cài một vi.fn()
// vào đúng chỗ đó để không bao giờ chạm tới hàm thật.
let onUnauthorized: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  onUnauthorized = vi.fn<() => void>()
  setUnauthorizedHandler(onUnauthorized)
  useAuthStore.setState({ token: null, user: null, status: 'unauthenticated' })
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
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('submit form rỗng hiện lỗi validate bắt buộc nhập số điện thoại (ghim cast `as LoginErrorKey`)', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: i18n.t('auth:submit') }))

    expect(await screen.findByText(i18n.t('auth:phonenumberRequired'))).toBeInTheDocument()
  })
})
