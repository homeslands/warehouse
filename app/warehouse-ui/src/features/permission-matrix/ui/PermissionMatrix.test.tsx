import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// Cố định cờ: file này mô tả hành vi KHI CHƯA CÓ luật ủy quyền. Không cố định thì test chạy theo
// giá trị cờ trong working tree — ai bật cờ ở máy mình để thử là cả file đỏ oan. Phần cờ bật:
// PermissionMatrix.delegation.test.tsx.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    userSort: false,
    search: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: true,
    permissionDelegationRules: false,
  },
}))

import { toast } from 'sonner'
import type { Authority } from '@/entities/authority'
import type { Role } from '@/entities/user'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { PermissionMatrix } from './PermissionMatrix'

const BASE = 'http://localhost:8085/api/v1'

const authorities: Authority[] = [
  {
    slug: 'a1',
    code: 'IMPORT_FORM_CREATE',
    name: 'Tạo phiếu nhập',
    authorityGroup: { slug: 'g1', name: 'Import Form' },
  },
  {
    slug: 'a2',
    code: 'IMPORT_FORM_CONFIRM',
    name: 'Xác nhận phiếu nhập',
    authorityGroup: { slug: 'g1', name: 'Import Form' },
  },
  {
    slug: 'a3',
    code: 'MANAGE_PERMISSIONS',
    name: 'Quản trị phân quyền',
    authorityGroup: { slug: 'g2', name: 'System' },
  },
]

const roles: Role[] = [
  { slug: 'super-admin', name: 'SUPER_ADMIN', authorityCodes: [] },
  { slug: 'admin', name: 'ADMIN', authorityCodes: ['MANAGE_PERMISSIONS'] },
  { slug: 'manager', name: 'MANAGER', authorityCodes: ['IMPORT_FORM_CONFIRM'] },
]

const ADMIN_USER = { userName: 'a', roleName: 'ADMIN', scope: ['MANAGE_PERMISSIONS'] }

function renderMatrix(
  auth: unknown = ADMIN_USER,
  over: Partial<{ roles: Role[] }> = {},
  queryClient?: ReturnType<typeof mutationToastQueryClient>,
) {
  return renderWithProviders(
    <PermissionMatrix roles={over.roles ?? roles} authorities={authorities} />,
    { route: '/permissions', auth: auth as never, queryClient },
  )
}

/**
 * Mọi lần đổi quyền đều đi qua hộp xác nhận, nên test nào quan tâm tới REQUEST đều phải bấm qua
 * hộp. `confirmLabel` khác nhau giữa cấp và gỡ — truyền vào để test hỏng nếu hộp hiện sai nhánh.
 */
async function confirmToggle(
  user: { click: (el: Element) => Promise<void> },
  switchName: string,
  confirmLabel: string,
) {
  await user.click(screen.getByRole('switch', { name: switchName }))
  const box = await screen.findByRole('alertdialog')
  await user.click(within(box).getByRole('button', { name: confirmLabel }))
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  server.use(
    mswHttp.get(`${BASE}/roles`, () => ok(roles)),
    mswHttp.get(`${BASE}/auth/me`, () => ok({ ...ADMIN_USER })),
  )
})

