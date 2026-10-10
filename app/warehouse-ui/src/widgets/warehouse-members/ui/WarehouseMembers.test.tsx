import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import type { User } from '@/entities/user'
import { ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { WarehouseMembers } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const role = { slug: 'staff', name: 'STAFF', level: 1 }

const lan = {
  slug: 'u-lan',
  phonenumber: '0384940599',
  firstName: 'Lan',
  lastName: 'Trần',
  roleName: 'STAFF',
  role,
  isActive: true,
} as unknown as User
const binh = {
  ...lan,
  slug: 'u-binh',
  phonenumber: '0911111111',
  firstName: 'Bình',
  lastName: 'Lê',
}

const warehouse = { slug: 'kho-hn', name: 'Kho Hà Nội' }

function mockMembers(items: User[]) {
  const urls: URL[] = []
  server.use(
    mswHttp.get(`${BASE}/users`, ({ request }) => {
      urls.push(new URL(request.url))
      return paginated(items)
    }),
    mswHttp.get(`${BASE}/warehouses/kho-hn/available-members`, () => paginated([])),
  )
  return urls
}

describe('WarehouseMembers', () => {
  it('tiêu đề, gọi GET /users?warehouseSlug=, hiện từng thành viên', async () => {
    const urls = mockMembers([lan, binh])
    renderWithProviders(<WarehouseMembers warehouse={warehouse} canManage={false} />, {
      auth: 'admin',
    })

    expect(screen.getByRole('heading', { level: 2, name: 'Thành viên' })).toBeInTheDocument()
    expect(await screen.findByText('Trần Lan')).toBeInTheDocument()
    expect(screen.getByText('Lê Bình')).toBeInTheDocument()
    expect(urls[0].searchParams.get('warehouseSlug')).toBe('kho-hn')
    expect(urls[0].searchParams.get('page')).toBe('1')
    expect(urls[0].searchParams.get('size')).toBe('10')
    expect(urls[0].searchParams.has('sort')).toBe(false)
    // Không có sắp xếp phía server → không cột nào bấm được.
    const header = screen.getAllByRole('columnheader')
    expect(
      within(screen.getByRole('table')).queryAllByRole('button', { name: /Họ|Tên đăng nhập/ }),
    ).toHaveLength(0)
    expect(header.map((h) => h.textContent)).toEqual([
      'Họ tên',
      'Tên đăng nhập',
      'Vai trò',
      'Trạng thái',
    ])
  })

  it('canManage=false → không có nút Thêm, không menu ⋯, không cột thao tác (Review Focus #5)', async () => {
    mockMembers([lan, binh])
    renderWithProviders(<WarehouseMembers warehouse={warehouse} canManage={false} />, {
      auth: 'admin',
    })
    await screen.findByText('Trần Lan')

    expect(screen.queryByRole('button', { name: 'Thêm thành viên' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Thao tác với / })).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(4)
  })

  it('canManage=true → nút Thêm mở hộp thêm; mỗi dòng có menu ⋯, mục "Gỡ khỏi kho" mở hộp gỡ', async () => {
    mockMembers([lan, binh])
    const user = userEvent.setup()
    renderWithProviders(<WarehouseMembers warehouse={warehouse} canManage />, { auth: 'admin' })
    await screen.findByText('Trần Lan')

    await user.click(screen.getByRole('button', { name: 'Thêm thành viên' }))
    expect(
      await screen.findByRole('dialog', { name: 'Thêm thành viên vào kho' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Không còn nút chữ "Gỡ" trên dòng — thao tác nằm trong menu ⋯ như mọi bảng khác.
    expect(screen.queryByRole('button', { name: /^Gỡ/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Thao tác với / })).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Thao tác với Trần Lan' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Gỡ khỏi kho' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Gỡ thành viên')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Trần Lan')
  })

  it('đánh dấu "Bạn" cho chính người đăng nhập (so theo số đăng nhập)', async () => {
    mockMembers([lan, binh])
    renderWithProviders(<WarehouseMembers warehouse={warehouse} canManage={false} />, {
      auth: { userName: '0384940599', roleName: 'STAFF', scope: ['USER_READ'] },
    })
    const row = (await screen.findByText('Trần Lan')).closest('tr')!
    expect(within(row).getByText('Bạn')).toBeInTheDocument()
    expect(within(screen.getByText('Lê Bình').closest('tr')!).queryByText('Bạn')).toBeNull()
  })

  it('không có thành viên → "Kho chưa có thành viên."', async () => {
    mockMembers([])
    renderWithProviders(<WarehouseMembers warehouse={warehouse} canManage />, { auth: 'admin' })
    expect(await screen.findByText('Kho chưa có thành viên.')).toBeInTheDocument()
  })

  it('gỡ người cuối của trang cuối → totalPages giảm, kéo page về trang cuối còn lại', async () => {
    const pages: number[] = []
    server.use(
      mswHttp.get(`${BASE}/users`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        pages.push(page)
        // Trang 1 báo 2 trang; trang 2 trả về khi backend đã chỉ còn 1 trang (người cuối vừa bị gỡ).
        if (page === 1) return paginated([lan], { page: 1, total: 11 })
        return paginated([], { page, total: 10 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<WarehouseMembers warehouse={warehouse} canManage={false} />, {
      auth: 'admin',
    })
    await screen.findByText('Trần Lan')

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => expect(pages).toEqual([1, 2, 1]))
    expect(await screen.findByText('Trần Lan')).toBeInTheDocument()
  })

  it('bấm dòng thành viên → sheet chi tiết người dùng, chỉ xem (không nút thao tác)', async () => {
    mockMembers([lan, binh])
    server.use(mswHttp.get(`${BASE}/users/${lan.slug}`, () => ok(lan)))
    const user = userEvent.setup()
    renderWithProviders(<WarehouseMembers warehouse={warehouse} canManage />, { auth: 'admin' })

    await user.click(await screen.findByRole('button', { name: 'Xem chi tiết Trần Lan' }))
    const sheet = await screen.findByRole('dialog', { name: 'Trần Lan' })
    expect(within(sheet).getByText('Tên đăng nhập')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /^(Sửa|Khoá|Gỡ)/ })).not.toBeInTheDocument()
  })
})
