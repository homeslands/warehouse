import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MaterialType } from '@/entities/material-type'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { mockMobileViewport } from '@/shared/test/viewport'
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

describe('MaterialTypesPage — sắp xếp theo cột', () => {
  it('bấm tiêu đề Mã: tăng dần → giảm dần → bỏ sắp xếp (không gửi sort/sortBy)', async () => {
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(`${BASE}/material-types`, ({ request }) => {
        seen.push(new URL(request.url).searchParams)
        return paginated([type])
      }),
    )
    const { user } = renderWithProviders(<MaterialTypesPage />, {
      auth: { userName: 'a', roleName: 'ADMIN', scope: ['MATERIAL_READ'] },
      route: '/material-types',
    })
    await screen.findByText('Tiêu hao')
    expect(seen.at(-1)?.has('sortBy')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Mã' }))
    await waitFor(() => {
      expect(seen.at(-1)?.get('sortBy')).toBe('code')
      expect(seen.at(-1)?.get('sort')).toBe('ASC')
    })

    await user.click(screen.getByRole('button', { name: 'Mã' }))
    await waitFor(() => expect(seen.at(-1)?.get('sort')).toBe('DESC'))

    await user.click(screen.getByRole('button', { name: 'Mã' }))
    await waitFor(() => expect(seen.at(-1)?.has('sortBy')).toBe(false))
    expect(seen.at(-1)?.has('sort')).toBe(false)
  })

  it('cột Mô tả không sắp xếp được', async () => {
    server.use(mswHttp.get(`${BASE}/material-types`, () => paginated([type])))
    renderWithProviders(<MaterialTypesPage />, {
      auth: { userName: 'a', roleName: 'ADMIN', scope: ['MATERIAL_READ'] },
      route: '/material-types',
    })
    await screen.findByText('Tiêu hao')
    expect(screen.queryByRole('button', { name: 'Mô tả' })).not.toBeInTheDocument()
  })
})

describe('MaterialTypesPage — lọc ngày tạo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('URL startDate/endDate → gửi đúng; ngược chiều → đảo lại; Xoá bộ lọc → hết tham số', async () => {
    // Màn hẹp: nút "Xoá bộ lọc" nằm ngoài popover.
    mockMobileViewport()
    const seen: URLSearchParams[] = []
    server.use(
      mswHttp.get(`${BASE}/material-types`, ({ request }) => {
        seen.push(new URL(request.url).searchParams)
        return paginated([type])
      }),
    )
    const { user } = renderWithProviders(<MaterialTypesPage />, {
      auth: { userName: 'a', roleName: 'ADMIN', scope: ['MATERIAL_READ'] },
      route: '/material-types?startDate=2026-10-15&endDate=2026-10-01',
    })
    await screen.findByText('Tiêu hao')
    expect(seen.at(-1)?.get('startDate')).toBe('2026-10-01')
    expect(seen.at(-1)?.get('endDate')).toBe('2026-10-15')

    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }))
    await waitFor(() => {
      expect(seen.at(-1)?.has('startDate')).toBe(false)
      expect(seen.at(-1)?.has('endDate')).toBe(false)
    })
  })
})
