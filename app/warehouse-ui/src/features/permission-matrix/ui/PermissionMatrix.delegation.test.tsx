import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Chạy với cờ `permissionDelegationRules` BẬT. Phần cờ tắt nằm ở PermissionMatrix.test.tsx.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    search: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: true,
    permissionDelegationRules: true,
  },
}))

import type { Authority } from '@/entities/authority'
import type { Role } from '@/entities/user'
import { renderWithProviders } from '@/shared/test/render'
import { PermissionMatrix } from './PermissionMatrix'

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
  { slug: 'admin', name: 'ADMIN', authorityCodes: ['MANAGE_PERMISSIONS', 'IMPORT_FORM_CREATE'] },
  {
    slug: 'manager',
    name: 'MANAGER',
    authorityCodes: ['MANAGE_PERMISSIONS', 'IMPORT_FORM_CREATE'],
  },
  { slug: 'supervisor', name: 'SUPERVISOR', authorityCodes: [] },
]

function renderAs(roleName: string, scope: string[]) {
  return renderWithProviders(<PermissionMatrix roles={roles} authorities={authorities} />, {
    route: '/permissions',
    auth: { userId: 'u1', userName: 't', roleName, scope },
  })
}

describe('PermissionMatrix — luật ủy quyền (cờ bật), đăng nhập MANAGER', () => {
  const MANAGER_SCOPE = ['MANAGE_PERMISSIONS', 'IMPORT_FORM_CREATE']

  it('R1: cột ADMIN và MANAGER chỉ xem — không có switch nào', () => {
    renderAs('MANAGER', MANAGER_SCOPE)

    for (const name of ['ADMIN', 'MANAGER'])
      for (const a of authorities)
        expect(
          screen.queryByRole('switch', { name: `${a.name} — ${name}` }),
        ).not.toBeInTheDocument()
  })

  it('R1: tiêu đề cột chỉ xem có nhãn "Chỉ xem" kèm lý do', () => {
    renderAs('MANAGER', MANAGER_SCOPE)

    // 2 cột chỉ xem × 2 nhóm (mỗi nhóm một bảng, header lặp lại).
    const labels = screen.getAllByText('Chỉ xem')
    expect(labels).toHaveLength(4)
    expect(labels[0]).toHaveAttribute(
      'title',
      'Bạn chỉ chỉnh được quyền của vai trò cấp thấp hơn mình.',
    )
  })

  it('R1: ô chỉ xem vẫn cho biết đã cấp hay chưa', () => {
    renderAs('MANAGER', MANAGER_SCOPE)

    expect(
      screen.getByRole('img', { name: 'Tạo phiếu nhập kho — ADMIN: Đã cấp' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Xác nhận phiếu nhập kho — ADMIN: Chưa cấp' }),
    ).toBeInTheDocument()
  })

  it('cột SUPERVISOR: mã MANAGER có → bấm được', () => {
    renderAs('MANAGER', MANAGER_SCOPE)

    expect(screen.getByRole('switch', { name: 'Tạo phiếu nhập kho — SUPERVISOR' })).toBeEnabled()
  })

  it('R2: mã MANAGER không có → khoá, rê chuột thấy lý do', () => {
    renderAs('MANAGER', MANAGER_SCOPE)
    const cell = screen.getByRole('switch', { name: 'Xác nhận phiếu nhập kho — SUPERVISOR' })

    expect(cell).toBeDisabled()
    expect(cell.closest('span[title]')).toHaveAttribute(
      'title',
      'Bạn không có quyền này nên không cấp/gỡ được cho người khác.',
    )
  })

  it('R3: MANAGE_PERMISSIONS khoá dù MANAGER đang có nó', () => {
    renderAs('MANAGER', MANAGER_SCOPE)
    const cell = screen.getByRole('switch', { name: 'Quản trị phân quyền — SUPERVISOR' })

    expect(cell).toBeDisabled()
    expect(cell.closest('span[title]')).toHaveAttribute(
      'title',
      'Quyền này chỉ quản trị viên cấp cao nhất cấp được.',
    )
  })
})

describe('PermissionMatrix — luật ủy quyền (cờ bật), đăng nhập SUPER_ADMIN', () => {
  it('được miễn R1–R3: mọi cột có switch, MANAGE_PERMISSIONS bấm được', () => {
    renderAs('SUPER_ADMIN', [])

    expect(screen.queryByText('Chỉ xem')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Quản trị phân quyền — SUPERVISOR' })).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Xác nhận phiếu nhập kho — ADMIN' })).toBeEnabled()
  })
})
