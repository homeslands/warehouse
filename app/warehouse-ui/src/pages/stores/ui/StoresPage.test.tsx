import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders, renderWithRouter, type TestAuth } from '@/shared/test/render'
import { chooseOption, selectedLabel } from '@/shared/test/select'
import type { Store } from '@/entities/store'
import { StoresPage } from '@/pages/stores'

const BASE = 'http://localhost:8085/api/v1'

/** Mã seed mặc định cấp cho ADMIN liên quan tới màn cửa hàng (gán kho cần thêm WAREHOUSE_UPDATE). */
const ADMIN_SCOPE = [
  'STORE_READ',
  'STORE_CREATE',
  'STORE_UPDATE',
  'STORE_DELETE',
  'WAREHOUSE_READ',
  'WAREHOUSE_UPDATE',
]
/** MANAGER / SUPERVISOR theo seed mặc định: chỉ đọc. */
const READ_SCOPE = ['STORE_READ', 'WAREHOUSE_READ']

const store: Store = {
  slug: 'ch-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
  isActive: true,
  warehouseSlug: 'kho-ha-noi',
  warehouseName: 'Kho Hà Nội 1',
}

function LocationProbe() {
  const { search } = useLocation()
  return <output data-testid="location">{search}</output>
}

function renderPage(options: { route?: string; auth?: TestAuth } = {}) {
  return renderWithProviders(
    <>
      <StoresPage />
      <LocationProbe />
    </>,
    { route: options.route ?? '/stores', auth: options.auth ?? 'admin' },
  )
}

function captureQuery(items: Store[] = [store], total = items.length) {
  const seen: string[] = []
  server.use(
    mswHttp.get(`${BASE}/stores`, ({ request }) => {
      const params = new URL(request.url).searchParams
      seen.push(params.toString())
      return paginated(items, {
        page: Number(params.get('page') ?? 1),
        size: Number(params.get('size') ?? 10),
        total,
      })
    }),
  )
  return seen
}

