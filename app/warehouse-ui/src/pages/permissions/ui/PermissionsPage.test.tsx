import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { PermissionsPage } from '@/pages/permissions'

const BASE = 'http://localhost:8085/api/v1'

const ADMIN_USER = { userName: 'a', roleName: 'ADMIN', scope: ['MANAGE_PERMISSIONS'] }

beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/roles`, () =>
      ok([{ slug: 'admin', name: 'ADMIN', authorityCodes: ['MANAGE_PERMISSIONS'] }]),
    ),
    mswHttp.get(`${BASE}/authorities`, () =>
      ok([
        {
          slug: 'a1',
          code: 'MANAGE_PERMISSIONS',
          name: 'Quản trị phân quyền',
          authorityGroup: { slug: 'g', name: 'System' },
        },
      ]),
    ),
  )
})

describe('PermissionsPage', () => {
  it('dựng bảng từ hai query', async () => {
    renderWithProviders(<PermissionsPage />, { route: '/permissions', auth: ADMIN_USER as never })

    expect(await screen.findByText('Quản trị phân quyền')).toBeInTheDocument()
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument()
  })

  it('một trong hai query lỗi → báo lỗi tại chỗ, không vỡ màn', async () => {
    server.use(mswHttp.get(`${BASE}/authorities`, () => new Response(null, { status: 500 })))
    renderWithProviders(<PermissionsPage />, { route: '/permissions', auth: ADMIN_USER as never })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('PermissionsPage — cảnh báo lệch danh mục mã quyền (chỉ khi dev)', () => {
  it('backend có mã FE chưa khai → console.warn nêu tên mã', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server.use(
      mswHttp.get(`${BASE}/authorities`, () =>
        ok([
          {
            slug: 'a1',
            code: 'MANAGE_PERMISSIONS',
            name: 'Quản trị phân quyền',
            authorityGroup: { slug: 'g', name: 'System' },
          },
          {
            slug: 'a2',
            code: 'BRAND_NEW_CODE',
            name: 'Mã mới',
            authorityGroup: { slug: 'g', name: 'System' },
          },
        ]),
      ),
    )
    renderWithProviders(<PermissionsPage />, { route: '/permissions', auth: ADMIN_USER as never })

    await screen.findByText('Mã mới')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('BRAND_NEW_CODE'))
    warn.mockRestore()
  })
})
