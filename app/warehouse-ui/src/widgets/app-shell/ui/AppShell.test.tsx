import { act, screen, within } from '@testing-library/react'
import { FlaskConical, Settings } from 'lucide-react'
import type { RouteObject } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NavGroup } from '@/shared/lib/nav'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import i18n from '@/shared/i18n'
import { getTokens, setTokens } from '@/shared/api/token-storage'
import { useAuthStore } from '@/entities/session'
import { AppShell } from './AppShell'

const BASE = 'http://localhost:8085/api/v1'
const user = { userName: 'root', roleName: 'SUPER_ADMIN', scope: [] }

// Nhãn mượn khoá i18n có sẵn ("Example", "Giao diện") — AppShell dịch khoá, không quan tâm nghĩa.
const nav: NavGroup[] = [
  {
    key: 'catalog',
    labelKey: 'nav:groups.catalog',
    items: [{ to: '/examples', labelKey: 'nav:examples', icon: FlaskConical }],
  },
  {
    key: 'admin',
    labelKey: 'nav:groups.admin',
    items: [{ to: '/settings', labelKey: 'common:theme', icon: Settings }],
  },
]

/** AppShell dùng useNavigation → cần data router; màn con render qua <Outlet />. */
function renderShell(
  children: RouteObject[] = [{ path: '*', element: <div>MÀN CHÍNH</div> }],
  route = '/',
) {
  return renderWithRouter([{ element: <AppShell nav={nav} />, children }], { auth: user, route })
}

/** Phần tử gốc của sidebar desktop (mang data-state expanded/collapsed). */
function sidebarRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-slot="sidebar"]')
  if (!el) throw new Error('không thấy sidebar')
  return el
}

function clearSidebarCookie() {
  document.cookie = 'sidebar_state=; path=/; max-age=0'
}

async function openMenu() {
  const u = userEvent.setup()
  await u.click(screen.getByRole('button', { name: /Người dùng/ }))
  return u
}

beforeEach(() => {
  setTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })
  clearSidebarCookie()
})

afterEach(() => {
  clearSidebarCookie()
  vi.restoreAllMocks()
})

