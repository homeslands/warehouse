import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Providers } from '@/app/providers'
import { useAuthStore } from '@/shared/auth/auth.store'

// Không có token: useSession() short-circuit sang 'unauthenticated' ngay trong effect,
// không bắn request GET /auth/me nào -> không cần mock MSW cho test này.
beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, status: 'unauthenticated' })
})

describe('Providers', () => {
  it('mount được toàn bộ stack (Theme + QueryClient + SessionGate + Toaster) không throw', () => {
    render(
      <Providers>
        <div>ok</div>
      </Providers>,
    )

    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})
