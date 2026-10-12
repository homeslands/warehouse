import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Authority } from '@/entities/authority'
import type { Role } from '@/entities/user'
import { renderWithProviders } from '@/shared/test/render'
import { EXPANDED_GROUPS_KEY } from '../model/expanded-groups'
import { PermissionMatrix } from './PermissionMatrix'

const authorities: Authority[] = [
  {
    slug: 'a1',
    code: 'IMPORT_FORM_CREATE',
    name: 'x',
    authorityGroup: { slug: 'g1', name: 'Import Form' },
  },
  {
    slug: 'a2',
    code: 'IMPORT_FORM_CONFIRM',
    name: 'x',
    authorityGroup: { slug: 'g1', name: 'Import Form' },
  },
  {
    slug: 'a3',
    code: 'MANAGE_PERMISSIONS',
    name: 'x',
    authorityGroup: { slug: 'g2', name: 'System' },
  },
]
const roles: Role[] = [
  { slug: 'super-admin', name: 'SUPER_ADMIN', authorityCodes: [] },
  { slug: 'manager', name: 'MANAGER', authorityCodes: ['IMPORT_FORM_CONFIRM'] },
]
const ADMIN_USER = { userName: 'a', roleName: 'ADMIN', scope: ['MANAGE_PERMISSIONS'] }

const renderMatrix = () =>
  renderWithProviders(<PermissionMatrix roles={roles} authorities={authorities} />, {
    route: '/permissions',
    auth: ADMIN_USER,
  })
const groupButton = (name: RegExp) => screen.getByRole('button', { name })
const IMPORT = /^Phiếu nhập kho/
const SYSTEM = /^Hệ thống/

afterEach(() => vi.restoreAllMocks())

describe('PermissionMatrix — gập / mở nhóm quyền', () => {
  it('mặc định gập hết: không có switch nào; tiêu đề nhóm là nút, ghi số quyền, aria-expanded=false', () => {
    renderMatrix()

    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(groupButton(IMPORT)).toHaveAttribute('aria-expanded', 'false')
    expect(groupButton(IMPORT)).toHaveTextContent('2 quyền')
    expect(groupButton(SYSTEM)).toHaveTextContent('1 quyền')
    // Tiêu đề nhóm vẫn là heading — trình đọc màn hình nhảy theo heading được.
    expect(screen.getByRole('heading', { name: IMPORT })).toBeInTheDocument()
  })

  it('bấm một nhóm → chỉ nhóm đó mở', async () => {
    const { user } = renderMatrix()

    await user.click(groupButton(IMPORT))

    expect(groupButton(IMPORT)).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — Quản lý' })).toBeInTheDocument()
    expect(
      screen.queryByRole('switch', { name: 'Quản trị phân quyền — Quản lý' }),
    ).not.toBeInTheDocument()
    expect(groupButton(SYSTEM)).toHaveAttribute('aria-expanded', 'false')

    await user.click(groupButton(IMPORT))
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })

  it('Mở tất cả / Thu gọn tất cả; nút không có tác dụng thì bị khoá', async () => {
    const { user } = renderMatrix()
    expect(screen.getByRole('button', { name: 'Thu gọn tất cả' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Mở tất cả' }))
    expect(screen.getAllByRole('switch')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Mở tất cả' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Thu gọn tất cả' }))
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })

  it('nhớ nhóm đang mở: vào lại trang vẫn mở đúng nhóm đó', async () => {
    const { user, unmount } = renderMatrix()
    await user.click(groupButton(SYSTEM))
    unmount()

    renderMatrix()

    expect(groupButton(SYSTEM)).toHaveAttribute('aria-expanded', 'true')
    expect(groupButton(IMPORT)).toHaveAttribute('aria-expanded', 'false')
    expect(JSON.parse(localStorage.getItem(EXPANDED_GROUPS_KEY) ?? '[]')).toEqual(['System'])
  })

  it('bộ nhớ trình duyệt bị chặn: vẫn dựng gập hết, bấm mở / gập vẫn chạy', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { user } = renderMatrix()

    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    await user.click(groupButton(IMPORT))
    expect(screen.getAllByRole('switch')).toHaveLength(2)
  })

  it('dữ liệu nhớ hỏng (không phải mảng chuỗi) → coi như gập hết', () => {
    localStorage.setItem(EXPANDED_GROUPS_KEY, '{"oops":1}')
    renderMatrix()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })
})
