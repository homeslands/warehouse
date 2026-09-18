import { render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryRouter,
  type NonIndexRouteObject,
  type RouteObject,
} from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { createRoutes } from '@/app/routes'
import { ErrorPage } from '@/pages/error'

function Boom(): never {
  throw new Error('nổ lúc render')
}

/**
 * `createRoutes(...)[0]` có kiểu tĩnh `RouteObject` (union index/non-index route). Route gốc
 * thật sự luôn là non-index (nó có `children`), nhưng TS không tự biết điều đó — assertion function
 * này xác nhận ở runtime rồi thu hẹp kiểu, thay vì ép kiểu bằng `as`.
 */
function assertNonIndexRoute(route: RouteObject): asserts route is NonIndexRouteObject {
  if (route.index) {
    throw new Error(
      'createRoutes(...)[0] phải là non-index route (có children) để test này dựng lại cây gốc',
    )
  }
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

    expect(await screen.findByText(i18n.t('errorPages:title'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: i18n.t('errorPages:goHome') })).toBeInTheDocument()
  })

  it('route gốc THẬT (createRoutes(...)[0]) bắt lỗi render qua errorElement của chính nó, không phải bản sao', async () => {
    // Khác test phía trên: test này dựng router từ route gốc thật sự (giữ nguyên errorElement
    // đang wire trong app/routes/index.tsx), chỉ thay children bằng một route ném lỗi để lái lỗi
    // đi qua đúng cây production. Nếu ai đó lỡ đổi `errorElement` của route gốc thành
    // null/undefined, hoặc xoá dòng đó, test này phải đỏ. `dev: false` = cây của bản production.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const root = createRoutes({ dev: false })[0]
    assertNonIndexRoute(root)

    const router = createMemoryRouter(
      [{ ...root, children: [{ path: '/boom', element: <Boom /> }] }],
      { initialEntries: ['/boom'] },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(i18n.t('errorPages:title'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: i18n.t('errorPages:goHome') })).toBeInTheDocument()
  })

  it('route lazy tải chunk lỗi → errorElement của route gốc (có nút "Tải lại")', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // react-router cũng cảnh báo khi lazy() bị từ chối.
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const root = createRoutes({ dev: false })[0]
    assertNonIndexRoute(root)

    const router = createMemoryRouter(
      [
        {
          ...root,
          children: [
            {
              path: '/lazy',
              lazy: () =>
                Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
            },
          ],
        },
      ],
      { initialEntries: ['/lazy'] },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(i18n.t('errorPages:title'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('errorPages:reload') })).toBeInTheDocument()
  })
})