describe('AppShell — menu tài khoản', () => {
  it('Đăng xuất → xác nhận → gọi /auth/logout và kết thúc phiên', async () => {
    const logoutCalled = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/auth/logout`, () => {
        logoutCalled()
        return ok({ revokedSessions: 1 })
      }),
    )
    renderShell()
    const u = await openMenu()
    await u.click(await screen.findByRole('menuitem', { name: 'Đăng xuất' }))

    // Hỏi lại trước đã — bấm nhầm mục trong menu không được làm mất phiên ngay.
    const box = await screen.findByRole('alertdialog')
    expect(logoutCalled).not.toHaveBeenCalled()

    await u.click(within(box).getByRole('button', { name: 'Đăng xuất' }))

    await vi.waitFor(() => expect(useAuthStore.getState().endReason).toBe('loggedOut'))
    expect(logoutCalled).toHaveBeenCalledOnce()
    expect(getTokens()).toBeNull()
  })

  it('Đăng xuất → bấm Huỷ thì KHÔNG gọi /auth/logout', async () => {
    const logoutCalled = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/auth/logout`, () => {
        logoutCalled()
        return ok({ revokedSessions: 1 })
      }),
    )
    renderShell()
    const u = await openMenu()
    await u.click(await screen.findByRole('menuitem', { name: 'Đăng xuất' }))
    await u.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Huỷ' }),
    )

    expect(logoutCalled).not.toHaveBeenCalled()
    expect(useAuthStore.getState().endReason).not.toBe('loggedOut')
  })

  it('Đăng xuất mọi thiết bị → xác nhận → gọi /auth/logout-all và kết thúc phiên', async () => {
    const logoutAllCalled = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/auth/logout-all`, () => {
        logoutAllCalled()
        return ok({ revokedSessions: 3 })
      }),
    )
    renderShell()
    const u = await openMenu()
    await u.click(await screen.findByRole('menuitem', { name: 'Đăng xuất mọi thiết bị' }))

    // Hộp xác nhận dùng ConfirmDialog (AlertDialog) → role là 'alertdialog', không phải 'dialog'.
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Đăng xuất khỏi mọi thiết bị, kể cả thiết bị này?')
    // Chưa xác nhận thì chưa gọi gì.
    expect(logoutAllCalled).not.toHaveBeenCalled()

    // Hộp bắt gõ tên đăng nhập của chính mình (`root`) mới mở nút xác nhận.
    await u.type(screen.getByLabelText('Nhập root để xác nhận'), 'root')
    await u.click(screen.getByRole('button', { name: 'Đăng xuất mọi thiết bị' }))

    await vi.waitFor(() => expect(useAuthStore.getState().endReason).toBe('loggedOut'))
    expect(logoutAllCalled).toHaveBeenCalledOnce()
    expect(getTokens()).toBeNull()
  })

  it('Đăng xuất mọi thiết bị lỗi → phiên ở client giữ nguyên', async () => {
    const called = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/auth/logout-all`, () => {
        called()
        return HttpResponse.json(
          { statusCode: 500, timestamp: '', path: '', method: 'POST', message: 'boom' },
          { status: 500 },
        )
      }),
    )
    renderShell()
    const u = await openMenu()
    await u.click(await screen.findByRole('menuitem', { name: 'Đăng xuất mọi thiết bị' }))
    await screen.findByRole('alertdialog')
    // Hộp bắt gõ tên đăng nhập của chính mình (`root`) mới mở nút xác nhận.
    await u.type(screen.getByLabelText('Nhập root để xác nhận'), 'root')
    await u.click(screen.getByRole('button', { name: 'Đăng xuất mọi thiết bị' }))

    // Request đã tới server VÀ nút đã hết trạng thái "Đang đăng xuất..." — lỗi đã được xử lý xong.
    await vi.waitFor(() => {
      expect(called).toHaveBeenCalledOnce()
      expect(screen.getByRole('button', { name: 'Đăng xuất mọi thiết bị' })).toBeEnabled()
    })
    expect(useAuthStore.getState().hasSession).toBe(true)
    expect(getTokens()).not.toBeNull()
  })

  it('Đổi mật khẩu → mở dialog đổi mật khẩu', async () => {
    renderShell()
    const u = await openMenu()
    await u.click(await screen.findByRole('menuitem', { name: 'Đổi mật khẩu' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Mật khẩu hiện tại/)).toBeInTheDocument()
  })
})

