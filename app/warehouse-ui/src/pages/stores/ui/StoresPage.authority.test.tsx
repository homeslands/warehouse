import { screen, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Chạy với cờ BẬT: backend đã gác cửa hàng (và kho) bằng @RequireAuthority. Phần cờ tắt nằm ở
// StoresPage.test.tsx.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    userSort: false,
    supplierSearch: false,
    search: false,
    profileEdit: false,
    sessionList: false,
    authorityGuards: true,
    storeAuthorityGuards: true,
  },
}))

import type { Store } from '@/entities/store'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { StoresPage } from '@/pages/stores'

const BASE = 'http://localhost:8085/api/v1'

const store = { slug: 'ch-a', name: 'Cửa hàng A', isActive: false } as unknown as Store

function renderAs(roleName: string, scope: string[]) {
  return renderWithProviders(<StoresPage />, {
    route: '/stores',
    auth: { userName: 't', roleName, scope },
  })
}

beforeEach(() => {
  server.use(mswHttp.get(`${BASE}/stores`, () => paginated([store])))
})

describe('StoresPage — gác theo authority (cờ bật)', () => {
  it('MANAGER có STORE_CREATE → thấy nút Tạo cửa hàng, không có cột Thao tác', async () => {
    renderAs('MANAGER', ['STORE_READ', 'STORE_CREATE'])
    await screen.findByText('Cửa hàng A')

    expect(screen.getByRole('button', { name: 'Tạo cửa hàng' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Thao tác với Cửa hàng A' }),
    ).not.toBeInTheDocument()
  })

  it('ADMIN chỉ có STORE_READ → không nút Tạo, không cột Thao tác', async () => {
    renderAs('ADMIN', ['STORE_READ'])
    await screen.findByText('Cửa hàng A')

    expect(screen.queryByRole('button', { name: 'Tạo cửa hàng' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Thao tác với Cửa hàng A' }),
    ).not.toBeInTheDocument()
  })

  async function openRowMenu(user: ReturnType<typeof renderAs>['user']) {
    await user.click(await screen.findByRole('button', { name: 'Thao tác với Cửa hàng A' }))
    return screen.findByRole('menu')
  }

  it('STORE_UPDATE + WAREHOUSE_UPDATE + WAREHOUSE_READ → có Gán kho', async () => {
    const { user } = renderAs('MANAGER', [
      'STORE_READ',
      'STORE_UPDATE',
      'WAREHOUSE_UPDATE',
      'WAREHOUSE_READ',
    ])
    const menu = await openRowMenu(user)

    expect(within(menu).getByRole('menuitem', { name: 'Gán kho' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Xoá' })).not.toBeInTheDocument()
  })

  it('chỉ STORE_UPDATE → có Sửa, KHÔNG có Gán kho (thiếu WAREHOUSE_UPDATE)', async () => {
    const { user } = renderAs('MANAGER', ['STORE_READ', 'STORE_UPDATE', 'WAREHOUSE_READ'])
    const menu = await openRowMenu(user)

    expect(within(menu).getByRole('menuitem', { name: 'Sửa' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Gán kho' })).not.toBeInTheDocument()
  })
})
