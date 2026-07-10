import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { ErrorPage } from '@/features/error/ErrorPage'

function Boom(): never {
  throw new Error('nổ lúc render')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorPage', () => {
  it('component ném lỗi lúc render thì hiện ErrorPage, không phải màn hình trắng', async () => {
    // React log lỗi ra console.error khi một component ném. Im nó để output test sạch.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const router = createMemoryRouter(
      [{ path: '/', element: <Boom />, errorElement: <ErrorPage /> }],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(i18n.t('error:title'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: i18n.t('error:goHome') })).toBeInTheDocument()
  })
})