describe('AppShell — sidebar', () => {
  it('"Tổng quan" cố định đầu tiên; mỗi nhóm có tiêu đề và mục của nhóm', () => {
    renderShell()

    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName('Tổng quan')
    expect(links[0]).toHaveAttribute('href', '/')

    const catalog = screen.getByRole('group', { name: 'Danh mục' })
    expect(within(catalog).getByRole('link', { name: 'Example' })).toHaveAttribute(
      'href',
      '/examples',
    )
    const admin = screen.getByRole('group', { name: 'Quản trị' })
    expect(within(admin).getByRole('link', { name: 'Giao diện' })).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  it.each([
    ['/examples', 'Example'],
    ['/examples/abc', 'Example'],
    ['/examples?page=2', 'Example'],
    ['/settings', 'Giao diện'],
    ['/', 'Tổng quan'],
  ])('ở %s → mục "%s" đang mở (aria-current="page"), các mục khác không', (route, active) => {
    renderShell(undefined, route)

    expect(screen.getByRole('link', { name: active })).toHaveAttribute('aria-current', 'page')
    for (const link of screen.getAllByRole('link')) {
      if (link.textContent === active) expect(link).toHaveAttribute('aria-current', 'page')
      else expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('header không còn hiện pathname thô', () => {
    renderShell(undefined, '/examples/abc')
    expect(screen.queryByText('/examples/abc')).not.toBeInTheDocument()
  })

  it('nút trên header thu gọn / mở lại, ghi nhớ vào cookie; Ctrl + B cũng bật/tắt', async () => {
    const { user: u } = renderShell()
    expect(sidebarRoot()).toHaveAttribute('data-state', 'expanded')

    await u.click(screen.getByRole('button', { name: 'Thu gọn / mở rộng menu' }))
    expect(sidebarRoot()).toHaveAttribute('data-state', 'collapsed')
    expect(document.cookie).toContain('sidebar_state=false')

    await u.keyboard('{Control>}b{/Control}')
    expect(sidebarRoot()).toHaveAttribute('data-state', 'expanded')
    expect(document.cookie).toContain('sidebar_state=true')
  })

  it('nút thu gọn báo aria-expanded theo trạng thái và aria-controls trỏ vào sidebar', async () => {
    const { user: u } = renderShell()
    const trigger = screen.getByRole('button', { name: 'Thu gọn / mở rộng menu' })
    expect(document.getElementById(trigger.getAttribute('aria-controls') ?? '')).toBe(sidebarRoot())
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await u.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('Ctrl + B khi đang gõ trong ô nhập (hoặc trong dialog) không bật/tắt sidebar', async () => {
    const { user: u } = renderShell([
      {
        path: '*',
        element: (
          <>
            <input aria-label="Ô nhập" />
            <div
              contentEditable
              suppressContentEditableWarning
              aria-label="Soạn thảo"
              role="textbox"
            />
            <div role="dialog" aria-label="Hộp thoại">
              <button type="button">Trong hộp thoại</button>
            </div>
          </>
        ),
      },
    ])

    await u.click(screen.getByRole('textbox', { name: 'Ô nhập' }))
    await u.keyboard('{Control>}b{/Control}')
    expect(sidebarRoot()).toHaveAttribute('data-state', 'expanded')

    await u.click(screen.getByRole('textbox', { name: 'Soạn thảo' }))
    await u.keyboard('{Control>}b{/Control}')
    expect(sidebarRoot()).toHaveAttribute('data-state', 'expanded')

    act(() => screen.getByRole('button', { name: 'Trong hộp thoại' }).focus())
    await u.keyboard('{Control>}b{/Control}')
    expect(sidebarRoot()).toHaveAttribute('data-state', 'expanded')

    // Ngoài ô nhập / dialog thì phím tắt vẫn chạy.
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    await u.keyboard('{Control>}b{/Control}')
    expect(sidebarRoot()).toHaveAttribute('data-state', 'collapsed')
  })

  it('cookie sidebar_state=false (F5 sau khi thu gọn) → mở ra đã thu gọn', () => {
    document.cookie = 'sidebar_state=false; path=/'
    renderShell()
    expect(sidebarRoot()).toHaveAttribute('data-state', 'collapsed')
  })

  it('thu gọn: focus vào mục → tooltip tên mục', async () => {
    document.cookie = 'sidebar_state=false; path=/'
    renderShell()

    act(() => screen.getByRole('link', { name: 'Example' }).focus())

    expect(await screen.findByRole('tooltip', { name: 'Example' })).toBeInTheDocument()
  })

  it('màn < 768px: sidebar là ngăn trượt mở bằng nút ☰; chọn mục → điều hướng và tự đóng', async () => {
    // Chỉ test này giả màn nhỏ: useIsMobile đọc matchMedia('(max-width: 767px)').
    const realMatchMedia = window.matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      ...realMatchMedia(query),
      matches: query === '(max-width: 767px)',
    }))
    const { user: u, router } = renderShell()

    // Ngăn trượt đóng: không có link menu nào trên màn.
    expect(screen.queryByRole('link', { name: 'Example' })).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: 'Thu gọn / mở rộng menu' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await u.click(trigger)
    const drawer = await screen.findByRole('dialog', { name: 'Menu chính' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(trigger.getAttribute('aria-controls') ?? '')).toBe(drawer)
    await u.click(within(drawer).getByRole('link', { name: 'Example' }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/examples')
  })
})

describe('AppShell — landmark', () => {
  it('một <main> chứa nội dung màn, header (banner) nằm ngoài main, menu là <nav> có tên', () => {
    renderShell()

    const mains = screen.getAllByRole('main')
    expect(mains).toHaveLength(1)
    expect(within(mains[0]).getByText('MÀN CHÍNH')).toBeInTheDocument()

    const banner = screen.getByRole('banner')
    expect(mains[0]).not.toContainElement(banner)
    expect(within(banner).getByRole('navigation', { name: 'Vị trí hiện tại' })).toBeInTheDocument()

    const menu = screen.getByRole('navigation', { name: 'Menu chính' })
    expect(within(menu).getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/')
    expect(within(menu).getByRole('link', { name: 'Example' })).toHaveAttribute('href', '/examples')
  })
})

describe('AppShell — màn hẹp (class responsive; jsdom không áp media query nên kiểm cấu trúc)', () => {
  it('vùng nội dung có min-w-0 — thiếu nó bảng rộng đẩy cả trang tràn ngang (lỗi thấy ở 768px)', () => {
    renderShell()
    expect(screen.getByRole('main').parentElement).toHaveClass('min-w-0')
  })

  it('nút tài khoản: dưới sm chỉ còn ảnh đại diện, tên khả truy cập vẫn đủ tên + vai trò', () => {
    renderShell()
    // Tài khoản test không có họ tên → "Người dùng", không phải tên đăng nhập.
    const button = screen.getByRole('button', { name: 'Người dùng (Quản trị cấp cao)' })
    // Khối tên + vai trò chỉ hiện từ sm; ảnh đại diện luôn hiện.
    expect(within(button).getByText('Người dùng').parentElement).toHaveClass('hidden', 'sm:flex')
  })

  it('breadcrumb dưới sm chỉ còn mục cuối (cắt "…"); mục trước và dấu phân cách ẩn', () => {
    renderShell(
      [{ path: '/examples', element: <div />, handle: { crumb: 'nav:examples' } }],
      '/examples',
    )
    const trail = screen.getByRole('navigation', { name: 'Vị trí hiện tại' })

    expect(within(trail).getByRole('link', { name: 'Tổng quan' }).closest('li')).toHaveClass(
      'hidden',
      'sm:inline-flex',
    )
    const separators = trail.querySelectorAll('[data-slot="breadcrumb-separator"]')
    expect(separators).toHaveLength(1)
    for (const separator of Array.from(separators))
      expect(separator).toHaveClass('hidden', 'sm:inline-flex')
    const current = within(trail).getByText('Example')
    expect(current).toHaveClass('truncate')
    expect(current.closest('li')).not.toHaveClass('hidden')
  })
})

describe('AppShell — tải màn lazy', () => {
  it('đang tải màn mới: màn cũ vẫn hiện + thanh tiến trình; tải xong thì thanh biến mất', async () => {
    let finishLoading: () => void = () => {}
    const loaded = new Promise<void>((resolve) => {
      finishLoading = resolve
    })
    const { user: u } = renderShell([
      { path: '/', element: <div>MÀN CŨ</div> },
      {
        path: '/examples',
        lazy: async () => {
          await loaded
          return { Component: () => <div>MÀN MỚI</div> }
        },
      },
    ])
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

    await u.click(screen.getByRole('link', { name: 'Example' }))

    expect(await screen.findByRole('progressbar', { name: 'Đang tải...' })).toBeInTheDocument()
    expect(screen.getByText('MÀN CŨ')).toBeInTheDocument()

    finishLoading()

    expect(await screen.findByText('MÀN MỚI')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText('MÀN CŨ')).not.toBeInTheDocument()
  })
})

describe('AppShell — breadcrumb và tiêu đề tab', () => {
  // Cây giống app thật: "/" có crumb Tổng quan, /examples có crumb Example, /plain không có crumb.
  const screens: RouteObject[] = [
    { index: true, handle: { crumb: 'nav:home' }, element: <div>MÀN TỔNG QUAN</div> },
    { path: '/examples', handle: { crumb: 'nav:examples' }, element: <div>MÀN EXAMPLE</div> },
    { path: '/plain', element: <div>MÀN KHÔNG CRUMB</div> },
  ]

  const breadcrumb = () => screen.getByRole('navigation', { name: 'Vị trí hiện tại' })

  afterEach(async () => {
    await i18n.changeLanguage('vi')
  })

  it('/examples: "Tổng quan" là link về /, "Example" là trang hiện tại (không phải link); không có tên nhóm', () => {
    renderShell(screens, '/examples')

    const trail = within(breadcrumb())
    expect(trail.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/')
    expect(trail.getByText('Example')).toHaveAttribute('aria-current', 'page')
    expect(trail.queryByRole('link', { name: 'Example' })).not.toBeInTheDocument()
    expect(trail.queryByText('Danh mục')).not.toBeInTheDocument()
    expect(document.title).toBe('Example · Warehouse')
  })

  it('/: chỉ có "Tổng quan", là trang hiện tại', () => {
    renderShell(screens, '/')

    const trail = within(breadcrumb())
    expect(trail.getAllByRole('listitem')).toHaveLength(1)
    expect(trail.getByText('Tổng quan')).toHaveAttribute('aria-current', 'page')
    expect(trail.queryByRole('link')).not.toBeInTheDocument()
    expect(document.title).toBe('Tổng quan · Warehouse')
  })

  it('màn không khai crumb: "Tổng quan" vẫn là link; tiêu đề tab chỉ là tên app', () => {
    renderShell(screens, '/plain')

    expect(within(breadcrumb()).getByRole('link', { name: 'Tổng quan' })).toBeInTheDocument()
    expect(document.title).toBe('Warehouse')
  })

  it('chuyển màn → breadcrumb và tiêu đề đổi theo', async () => {
    const { user: u } = renderShell(screens, '/')
    expect(document.title).toBe('Tổng quan · Warehouse')

    await u.click(within(sidebarRoot()).getByRole('link', { name: 'Example' }))

    expect(await screen.findByText('MÀN EXAMPLE')).toBeInTheDocument()
    expect(within(breadcrumb()).getByText('Example')).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Example · Warehouse')
  })

  it('đổi ngôn ngữ → breadcrumb và tiêu đề dịch lại', async () => {
    renderShell(screens, '/')

    await act(() => i18n.changeLanguage('en'))

    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Overview'),
    ).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Overview · Warehouse')
  })

  it('route cha và route index con cùng khai crumb (cùng pathname) → chỉ một mục', () => {
    const error = vi.spyOn(console, 'error')
    renderShell(
      [
        {
          path: '/examples',
          handle: { crumb: 'nav:examples' },
          children: [{ index: true, handle: { crumb: 'nav:examples' }, element: <div>DS</div> }],
        },
      ],
      '/examples',
    )

    const trail = within(breadcrumb())
    expect(trail.getAllByRole('listitem')).toHaveLength(2)
    expect(trail.getAllByText('Example')).toHaveLength(1)
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining('same key'),
      expect.anything(),
      expect.anything(),
    )
  })

  it('rời layout (unmount) → tiêu đề trả về tên app', () => {
    const { unmount } = renderShell(screens, '/examples')
    expect(document.title).toBe('Example · Warehouse')

    unmount()

    expect(document.title).toBe('Warehouse')
  })
})