describe('PermissionMatrix — dựng bảng', () => {
  it('đủ số authority API trả về, nhóm theo AuthorityGroup', () => {
    renderMatrix()

    // Đừng ghim cứng số lượng — backend thêm authority qua migration là con số đổi. Tên hiển thị là
    // tên i18n theo mã, không phải `name` của fixture (xem ca "tên quyền lấy theo MÃ").
    for (const label of ['Tạo phiếu nhập kho', 'Xác nhận phiếu nhập kho', 'Quản trị phân quyền'])
      expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('Phiếu nhập kho')).toBeInTheDocument()
    expect(screen.getByText('Hệ thống')).toBeInTheDocument()
  })

  it('hiện mã authority cạnh tên', () => {
    renderMatrix()

    expect(screen.getByText('IMPORT_FORM_CREATE')).toBeInTheDocument()
  })

  it('cột SUPER_ADMIN có hiện nhưng ô KHÔNG phải switch', () => {
    renderMatrix()

    // Mỗi nhóm là một bảng riêng nên header cột lặp lại ở từng bảng — fixture có 2 nhóm.
    expect(screen.getAllByText('Quản trị cấp cao')).toHaveLength(2)
    // Không có switch nào thuộc cột đó — nó bypass toàn bộ, không có dữ liệu quyền để bật/tắt.
    expect(
      screen.queryByRole('switch', { name: 'Tạo phiếu nhập kho — Quản trị cấp cao' }),
    ).not.toBeInTheDocument()
  })

  it('khung bảng hẹp (container query): cột SUPER_ADMIN (chỉ là lời nhắc) ẩn dưới @xl; cột tên quyền giới hạn bề ngang và xuống dòng', () => {
    renderMatrix()

    for (const header of screen.getAllByRole('columnheader', { name: 'Quản trị cấp cao' }))
      expect(header).toHaveClass('hidden', '@xl:table-cell')
    for (const cell of screen.getAllByText('Toàn quyền'))
      expect(cell).toHaveClass('hidden', '@xl:table-cell')
    expect(screen.getByText('IMPORT_FORM_CREATE').closest('td')).toHaveClass(
      'max-w-40',
      'whitespace-normal',
      '@2xl:max-w-none',
    )
    // Mã quyền xuống dòng ở dấu `_`, không bẻ giữa chữ.
    expect(screen.getByText('IMPORT_FORM_CREATE').querySelectorAll('wbr')).toHaveLength(2)
  })

  it('switch phản ánh authorityCodes của từng role', () => {
    renderMatrix()

    expect(screen.getByRole('switch', { name: 'Xác nhận phiếu nhập kho — Quản lý' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' })).not.toBeChecked()
  })

  it('hiện chú thích giải thích vì sao cột SUPER_ADMIN không bấm được', () => {
    renderMatrix()

    expect(
      screen.getByText(
        'Quản trị cấp cao đi qua mọi cổng kiểm tra quyền nên không có dữ liệu bật/tắt — cột này chỉ để nhắc rằng vai trò này luôn có đủ quyền.',
      ),
    ).toBeInTheDocument()
  })
})

describe('PermissionMatrix — thứ tự cột và tên quyền', () => {
  it('cột xếp theo cấp bậc SUPER_ADMIN → ADMIN → MANAGER → SUPERVISOR, dù API trả thứ tự khác', () => {
    const shuffled: Role[] = [
      { slug: 'supervisor', name: 'SUPERVISOR', authorityCodes: [] },
      { slug: 'manager', name: 'MANAGER', authorityCodes: [] },
      { slug: 'super-admin', name: 'SUPER_ADMIN', authorityCodes: [] },
      { slug: 'admin', name: 'ADMIN', authorityCodes: ['MANAGE_PERMISSIONS'] },
    ]
    renderMatrix(ADMIN_USER, { roles: shuffled })

    const firstTable = screen.getAllByRole('table')[0]!
    const headers = within(firstTable)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual(['Quyền', 'Quản trị cấp cao', 'Quản trị viên', 'Quản lý', 'Giám sát'])
  })

  it('tên quyền lấy theo MÃ từ i18n, không theo tên backend; mã vẫn hiện nguyên', () => {
    const own: Authority[] = [
      {
        slug: 'u1',
        code: 'USER_CREATE',
        name: 'Create user',
        authorityGroup: { slug: 'g', name: 'User Management' },
      },
    ]
    renderWithProviders(<PermissionMatrix roles={roles} authorities={own} />, {
      route: '/permissions',
      auth: ADMIN_USER as never,
    })

    expect(screen.getByText('Tạo người dùng')).toBeInTheDocument()
    expect(screen.queryByText('Create user')).not.toBeInTheDocument()
    expect(screen.getByText('USER_CREATE')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Người dùng' })).toBeInTheDocument()
  })

  it('mã hoặc nhóm FE chưa biết → hiện tên backend trả về, không vỡ màn', () => {
    const own: Authority[] = [
      {
        slug: 'x1',
        code: 'BRAND_NEW_CODE',
        name: 'Quyền mới',
        authorityGroup: { slug: 'g', name: 'Brand New Group' },
      },
    ]
    renderWithProviders(<PermissionMatrix roles={roles} authorities={own} />, {
      route: '/permissions',
      auth: ADMIN_USER as never,
    })

    expect(screen.getByText('Quyền mới')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Brand New Group' })).toBeInTheDocument()
  })
})

describe('PermissionMatrix — hộp xác nhận', () => {
  it('bấm switch CHƯA gửi gì, chỉ mở hộp xác nhận', async () => {
    let called = false
    server.use(
      mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, () => {
        called = true
        return ok('granted')
      }),
    )
    const { user } = renderMatrix()

    await user.click(screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('huỷ hộp → không gửi gì và switch giữ nguyên', async () => {
    let called = false
    server.use(
      mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, () => {
        called = true
        return ok('granted')
      }),
    )
    const { user } = renderMatrix()
    const cell = screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' })

    await user.click(cell)
    const box = await screen.findByRole('alertdialog')
    await user.click(within(box).getByRole('button', { name: 'Huỷ' }))

    expect(called).toBe(false)
    expect(cell).not.toBeChecked()
  })

  it('hộp gọi đúng tên quyền và tên vai trò đang đổi', async () => {
    const { user } = renderMatrix()

    await user.click(screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' }))

    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByText(/Tạo phiếu nhập kho/)).toBeInTheDocument()
    expect(within(box).getByText(/Quản lý/)).toBeInTheDocument()
  })

  it('cấp và gỡ dùng hai câu khác nhau', async () => {
    const { user } = renderMatrix()

    await user.click(screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' }))
    expect(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cấp quyền' }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    // Ô đang BẬT → hộp phải chuyển sang nhánh gỡ, không phải vẫn câu cấp quyền.
    await user.click(screen.getByRole('switch', { name: 'Xác nhận phiếu nhập kho — Quản lý' }))
    expect(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Gỡ quyền' }),
    ).toBeInTheDocument()
  })
})

describe('PermissionMatrix — bật/tắt', () => {
  it('bật gửi PUT đúng role và code', async () => {
    let hit = ''
    server.use(
      mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, ({ params }) => {
        hit = `${String(params.roleSlug)}/${String(params.code)}`
        return ok('granted')
      }),
    )
    const { user } = renderMatrix()

    await confirmToggle(user, 'Tạo phiếu nhập kho — Quản lý', 'Cấp quyền')

    await waitFor(() => expect(hit).toBe('manager/IMPORT_FORM_CREATE'))
  })

  it('tắt gửi DELETE', async () => {
    let hit = ''
    server.use(
      mswHttp.delete(`${BASE}/roles/:roleSlug/authorities/:code`, ({ params }) => {
        hit = `${String(params.roleSlug)}/${String(params.code)}`
        return ok('revoked')
      }),
    )
    const { user } = renderMatrix()

    await confirmToggle(user, 'Xác nhận phiếu nhập kho — Quản lý', 'Gỡ quyền')

    await waitFor(() => expect(hit).toBe('manager/IMPORT_FORM_CONFIRM'))
  })

  it('thành công → toast.success', async () => {
    server.use(mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, () => ok('granted')))
    const { user } = renderMatrix()

    await confirmToggle(user, 'Tạo phiếu nhập kho — Quản lý', 'Cấp quyền')

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã cấp quyền'))
  })

  it('đang gửi thì chỉ khoá ĐÚNG ô vừa bấm', async () => {
    // Chốt cổng để giữ request treo, nhìn được trạng thái giữa chừng.
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, async () => {
        await gate
        return ok('granted')
      }),
    )
    const { user } = renderMatrix()
    const clicked = screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' })
    const other = screen.getByRole('switch', { name: 'Xác nhận phiếu nhập kho — Quản lý' })

    await confirmToggle(user, 'Tạo phiếu nhập kho — Quản lý', 'Cấp quyền')

    await waitFor(() => expect(clicked).toBeDisabled())
    // Ô khác KHÔNG bị khoá theo — khoá cả bảng là trải nghiệm khác hẳn.
    expect(other).toBeEnabled()

    release()
    await waitFor(() => expect(clicked).toBeEnabled())
  })

  it('hai request chồng nhau — ô thứ nhất vẫn khoá khi ô thứ hai bắt đầu bay', async () => {
    // Ca này phân biệt `Set` (đúng) với suy `disabled` từ `mutation.variables` (sai): bấm ô thứ
    // hai lúc ô thứ nhất đang bay làm `variables` của CÙNG một mutation nhảy sang ô thứ hai, nên
    // cách suy sai sẽ đọc ô thứ nhất là "không còn khớp variables" → mở khoá giữa chừng dù request
    // đầu vẫn treo. Ca "chỉ khoá ĐÚNG ô vừa bấm" ở trên chỉ bấm MỘT ô nên không bắt được lỗi này.
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.put(`${BASE}/roles/:roleSlug/authorities/:code`, async () => {
        await gate
        return ok('granted')
      }),
      mswHttp.delete(`${BASE}/roles/:roleSlug/authorities/:code`, async () => {
        await gate
        return ok('revoked')
      }),
    )
    const { user } = renderMatrix()
    const first = screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' })
    const second = screen.getByRole('switch', { name: 'Xác nhận phiếu nhập kho — Quản lý' })

    await confirmToggle(user, 'Tạo phiếu nhập kho — Quản lý', 'Cấp quyền')
    await waitFor(() => expect(first).toBeDisabled())

    await confirmToggle(user, 'Xác nhận phiếu nhập kho — Quản lý', 'Gỡ quyền')
    await waitFor(() => expect(second).toBeDisabled())
    // Ô thứ nhất vẫn phải khoá — request của nó vẫn treo, chưa `onSettled`.
    expect(first).toBeDisabled()

    release()
    await waitFor(() => expect(first).toBeEnabled())
    await waitFor(() => expect(second).toBeEnabled())
  })

  it('request hỏng → switch KHÔNG đổi trạng thái', async () => {
    server.use(
      mswHttp.put(
        `${BASE}/roles/:roleSlug/authorities/:code`,
        () => new Response(null, { status: 500 }),
      ),
    )
    const { user } = renderMatrix()
    const cell = screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' })

    await confirmToggle(user, 'Tạo phiếu nhập kho — Quản lý', 'Cấp quyền')

    await waitFor(() => expect(cell).toBeEnabled())
    expect(cell).not.toBeChecked()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('request hỏng (500) → toast.error được gọi', async () => {
    // Client mặc định của renderWithProviders không có MutationCache.onError — trên nó
    // `toast.error` không bao giờ được gọi dù mutation có báo lỗi hay không. Phải dùng client mang
    // đúng chốt chặn toast của app thật (`mutationToastQueryClient`) để khẳng định này có ý nghĩa.
    server.use(
      mswHttp.put(
        `${BASE}/roles/:roleSlug/authorities/:code`,
        () => new Response(null, { status: 500 }),
      ),
    )
    const { user } = renderMatrix(ADMIN_USER, {}, mutationToastQueryClient())

    await confirmToggle(user, 'Tạo phiếu nhập kho — Quản lý', 'Cấp quyền')

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})

describe('PermissionMatrix — chốt an toàn', () => {
  it('role CUỐI CÙNG giữ MANAGE_PERMISSIONS → switch khoá, bấm không mở hộp', async () => {
    const { user } = renderMatrix()
    const cell = screen.getByRole('switch', { name: 'Quản trị phân quyền — Quản trị viên' })

    expect(cell).toBeDisabled()
    await user.click(cell)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('còn role khác giữ, và là role của MÌNH → hộp dùng câu TỰ THU HỒI, không phải câu gỡ chung', async () => {
    const twoHolders: Role[] = [
      ...roles,
      { slug: 'supervisor', name: 'SUPERVISOR', authorityCodes: ['MANAGE_PERMISSIONS'] },
    ]
    let called = false
    server.use(
      mswHttp.delete(`${BASE}/roles/:roleSlug/authorities/:code`, () => {
        called = true
        return ok('revoked')
      }),
    )
    const { user } = renderMatrix(ADMIN_USER, { roles: twoHolders })

    await user.click(screen.getByRole('switch', { name: 'Quản trị phân quyền — Quản trị viên' }))

    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByText('Tự bỏ quyền quản trị phân quyền?')).toBeInTheDocument()
    expect(called).toBe(false)

    await user.click(within(box).getByRole('button', { name: 'Huỷ' }))
    expect(called).toBe(false)
  })

  it('còn role khác giữ, và là role của MÌNH → bấm xác nhận thì gửi DELETE đúng role+code', async () => {
    const twoHolders: Role[] = [
      ...roles,
      { slug: 'supervisor', name: 'SUPERVISOR', authorityCodes: ['MANAGE_PERMISSIONS'] },
    ]
    let hit = ''
    server.use(
      mswHttp.delete(`${BASE}/roles/:roleSlug/authorities/:code`, ({ params }) => {
        hit = `${String(params.roleSlug)}/${String(params.code)}`
        return ok('revoked')
      }),
    )
    const { user } = renderMatrix(ADMIN_USER, { roles: twoHolders })

    await confirmToggle(user, 'Quản trị phân quyền — Quản trị viên', 'Bỏ quyền')

    await waitFor(() => expect(hit).toBe('admin/MANAGE_PERMISSIONS'))
  })

  it('gỡ quyền quản trị của role KHÁC → dùng câu gỡ CHUNG, không phải câu tự thu hồi', async () => {
    // Phân biệt hai nhánh: hậu quả chỉ rơi lên chính người bấm khi role trùng role đang đăng nhập.
    const twoHolders: Role[] = [
      ...roles,
      { slug: 'supervisor', name: 'SUPERVISOR', authorityCodes: ['MANAGE_PERMISSIONS'] },
    ]
    const { user } = renderMatrix(ADMIN_USER, { roles: twoHolders })

    await user.click(screen.getByRole('switch', { name: 'Quản trị phân quyền — Giám sát' }))

    const box = await screen.findByRole('alertdialog')
    expect(within(box).getByText('Gỡ quyền này khỏi vai trò?')).toBeInTheDocument()
  })

  it('người đăng nhập là SUPER_ADMIN, role KHÁC giữ quyền cuối cùng → switch của role đó vẫn khoá', () => {
    // Mọi fixture khác đều để role giữ MANAGE_PERMISSIONS cuối cùng trùng đúng role đang đăng nhập
    // (ADMIN), nên không phân biệt được chốt "chìa khoá cuối" (không phụ thuộc ai đang đăng nhập)
    // với chốt "tự thu hồi" (chỉ phụ thuộc role của MÌNH). Ca này đăng nhập bằng SUPER_ADMIN — một
    // role không giữ quyền này — để chứng minh switch của ADMIN khoá vì nó là chìa khoá cuối, không
    // phải vì trùng role đang đăng nhập.
    const SUPER_ADMIN_USER = { userName: 's', roleName: 'SUPER_ADMIN', scope: [] }
    renderMatrix(SUPER_ADMIN_USER)

    expect(
      screen.getByRole('switch', { name: 'Quản trị phân quyền — Quản trị viên' }),
    ).toBeDisabled()
  })
})
