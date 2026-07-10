import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { routes } from '@/app/router'
import { useAuthStore } from '@/shared/auth/auth.store'

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, status: 'unauthenticated' })
})

describe('route catch-all', () => {
  it('URL không tồn tại hiện NotFoundPage, kể cả khi chưa đăng nhập', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/khong-ton-tai'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(i18n.t('error:notFoundTitle'))).toBeInTheDocument()
  })

  it('route gốc mang errorElement, nên lỗi render không cho ra màn hình trắng', () => {
    expect(routes).toHaveLength(1)
    expect(routes[0].errorElement).toBeDefined()
  })
})
