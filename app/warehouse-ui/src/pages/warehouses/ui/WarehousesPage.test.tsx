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
import type { Role, User } from '@/entities/user'
import type { Warehouse } from '@/entities/warehouse'
import { WarehousesPage } from '@/pages/warehouses'

const BASE = 'http://localhost:8085/api/v1'

/** Mã seed mặc định cấp cho ADMIN liên quan tới màn kho. */
const ADMIN_SCOPE = [
  'WAREHOUSE_READ',
  'WAREHOUSE_CREATE',
  'WAREHOUSE_UPDATE',
  'WAREHOUSE_DELETE',
  'WAREHOUSE_ASSIGN_MANAGER',
  'USER_READ',
]

const warehouse: Warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  phonenumber: '02412345678',
  isActive: true,
  managerSlug: 'u-manager',
  managerPhonenumber: '0901234567',
}

function LocationProbe() {
  const { search } = useLocation()
  return <output data-testid="location">{search}</output>
}

function renderPage(options: { route?: string; auth?: TestAuth } = {}) {
  return renderWithProviders(
    <>
      <WarehousesPage />
      <LocationProbe />
    </>,
    { route: options.route ?? '/warehouses', auth: options.auth ?? 'admin' },
  )
}

/** Query string mà màn gửi lên backend ở lần gọi GET /warehouses gần nhất. */
function captureQuery(items: Warehouse[] = [warehouse], total = items.length) {
  const seen: string[] = []
  server.use(
    mswHttp.get(`${BASE}/warehouses`, ({ request }) => {
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

const roles: Role[] = [{ slug: 'r-manager', name: 'MANAGER', authorityCodes: [] }]

const managers: User[] = [
  {
    slug: 'u-manager',
    createdAt: '',
    updatedAt: '',
    phonenumber: '0901234567',
    isActive: true,
    roleSlug: 'r-manager',
    roleName: 'MANAGER',
  },
]

beforeEach(() => {
  captureQuery()
  // Ô lọc "Quản lý" nạp ứng viên ngay khi vào màn (useManagerCandidates).
  server.use(
    mswHttp.get(`${BASE}/roles`, () => ok(roles)),
    mswHttp.get(`${BASE}/users`, () => paginated(managers)),
  )
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

describe('WarehousesPage — bảng', () => {
  it('khung chờ trước, rồi tới dữ liệu', async () => {
    renderPage()

    expect(screen.getAllByTestId('skeleton-row').length).toBeGreaterThan(0)
    expect(await screen.findByText('Kho Hà Nội 1')).toBeInTheDocument()
    expect(screen.queryByTestId('skeleton-row')).not.toBeInTheDocument()
  })

  it('hiện đủ cột: mã, tên, địa chỉ, điện thoại, quản lý, trạng thái, ngày tạo', async () => {
    const createdAt = new Date(2026, 8, 1, 8, 30).toISOString()
    captureQuery([{ ...warehouse, createdAt }])
    renderPage()

    const row = (await screen.findByText('Kho Hà Nội 1')).closest('tr')!
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('WH-HN-01')
    expect(cells[1]).toHaveTextContent('Kho Hà Nội 1')
    expect(cells[2]).toHaveTextContent('Số 1, Cầu Giấy, Hà Nội')
    expect(cells[3]).toHaveTextContent('02412345678')
    expect(cells[4]).toHaveTextContent('0901234567')
    expect(cells[5]).toHaveTextContent('Đang hoạt động')
    expect(cells[6]).toHaveTextContent('01/09/2026 08:30')
  })

  it('tên kho là link tới trang chi tiết', async () => {
    renderPage()

    expect(await screen.findByRole('link', { name: 'Kho Hà Nội 1' })).toHaveAttribute(
      'href',
      '/warehouses/kho-ha-noi',
    )
  })

  it('link kèm state.backTo bằng đúng URL danh sách hiện tại (kể cả query) — `<Link state>` không hiện trong DOM nên phải điều hướng thật rồi đọc location của route đích', async () => {
    // `renderPage` (renderWithProviders) chỉ dựng MemoryRouter, không có route con để nhận điều
    // hướng — dùng renderWithRouter với một route `:slug` thật để đọc lại `location.state` sau khi
    // bấm link. Xuất phát từ URL có query (`isActive=false`) để chứng minh `backTo` là CẢ URL hiện
    // tại (kể cả bộ lọc), không chỉ `/warehouses` trần.
    const { user, router } = renderWithRouter(
      [
        { path: '/warehouses', element: <WarehousesPage /> },
        { path: '/warehouses/:slug', element: <p>CHI TIẾT KHO</p> },
      ],
      { route: '/warehouses?isActive=false', auth: 'admin' },
    )

    await user.click(await screen.findByRole('link', { name: 'Kho Hà Nội 1' }))

    expect(router.state.location.pathname).toBe('/warehouses/kho-ha-noi')
    expect(router.state.location.state).toEqual({ backTo: '/warehouses?isActive=false' })
  })

  it('kho chưa có quản lý / chưa có điện thoại hiện "—", không để ô trống', async () => {
    captureQuery([
      {
        ...warehouse,
        phonenumber: undefined,
        managerSlug: undefined,
        managerPhonenumber: undefined,
      },
    ])
    renderPage()

    const row = (await screen.findByText('Kho Hà Nội 1')).closest('tr')!
    const cells = within(row).getAllByRole('cell')
    expect(cells[3]).toHaveTextContent(/^—$/)
    expect(cells[4]).toHaveTextContent(/^—$/)
  })

  it('kho đã ngừng hoạt động hiện badge "Ngừng hoạt động"', async () => {
    captureQuery([{ ...warehouse, isActive: false }])
    renderPage()

    expect(await screen.findByText('Ngừng hoạt động')).toBeInTheDocument()
  })

  it('danh sách rỗng hiện câu rỗng, không phải lỗi', async () => {
    captureQuery([], 0)
    renderPage()

    expect(await screen.findByText('Chưa có dữ liệu.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lỗi lần tải đầu hiện thông báo tại chỗ nhưng giữ tiêu đề màn', async () => {
    server.use(mswHttp.get(`${BASE}/warehouses`, () => apiError(500, undefined, 'Boom')))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Boom')
    expect(screen.getByRole('heading', { name: 'Kho' })).toBeInTheDocument()
  })
})

describe('WarehousesPage — trang và bộ lọc trên URL', () => {
  it('đọc trang/số dòng từ URL khi F5 (gửi đúng page, size lên backend)', async () => {
    const seen = captureQuery([warehouse], 45)
    renderPage({ route: '/warehouses?page=2&size=20' })

    await screen.findByText('Kho Hà Nội 1')
    expect(seen.at(-1)).toContain('page=2')
    expect(seen.at(-1)).toContain('size=20')
  })

  it('bấm Trang sau ghi page lên URL', async () => {
    captureQuery([warehouse], 45)
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=2'))
  })

  it('lọc trạng thái "Ngừng hoạt động" → isActive=false trên URL và trên request', async () => {
    const seen = captureQuery()
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await chooseOption(user, 'Trạng thái', 'Ngừng hoạt động')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('isActive=false'))
    await waitFor(() => expect(seen.at(-1)).toContain('isActive=false'))
  })

  it('đổi bộ lọc khi đang ở trang 2 → quay về trang 1', async () => {
    captureQuery([warehouse], 45)
    const { user } = renderPage({ route: '/warehouses?page=2' })
    await screen.findByText('Kho Hà Nội 1')

    await chooseOption(user, 'Trạng thái', 'Đang hoạt động')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('isActive=true'))
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=2')
  })

  it('tick "Chỉ kho chưa có quản lý" → hasManager=false; bỏ tick thì xoá khỏi URL', async () => {
    const seen = captureQuery()
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('checkbox', { name: 'Chỉ kho chưa có quản lý' }))
    await waitFor(() => expect(seen.at(-1)).toContain('hasManager=false'))

    await user.click(screen.getByRole('checkbox', { name: 'Chỉ kho chưa có quản lý' }))
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('hasManager'))
  })

  it('bộ lọc trên URL lúc vào màn được áp ngay (ô lọc hiện đúng giá trị)', async () => {
    renderPage({ route: '/warehouses?isActive=false&hasManager=false' })

    await screen.findByText('Kho Hà Nội 1')
    expect(selectedLabel('Trạng thái')).toBe('Ngừng hoạt động')
    expect(screen.getByRole('checkbox', { name: 'Chỉ kho chưa có quản lý' })).toBeChecked()
  })
})

describe('WarehousesPage — quyền ghi', () => {
  // Quyền đến từ `scope` (backend gác bằng @RequireAuthority). Fixture mang đúng các mã mà seed mặc
  // định cấp cho từng vai trò (`defaultRoles` ở migration 1783728000014 / 010) — tức hành vi
  // "như cũ" khi admin chưa chỉnh gì ở màn phân quyền. Luật chi tiết theo từng mã:
  // `WarehousesPage.authority.test.tsx` và `model/abilities.test.ts`.
  it('ADMIN (scope mặc định) thấy nút Tạo kho và menu thao tác từng dòng', async () => {
    renderPage({ auth: { userId: 'u1', userName: 'ad', roleName: 'ADMIN', scope: ADMIN_SCOPE } })
    await screen.findByText('Kho Hà Nội 1')

    expect(screen.getByRole('button', { name: 'Tạo kho' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' })).toBeInTheDocument()
  })

  it.each([
    ['MANAGER', { userId: 'u2', userName: 'ql', roleName: 'MANAGER', scope: ['WAREHOUSE_READ'] }],
    [
      'SUPERVISOR',
      { userId: 'u3', userName: 'gs', roleName: 'SUPERVISOR', scope: ['WAREHOUSE_READ'] },
    ],
  ])(
    '%s (scope mặc định) chỉ xem: không có nút Tạo, không có cột thao tác',
    async (_role, auth) => {
      renderPage({ auth })
      await screen.findByText('Kho Hà Nội 1')

      expect(screen.queryByRole('button', { name: 'Tạo kho' })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: 'Thao tác' })).not.toBeInTheDocument()
    },
  )
})

describe('WarehousesPage — tạo / sửa', () => {
  it('bấm Tạo kho mở sheet rỗng ở chế độ tạo', async () => {
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Tạo kho' }))

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Tạo kho' })).toBeInTheDocument()
    expect(within(sheet).getByLabelText(/^Mã/)).toHaveValue('')
  })

  it('chọn Sửa trong menu mở sheet đã đổ sẵn dữ liệu dòng đó', async () => {
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sửa' }))

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Sửa kho' })).toBeInTheDocument()
    await waitFor(() => expect(within(sheet).getByLabelText(/^Mã/)).toHaveValue('WH-HN-01'))
  })
})

describe('WarehousesPage — ngừng / mở hoạt động', () => {
  it('kho đang hoạt động: chọn Ngừng hoạt động phải xác nhận, rồi PATCH { isActive }', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, async ({ request }) => {
        body = await request.json()
        return ok({ ...warehouse, isActive: false })
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ngừng hoạt động' }))

    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByRole('heading', { name: 'Ngừng hoạt động kho' })).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: 'Ngừng hoạt động' }))

    await waitFor(() => expect(body).toEqual({ isActive: false }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('kho đã ngừng: chọn Mở hoạt động thì HỎI LẠI, xác nhận mới PATCH', async () => {
    captureQuery([{ ...warehouse, isActive: false }])
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, async ({ request }) => {
        body = await request.json()
        return ok({ ...warehouse })
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mở hoạt động' }))

    // Mở hộp xác nhận chứ KHÔNG gửi ngay — cùng pattern với chiều ngừng hoạt động.
    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByText('Mở hoạt động kho')).toBeInTheDocument()
    expect(body).toBeUndefined()

    await user.click(within(box).getByRole('button', { name: 'Mở hoạt động' }))

    await waitFor(() => expect(body).toEqual({ isActive: true }))
  })

  it('kho đã ngừng: bấm Huỷ trong hộp mở hoạt động thì KHÔNG gửi gì', async () => {
    captureQuery([{ ...warehouse, isActive: false }])
    let called = false
    server.use(
      mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, () => {
        called = true
        return ok(warehouse)
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mở hoạt động' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Huỷ' }),
    )

    expect(called).toBe(false)
  })
})

describe('WarehousesPage — xoá', () => {
  it('kho đang hoạt động: mục Xoá bị khoá và nêu lý do', async () => {
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))

    const item = await screen.findByRole('menuitem', { name: 'Xoá' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveAttribute('title', 'Phải ngừng hoạt động kho trước khi xoá')
  })

  it('kho đã ngừng: xoá được, có bước xác nhận và gọi DELETE', async () => {
    captureQuery([{ ...warehouse, isActive: false }])
    let deleted = ''
    server.use(
      mswHttp.delete(`${BASE}/warehouses/:slug`, ({ params }) => {
        deleted = String(params.slug)
        return ok(1)
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))

    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByRole('heading', { name: 'Xoá kho' })).toBeInTheDocument()
    await user.click(within(box).getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(deleted).toBe('kho-ha-noi'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('bấm Huỷ trong hộp xác nhận thì KHÔNG gọi DELETE', async () => {
    captureQuery([{ ...warehouse, isActive: false }])
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/warehouses/:slug`, () => {
        called = true
        return ok(1)
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Huỷ' }),
    )

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(called).toBe(false)
  })

  it('xoá lỗi: nhãn "Đang xoá..." lúc chờ, xong rồi hộp VẪN mở để thử lại', async () => {
    captureQuery([{ ...warehouse, isActive: false }])
    // Cổng chặn để khẳng định trạng thái "đang xoá" mà không cần hẹn giờ cố định.
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.delete(`${BASE}/warehouses/:slug`, async () => {
        await gate
        return apiError(500, undefined, 'Boom')
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))
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

describe('WarehousesPage — lọc theo quản lý và gán quản lý', () => {
  it('chọn quản lý ở thanh lọc → managerSlug lên URL và lên request', async () => {
    const seen = captureQuery()
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('combobox', { name: 'Lọc theo quản lý' }))
    // Số điện thoại này cũng nằm ở cột Quản lý của bảng — chỉ tìm trong danh sách đang mở.
    const list = await screen.findByRole('listbox')
    await user.click(await within(list).findByText('0901234567'))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('managerSlug=u-manager'),
    )
    await waitFor(() => expect(seen.at(-1)).toContain('managerSlug=u-manager'))
  })

  it('managerSlug trên URL không nằm trong danh sách ứng viên vẫn hiện ra và xoá được', async () => {
    const seen = captureQuery()
    const { user } = renderPage({ route: '/warehouses?managerSlug=u-cu' })
    await screen.findByText('Kho Hà Nội 1')

    // Quản lý đã bị khoá / link người khác gửi: ô lọc phải nói đang lọc theo ai, không trống trơn.
    const filter = screen.getByRole('combobox', { name: 'Lọc theo quản lý' })
    expect(filter).toHaveTextContent('u-cu')

    await user.click(screen.getByRole('button', { name: 'Xoá lựa chọn' }))

    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('managerSlug'))
    await waitFor(() => expect(seen.at(-1)).not.toContain('managerSlug'))
  })

  it('lọc theo quản lý và "chỉ kho chưa có quản lý" loại trừ nhau', async () => {
    const { user } = renderPage({ route: '/warehouses?hasManager=false' })
    await screen.findByText('Kho Hà Nội 1')

    // Backend bỏ qua hasManager khi đã có managerSlug — không để hai bộ lọc cùng bật gây hiểu nhầm.
    await user.click(screen.getByRole('combobox', { name: 'Lọc theo quản lý' }))
    await user.click(await within(await screen.findByRole('listbox')).findByText('0901234567'))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('managerSlug=u-manager'),
    )
    expect(screen.getByTestId('location')).not.toHaveTextContent('hasManager')
    expect(screen.getByRole('checkbox')).not.toBeChecked()

    await user.click(screen.getByRole('checkbox'))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('hasManager=false'),
    )
    expect(screen.getByTestId('location')).not.toHaveTextContent('managerSlug')
  })

  it('MANAGER không thấy ô lọc quản lý và màn KHÔNG gọi /users (endpoint chỉ dành cho ADMIN)', async () => {
    let userCalls = 0
    server.use(
      mswHttp.get(`${BASE}/users`, () => {
        userCalls += 1
        return paginated(managers)
      }),
    )
    renderPage({ auth: { userId: 'u2', userName: 'quanly', roleName: 'MANAGER', scope: [] } })
    await screen.findByText('Kho Hà Nội 1')

    expect(screen.queryByRole('combobox', { name: 'Lọc theo quản lý' })).not.toBeInTheDocument()
    expect(userCalls).toBe(0)
  })

  it('chọn "Gán quản lý" trong menu mở hộp gán cho đúng kho', async () => {
    const { user } = renderPage()
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'Thao tác với Kho Hà Nội 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Gán quản lý' }))

    const box = await screen.findByRole('dialog')
    expect(within(box).getByRole('heading', { name: 'Gán quản lý kho' })).toBeInTheDocument()
    expect(within(box).getByText('Kho Hà Nội 1')).toBeInTheDocument()
  })
})
