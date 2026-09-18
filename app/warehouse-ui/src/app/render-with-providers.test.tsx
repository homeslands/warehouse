import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { useTheme } from 'next-themes'
import { useLocation, useMatches } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderWithProviders, renderWithRouter } from '@/shared/test/render'
import { useAuthStore } from '@/entities/session'

// Test ở tầng app: cần đọc useAuthStore (entities) để chứng minh `auth` được áp —
// shared/test không được import entities.

function Probe() {
  const { pathname, search } = useLocation()
  const { theme } = useTheme()
  const client = useQueryClient()
  return (
    <div>
      <span>path={pathname + search}</span>
      <span>theme={theme}</span>
      <span>retry={String(client.getDefaultOptions().queries?.retry)}</span>
    </div>
  )
}

describe('renderWithProviders', () => {
  it('bọc Router ở `route`, ThemeProvider, QueryClient mới với retry: false', () => {
    renderWithProviders(<Probe />, { route: '/examples?page=2' })
    expect(screen.getByText('path=/examples?page=2')).toBeInTheDocument()
    expect(screen.getByText('theme=system')).toBeInTheDocument()
    expect(screen.getByText('retry=false')).toBeInTheDocument()
  })

  it('trả queryClient đang dùng và user (userEvent)', async () => {
    const queryClient = new QueryClient()
    const view = renderWithProviders(<button type="button">Bấm</button>, { queryClient })
    expect(view.queryClient).toBe(queryClient)
    await view.user.click(screen.getByRole('button', { name: 'Bấm' }))
  })

  it.each([
    ['admin', 'SUPER_ADMIN'],
    ['customer', 'CUSTOMER'],
  ] as const)('auth=%s → phiên đăng nhập với role %s', (auth, roleName) => {
    renderWithProviders(<Probe />, { auth })
    expect(useAuthStore.getState()).toMatchObject({
      hasSession: true,
      status: 'authenticated',
      user: { roleName },
    })
  })

  it('auth là CurrentUser → dùng đúng user đó', () => {
    const user = { userId: 'u9', userName: 'kho', roleName: 'ADMIN', scope: '[]' }
    renderWithProviders(<Probe />, { auth: user })
    expect(useAuthStore.getState().user).toEqual(user)
  })

  it('mặc định auth=none → chưa đăng nhập, giữ nguyên endReason', () => {
    useAuthStore.setState({ endReason: 'expired' })
    renderWithProviders(<Probe />, { auth: 'admin' })
    useAuthStore.setState({ endReason: 'expired' })

    renderWithProviders(<Probe />)

    expect(useAuthStore.getState()).toMatchObject({
      hasSession: false,
      user: null,
      status: 'unauthenticated',
      endReason: 'expired',
    })
  })
})

describe('renderWithRouter', () => {
  function MatchProbe() {
    const matches = useMatches()
    return <span>handle={JSON.stringify(matches.at(-1)?.handle)}</span>
  }

  it('dựng data router ở `route` (useMatches đọc được handle), đủ provider, trả router', async () => {
    const { router, queryClient } = renderWithRouter(
      [
        {
          path: '/a',
          handle: { crumb: 'x' },
          element: (
            <>
              <Probe />
              <MatchProbe />
            </>
          ),
        },
      ],
      { route: '/a?page=2', auth: 'admin' },
    )

    expect(await screen.findByText('path=/a?page=2')).toBeInTheDocument()
    expect(screen.getByText('handle={"crumb":"x"}')).toBeInTheDocument()
    expect(screen.getByText('theme=system')).toBeInTheDocument()
    expect(screen.getByText('retry=false')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false)
    expect(useAuthStore.getState().user?.roleName).toBe('SUPER_ADMIN')
  })
})
