import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProtectedRoute } from '@/app/routes/guards'
import { useAuthStore, type CurrentUser } from '@/entities/session'

const asUser = (roleName: string): CurrentUser => ({
  userId: 'u1',
  userName: 'tester',
  roleName,
  scope: '[]',
})

function LoginProbe() {
  const { search } = useLocation()
  return <div>TRANG LOGIN{search}</div>
}

function renderAt(path: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route path="/secret" element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.setState({
    hasSession: false,
    user: null,
    status: 'unauthenticated',
    endReason: null,
  })
})

describe('ProtectedRoute', () => {
  it('đẩy về /login khi chưa đăng nhập', () => {
    renderAt(
      '/secret',
      <ProtectedRoute>
        <div>BÍ MẬT</div>
      </ProtectedRoute>,
    )
    expect(screen.getByText(/TRANG LOGIN/)).toBeInTheDocument()
  })

  it('gắn redirect = địa chỉ hiện tại (kèm query) khi phiên hết hạn', () => {
    useAuthStore.setState({
      hasSession: false,
      user: null,
      status: 'unauthenticated',
      endReason: 'expired',
    })
    renderAt(
      '/secret?page=3',
      <ProtectedRoute>
        <div>BÍ MẬT</div>
      </ProtectedRoute>,
    )
    expect(
      screen.getByText(`TRANG LOGIN?redirect=${encodeURIComponent('/secret?page=3')}`),
    ).toBeInTheDocument()
  })

  it('KHÔNG gắn redirect khi người dùng tự đăng xuất', () => {
    useAuthStore.setState({
      hasSession: false,
      user: null,
      status: 'unauthenticated',
      endReason: 'loggedOut',
    })
    renderAt(
      '/secret?page=3',
      <ProtectedRoute>
        <div>BÍ MẬT</div>
      </ProtectedRoute>,
    )
    expect(screen.getByText('TRANG LOGIN')).toBeInTheDocument()
  })

  it('hiện nội dung khi đã đăng nhập', () => {
    useAuthStore.setState({ hasSession: true, user: asUser('CUSTOMER'), status: 'authenticated' })
    renderAt(
      '/secret',
      <ProtectedRoute>
        <div>BÍ MẬT</div>
      </ProtectedRoute>,
    )
    expect(screen.getByText('BÍ MẬT')).toBeInTheDocument()
  })

  it('không đẩy đi đâu khi status còn loading', () => {
    useAuthStore.setState({ hasSession: true, user: null, status: 'loading' })
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
