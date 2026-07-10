import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProtectedRoute, RequireRole } from '@/shared/auth/guards'
import { useAuthStore } from '@/shared/auth/auth.store'
import type { CurrentUser } from '@/shared/auth/permissions'

const asUser = (roleName: string): CurrentUser => ({
  userId: 'u1',
  userName: 'tester',
  roleName,
  scope: '[]',
})

function renderAt(path: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>TRANG LOGIN</div>} />
        <Route path="/forbidden" element={<div>KHÔNG ĐỦ QUYỀN</div>} />
        <Route path="/secret" element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, status: 'unauthenticated' })
})

describe('ProtectedRoute', () => {
  it('đẩy về /login khi chưa đăng nhập', () => {
    renderAt(
      '/secret',
      <ProtectedRoute>
        <div>BÍ MẬT</div>
      </ProtectedRoute>,
    )
    expect(screen.getByText('TRANG LOGIN')).toBeInTheDocument()
  })

  it('hiện nội dung khi đã đăng nhập', () => {
    useAuthStore.setState({ token: 't', user: asUser('CUSTOMER'), status: 'authenticated' })
    renderAt(
      '/secret',
      <ProtectedRoute>
        <div>BÍ MẬT</div>
      </ProtectedRoute>,
    )
    expect(screen.getByText('BÍ MẬT')).toBeInTheDocument()
  })

  it('không đẩy đi đâu khi status còn loading', () => {
    useAuthStore.setState({ token: 't', user: null, status: 'loading' })
    renderAt(
      '/secret',
      <ProtectedRoute>
        <div>BÍ MẬT</div>
      </ProtectedRoute>,
    )
    expect(screen.queryByText('TRANG LOGIN')).not.toBeInTheDocument()
    expect(screen.queryByText('BÍ MẬT')).not.toBeInTheDocument()
  })
})

describe('RequireRole', () => {
  it('cho qua khi role khớp', () => {
    useAuthStore.setState({ token: 't', user: asUser('SUPER_ADMIN'), status: 'authenticated' })
    renderAt(
      '/secret',
      <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
        <div>BÍ MẬT</div>
      </RequireRole>,
    )
    expect(screen.getByText('BÍ MẬT')).toBeInTheDocument()
  })

  it('đẩy về /forbidden khi role không khớp', () => {
    useAuthStore.setState({ token: 't', user: asUser('CUSTOMER'), status: 'authenticated' })
    renderAt(
      '/secret',
      <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
        <div>BÍ MẬT</div>
      </RequireRole>,
    )
    expect(screen.getByText('KHÔNG ĐỦ QUYỀN')).toBeInTheDocument()
  })
})
