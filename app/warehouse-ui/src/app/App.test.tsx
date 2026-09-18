import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app/App'
import { useAuthStore } from '@/entities/session'

// Không có token: useSession() short-circuit sang 'unauthenticated' ngay trong effect,
// không bắn request GET /auth/me nào -> không cần mock MSW cho test này.
beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ hasSession: false, user: null, status: 'unauthenticated' })
})

describe('App', () => {
  it('mount được toàn bộ stack (Theme + QueryClient + SessionGate + Toaster) không throw', () => {
    render(
      <App>
        <div>ok</div>
      </App>,
    )

    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})
