import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { useManagerCandidates } from './hooks'
import { roleKeys, userKeys } from './query-keys'
import type { Role, User } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const roles: Role[] = [
  { slug: 'r-admin', name: 'ADMIN', authorityCodes: [] },
  { slug: 'r-manager', name: 'MANAGER', description: 'Quản lý kho', authorityCodes: [] },
]

const manager: User = {
  slug: 'u-manager',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  phonenumber: '0901234567',
  isActive: true,
  roleSlug: 'r-manager',
  roleName: 'MANAGER',
}

function Probe() {
  const { candidates, isPending, isRoleMissing } = useManagerCandidates()
  return (
    <div>
      <output data-testid="state">
        {isPending ? 'loading' : isRoleMissing ? 'no-role' : 'ready'}
      </output>
      <ul>
        {candidates.map((c) => (
          <li key={c.slug}>{c.phonenumber}</li>
        ))}
      </ul>
    </div>
  )
}

describe('useManagerCandidates', () => {
  it('tra slug vai trò MANAGER rồi lấy user theo roleSlug đó — /roles gọi ĐÚNG MỘT lần', async () => {
    let roleCalls = 0
    let userQuery = ''
    server.use(
      mswHttp.get(`${BASE}/roles`, () => {
        roleCalls += 1
        return ok(roles)
      }),
      mswHttp.get(`${BASE}/users`, ({ request }) => {
        userQuery = new URL(request.url).searchParams.toString()
        return paginated([manager])
      }),
    )

    renderWithProviders(
      <>
        <Probe />
        <Probe />
      </>,
    )

    expect(await screen.findAllByText('0901234567')).toHaveLength(2)
    expect(roleCalls).toBe(1)
    expect(userQuery).toContain('roleSlug=r-manager')
  })

  it('bỏ người dùng đang bị khoá — backend từ chối gán họ (100515)', async () => {
    server.use(
      mswHttp.get(`${BASE}/roles`, () => ok(roles)),
      mswHttp.get(`${BASE}/users`, () =>
        paginated([
          manager,
          { ...manager, slug: 'u-locked', phonenumber: '0909999999', isActive: false },
        ]),
      ),
    )

    renderWithProviders(<Probe />)

    expect(await screen.findByText('0901234567')).toBeInTheDocument()
    expect(screen.queryByText('0909999999')).not.toBeInTheDocument()
  })

  it('không có vai trò MANAGER → danh sách rỗng, isRoleMissing = true, KHÔNG gọi /users', async () => {
    let userCalls = 0
    server.use(
      mswHttp.get(`${BASE}/roles`, () => ok([roles[0]])),
      mswHttp.get(`${BASE}/users`, () => {
        userCalls += 1
        return paginated([manager])
      }),
    )

    renderWithProviders(<Probe />)

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('no-role'))
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(userCalls).toBe(0)
  })

  it('/roles lỗi → KHÔNG kết luận "chưa có vai trò MANAGER"', async () => {
    server.use(
      mswHttp.get(`${BASE}/roles`, () => apiError(500, undefined, 'Boom')),
      mswHttp.get(`${BASE}/users`, () => paginated([manager])),
    )

    renderWithProviders(<Probe />)

    // Tải hỏng không phải là "vai trò không tồn tại" — hai chuyện khác nhau với người dùng.
    await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('loading'))
    expect(screen.getByTestId('state')).not.toHaveTextContent('no-role')
  })

  it('query key của vai trò và của user tách riêng nhau', () => {
    expect(roleKeys.all).toEqual(['roles'])
    expect(userKeys.list({ page: 1, size: 100, roleSlug: 'r-manager' })).toEqual([
      'users',
      'list',
      { page: 1, size: 100, roleSlug: 'r-manager' },
    ])
  })
})
