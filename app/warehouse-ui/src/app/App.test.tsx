import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app/App'
import { makeStore } from '@/app/store'
import { useAuthStore } from '@/entities/session'
import { useAppDispatch, useAppSelector } from '@/shared/store'

// Không có token: useSession() short-circuit sang 'unauthenticated' ngay trong effect,
// không bắn request GET /auth/me nào -> không cần mock MSW cho test này.
beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ hasSession: false, user: null, status: 'unauthenticated' })
})

describe('App', () => {
  it('mount được toàn bộ stack (Redux + Theme + Antd + QueryClient + SessionGate + Toaster) không throw', () => {
    render(
      <App>
        <div>ok</div>
      </App>,
    )

    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('cung cấp Redux store cho cây con (typed hooks dùng được) và cho truyền store riêng', () => {
    function ReduxProbe() {
      const state = useAppSelector((s) => s)
      const dispatch = useAppDispatch()
      return (
        <span>
          redux={JSON.stringify(state)} dispatch={typeof dispatch}
        </span>
      )
    }

    render(
      <App store={makeStore()}>
        <ReduxProbe />
      </App>,
    )

    expect(screen.getByText('redux={} dispatch=function')).toBeInTheDocument()
  })

  it('Redux/Ant Design provider không chèn phần tử DOM bọc quanh UI hiện có', () => {
    const { container } = render(
      <App>
        <div data-testid="legacy-ui">ok</div>
      </App>,
    )

    expect(screen.getByTestId('legacy-ui').parentElement).toBe(container)
  })
})
