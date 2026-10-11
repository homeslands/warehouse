import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import type { MaterialType } from '@/entities/material-type'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { MaterialTypesPage } from './MaterialTypesPage'

const BASE = 'http://localhost:8085/api/v1'

const type: MaterialType = {
  slug: 'mt-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'MT-01',
  name: 'Tiêu hao',
}

describe('MaterialTypesPage', () => {
  it('gõ tên → gửi name; trống → câu báo theo tên (nhiều từ: không có nút tìm theo mã)', async () => {
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(`${BASE}/material-types`, ({ request }) => {
        const params = new URL(request.url).searchParams
        seen.push(params)
        return paginated(params.get('name') ? [] : [type])
      }),
    )
    const { user } = renderWithProviders(<MaterialTypesPage />, {
      auth: { userName: 'a', roleName: 'ADMIN', scope: ['MATERIAL_READ', 'MATERIAL_CREATE'] },
      route: '/material-types',
    })

    expect(
      await screen.findByRole('heading', { name: 'Loại vật tư', level: 1 }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Tiêu hao')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm loại vật tư' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Thao tác với/ })).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Tên hoặc mã loại…'), 'hoá chất')
    await waitFor(() => expect(seen.at(-1)?.get('name')).toBe('hoá chất'))
    expect(
      await screen.findByText('Không có loại vật tư nào có tên chứa “hoá chất”.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tìm theo mã' })).not.toBeInTheDocument()
  })
})