beforeEach(() => {
  captureQuery()
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

describe('StoresPage — bảng', () => {
  it('khung chờ trước, rồi tới dữ liệu', async () => {
    renderPage()

    expect(screen.getAllByTestId('skeleton-row').length).toBeGreaterThan(0)
    expect(await screen.findByText('Cửa hàng Hà Nội 1')).toBeInTheDocument()
  })

  it('hiện đủ cột: mã, tên, tên pháp lý, mã số thuế, kho liên kết, trạng thái, ngày tạo', async () => {
    const createdAt = new Date(2026, 8, 1, 8, 30).toISOString()
    captureQuery([{ ...store, createdAt }])
    renderPage()

    const row = (await screen.findByText('Cửa hàng Hà Nội 1')).closest('tr')!
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('ST-HN-01')
    expect(cells[1]).toHaveTextContent('Cửa hàng Hà Nội 1')
    expect(cells[2]).toHaveTextContent('Công ty TNHH ABC')
    expect(cells[3]).toHaveTextContent('0101234567')
    expect(cells[4]).toHaveTextContent('Kho Hà Nội 1')
    expect(cells[5]).toHaveTextContent('Đang hoạt động')
    expect(cells[6]).toHaveTextContent('01/09/2026 08:30')
  })

  it('tên cửa hàng là link tới trang chi tiết', async () => {
    renderPage()

    expect(await screen.findByRole('link', { name: 'Cửa hàng Hà Nội 1' })).toHaveAttribute(
      'href',
      '/stores/ch-ha-noi',
    )
  })

  it('bấm vào hàng (ô bất kỳ, không riêng tên) → mở trang chi tiết, kèm state.backTo', async () => {
    const { user, router } = renderWithRouter(
      [
        { path: '/stores', element: <StoresPage /> },
        { path: '/stores/:slug', element: <p>CHI TIẾT CỬA HÀNG</p> },
      ],
      { route: '/stores?isActive=true', auth: 'admin' },
    )

    await user.click(await screen.findByText('ST-HN-01'))

    expect(router.state.location.pathname).toBe('/stores/ch-ha-noi')
    expect(router.state.location.state).toEqual({ backTo: '/stores?isActive=true' })
  })

  it('bấm nút ⋯ và mục trong menu của hàng → KHÔNG mở trang chi tiết', async () => {
    const { user, router } = renderWithRouter(
      [
        { path: '/stores', element: <StoresPage /> },
        { path: '/stores/:slug', element: <p>CHI TIẾT CỬA HÀNG</p> },
      ],
      { route: '/stores', auth: 'admin' },
    )

    await user.click(await screen.findByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    // Menu render qua portal (ngoài <tr>) nhưng sự kiện React vẫn nổi lên hàng.
    await user.click(await screen.findByRole('menuitem', { name: 'Sửa' }))

    expect(router.state.location.pathname).toBe('/stores')
  })

  it('link kèm state.backTo bằng đúng URL danh sách hiện tại (kể cả query) — `<Link state>` không hiện trong DOM nên phải điều hướng thật rồi đọc location của route đích', async () => {
    // `renderPage` (renderWithProviders) chỉ dựng MemoryRouter, không có route con để nhận điều
    // hướng — dùng renderWithRouter với một route `:slug` thật để đọc lại `location.state` sau khi
    // bấm link. Xuất phát từ URL có query (`isActive=false`) để chứng minh `backTo` là CẢ URL hiện
    // tại (kể cả bộ lọc), không chỉ `/stores` trần. `isActive` (chứ không `page`) vì chỉ có một
    // dòng dữ liệu — lọc theo trang sẽ bị `useClampPage` kéo về trang 1.
    const { user, router } = renderWithRouter(
      [
        { path: '/stores', element: <StoresPage /> },
        { path: '/stores/:slug', element: <p>CHI TIẾT CỬA HÀNG</p> },
      ],
      { route: '/stores?isActive=true', auth: 'admin' },
    )

    await user.click(await screen.findByRole('link', { name: 'Cửa hàng Hà Nội 1' }))

    expect(router.state.location.pathname).toBe('/stores/ch-ha-noi')
    expect(router.state.location.state).toEqual({ backTo: '/stores?isActive=true' })
  })

  it('cửa hàng chưa gán kho hiện "Chưa có"', async () => {
    captureQuery([{ ...store, warehouseSlug: undefined, warehouseName: undefined }])
    renderPage()

    const row = (await screen.findByText('Cửa hàng Hà Nội 1')).closest('tr')!
    expect(within(row).getAllByRole('cell')[4]).toHaveTextContent(/^Chưa có$/)
  })

  it('cửa hàng đã ngừng hoạt động hiện badge "Ngừng hoạt động"', async () => {
    captureQuery([{ ...store, isActive: false }])
    renderPage()

    expect(await screen.findByText('Ngừng hoạt động')).toBeInTheDocument()
  })

  it('danh sách rỗng hiện câu rỗng; lỗi hiện thông báo tại chỗ', async () => {
    captureQuery([], 0)
    const { unmount } = renderPage()
    expect(await screen.findByText('Chưa có dữ liệu.')).toBeInTheDocument()
    unmount()

    server.use(mswHttp.get(`${BASE}/stores`, () => apiError(500, undefined, 'Boom')))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom')
  })
})

describe('StoresPage — MANAGER', () => {
  it('backend chỉ trả cửa hàng gắn với kho mình quản lý → danh sách trống có câu báo riêng', async () => {
    captureQuery([])
    renderPage({ auth: { userId: 'u2', userName: 'ql', roleName: 'MANAGER', scope: READ_SCOPE } })

    expect(
      await screen.findByText('Chưa có cửa hàng nào gắn với kho bạn quản lý.'),
    ).toBeInTheDocument()
  })

  it('vai trò khác → câu trống chung', async () => {
    captureQuery([])
    renderPage()

    expect(await screen.findByText('Chưa có dữ liệu.')).toBeInTheDocument()
  })
})

describe('StoresPage — trang và bộ lọc trên URL', () => {
  it('đọc trang/số dòng từ URL khi F5', async () => {
    const seen = captureQuery([store], 45)
    renderPage({ route: '/stores?page=2&size=20' })

    await screen.findByText('Cửa hàng Hà Nội 1')
    expect(seen.at(-1)).toContain('page=2')
    expect(seen.at(-1)).toContain('size=20')
  })

  it('bấm Trang sau ghi page lên URL', async () => {
    captureQuery([store], 45)
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=2'))
  })

  it('lọc trạng thái ghi isActive lên URL và lên request', async () => {
    const seen = captureQuery()
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await chooseOption(user, 'Trạng thái', 'Ngừng hoạt động')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('isActive=false'))
    await waitFor(() => expect(seen.at(-1)).toContain('isActive=false'))
  })

  it('đổi bộ lọc khi đang ở trang 2 → quay về trang 1', async () => {
    captureQuery([store], 45)
    const { user } = renderPage({ route: '/stores?page=2' })
    await screen.findByText('Cửa hàng Hà Nội 1')

    await chooseOption(user, 'Trạng thái', 'Đang hoạt động')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('isActive=true'))
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=2')
  })

  it('bộ lọc trên URL lúc vào màn được áp ngay (ô lọc hiện đúng giá trị)', async () => {
    renderPage({ route: '/stores?isActive=false' })

    await screen.findByText('Cửa hàng Hà Nội 1')
    expect(selectedLabel('Trạng thái')).toBe('Ngừng hoạt động')
  })
})

describe('StoresPage — quyền ghi và thao tác', () => {
  // Quyền đến từ `scope`. Fixture mang đúng các mã seed mặc định cấp cho từng vai trò (migration
  // 1783728000026 / 014). Luật chi tiết: `StoresPage.authority.test.tsx`, `model/abilities.test.ts`.
  it('ADMIN (scope mặc định) thấy nút Tạo cửa hàng và menu thao tác từng dòng', async () => {
    renderPage({ auth: { userId: 'u1', userName: 'ad', roleName: 'ADMIN', scope: ADMIN_SCOPE } })
    await screen.findByText('Cửa hàng Hà Nội 1')

    expect(screen.getByRole('button', { name: 'Tạo cửa hàng' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['MANAGER', { userId: 'u2', userName: 'ql', roleName: 'MANAGER', scope: READ_SCOPE }],
    ['SUPERVISOR', { userId: 'u3', userName: 'gs', roleName: 'SUPERVISOR', scope: READ_SCOPE }],
  ])(
    '%s (scope mặc định) chỉ xem: không có nút Tạo, không có cột thao tác',
    async (_role, auth) => {
      renderPage({ auth })
      await screen.findByText('Cửa hàng Hà Nội 1')

      expect(screen.queryByRole('button', { name: 'Tạo cửa hàng' })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: 'Thao tác' })).not.toBeInTheDocument()
    },
  )

  it('bấm Tạo cửa hàng mở sheet rỗng ở chế độ tạo', async () => {
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Tạo cửa hàng' }))

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Tạo cửa hàng' })).toBeInTheDocument()
    expect(within(sheet).getByLabelText(/^Mã(?! số)/)).toHaveValue('')
  })

  it('chọn Sửa mở sheet đã đổ sẵn dữ liệu dòng đó', async () => {
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sửa' }))

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Sửa cửa hàng' })).toBeInTheDocument()
    await waitFor(() => expect(within(sheet).getByLabelText(/^Mã(?! số)/)).toHaveValue('ST-HN-01'))
  })

  it('Ngừng hoạt động phải xác nhận rồi PATCH { isActive }', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/stores/ch-ha-noi`, async ({ request }) => {
        body = await request.json()
        return ok({ ...store, isActive: false })
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ngừng hoạt động' }))
    const box = await screen.findByRole('alertdialog')
    await user.click(within(box).getByRole('button', { name: 'Ngừng hoạt động' }))

    await waitFor(() => expect(body).toEqual({ isActive: false }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('cửa hàng đã ngừng: chọn Mở hoạt động thì HỎI LẠI, xác nhận mới PATCH', async () => {
    captureQuery([{ ...store, isActive: false }])
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/stores/ch-ha-noi`, async ({ request }) => {
        body = await request.json()
        return ok({ ...store })
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mở hoạt động' }))

    // Mở hộp xác nhận chứ KHÔNG gửi ngay — cùng pattern với chiều ngừng hoạt động.
    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByText('Mở hoạt động cửa hàng')).toBeInTheDocument()
    expect(body).toBeUndefined()

    await user.click(within(box).getByRole('button', { name: 'Mở hoạt động' }))

    await waitFor(() => expect(body).toEqual({ isActive: true }))
  })

  it('cửa hàng đã ngừng: bấm Huỷ trong hộp mở hoạt động thì KHÔNG gửi gì', async () => {
    captureQuery([{ ...store, isActive: false }])
    let called = false
    server.use(
      mswHttp.patch(`${BASE}/stores/ch-ha-noi`, () => {
        called = true
        return ok(store)
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mở hoạt động' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Huỷ' }),
    )

    expect(called).toBe(false)
  })

  it('cửa hàng đang hoạt động: mục Xoá bị khoá kèm lý do', async () => {
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))

    const item = await screen.findByRole('menuitem', { name: 'Xoá' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveAttribute('title', 'Phải ngừng hoạt động cửa hàng trước khi xoá')
  })

  it('cửa hàng đã ngừng: xác nhận rồi DELETE', async () => {
    captureQuery([{ ...store, isActive: false }])
    let deleted = ''
    server.use(
      mswHttp.delete(`${BASE}/stores/:slug`, ({ params }) => {
        deleted = String(params.slug)
        return ok(1)
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByRole('heading', { name: 'Xoá cửa hàng' })).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(deleted).toBe('ch-ha-noi'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('bấm Huỷ trong hộp xác nhận thì KHÔNG gọi DELETE', async () => {
    captureQuery([{ ...store, isActive: false }])
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/stores/:slug`, () => {
        called = true
        return ok(1)
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Huỷ' }),
    )

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(called).toBe(false)
  })

  it('xoá lỗi: nhãn "Đang xoá..." lúc chờ, xong rồi hộp VẪN mở để thử lại', async () => {
    captureQuery([{ ...store, isActive: false }])
    // Cổng chặn để khẳng định trạng thái "đang xoá" mà không cần hẹn giờ cố định.
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.delete(`${BASE}/stores/:slug`, async () => {
        await gate
        return apiError(500, undefined, 'Boom')
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    const box = await screen.findByRole('alertdialog')
    await user.click(within(box).getByRole('button', { name: 'Xoá' }))

    expect(await within(box).findByRole('button', { name: 'Đang xoá...' })).toBeDisabled()
    release()

    // Lỗi không được làm hộp biến mất như thể đã xoá được.
    await waitFor(() => expect(within(box).getByRole('button', { name: 'Xoá' })).toBeEnabled())
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})

describe('StoresPage — gán kho', () => {
  it('chọn "Gán kho" mở hộp cho đúng cửa hàng, ô chọn bỏ kho đã gán cho cửa hàng khác', async () => {
    captureQuery([
      store,
      {
        ...store,
        slug: 'ch-hcm',
        name: 'Cửa hàng HCM',
        warehouseSlug: 'kho-2',
        warehouseName: 'Kho 2',
      },
    ])
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () =>
        paginated([
          {
            slug: 'kho-2',
            createdAt: '',
            updatedAt: '',
            name: 'Kho 2',
            code: 'WH-2',
            address: 'HCM',
            isActive: true,
          },
          {
            slug: 'kho-3',
            createdAt: '',
            updatedAt: '',
            name: 'Kho 3',
            code: 'WH-3',
            address: 'Đà Nẵng',
            isActive: true,
          },
        ]),
      ),
    )
    const { user } = renderPage()
    await screen.findByText('Cửa hàng HCM')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng HCM' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Gán kho' }))

    const box = await screen.findByRole('dialog')
    expect(within(box).getByRole('heading', { name: 'Gán kho cho cửa hàng' })).toBeInTheDocument()
    await user.click(within(box).getByRole('combobox'))

    // `kho-1` của chính cửa hàng này vẫn còn; nếu mở từ dòng kia thì `kho-2` bị loại.
    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('Kho 3')).toBeInTheDocument()
    expect(within(list).getByText('Kho 2')).toBeInTheDocument()
  })

  it('mở từ cửa hàng CHƯA gán kho: kho đang bị cửa hàng khác giữ bị loại khỏi ô chọn', async () => {
    captureQuery([
      store,
      {
        ...store,
        slug: 'ch-hcm',
        name: 'Cửa hàng HCM',
        warehouseSlug: 'kho-2',
        warehouseName: 'Kho 2',
      },
    ])
    server.use(
      mswHttp.get(`${BASE}/warehouses`, () =>
        paginated([
          {
            slug: 'kho-2',
            createdAt: '',
            updatedAt: '',
            name: 'Kho 2',
            code: 'WH-2',
            address: 'HCM',
            isActive: true,
          },
          {
            slug: 'kho-3',
            createdAt: '',
            updatedAt: '',
            name: 'Kho 3',
            code: 'WH-3',
            address: 'Đà Nẵng',
            isActive: true,
          },
        ]),
      ),
    )
    const { user } = renderPage()
    await screen.findByText('Cửa hàng Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Cửa hàng Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Gán kho' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('combobox'))

    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('Kho 3')).toBeInTheDocument()
    expect(within(list).queryByText('Kho 2')).not.toBeInTheDocument()
  })
})
