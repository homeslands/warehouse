import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Material } from '@/entities/material'
import type { MaterialType } from '@/entities/material-type'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithRouter, type TestAuth } from '@/shared/test/render'
import { chooseOption } from '@/shared/test/select'
import { mockMobileViewport } from '@/shared/test/viewport'
import { MaterialsPage } from './MaterialsPage'

const BASE = 'http://localhost:8085/api/v1'

const type: MaterialType = {
  slug: 'mt-1',
  createdAt: '',
  updatedAt: '',
  code: 'MT-01',
  name: 'Vật liệu',
}
const material: Material = {
  slug: 'm-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'VT-01',
  name: 'Xi măng',
  minimumInventory: 10,
  maximumInventory: 100.5,
  type: { slug: 'mt-1', code: 'MT-01', name: 'Vật liệu' },
  baseUnit: null,
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [],
}

const ADMIN: TestAuth = {
  userName: 'a',
  roleName: 'ADMIN',
  scope: ['MATERIAL_READ', 'MATERIAL_CREATE', 'MATERIAL_UPDATE', 'MATERIAL_DELETE', 'UNIT_READ'],
}

function capture() {
  const seen: URLSearchParams[] = []
  server.use(
    mswHttp.get(`${BASE}/materials`, ({ request }) => {
      const params = new URL(request.url).searchParams
      seen.push(params)
      return paginated(params.has('code') ? [] : [material])
    }),
    mswHttp.get(`${BASE}/material-types`, () => paginated([type])),
  )
  return seen
}

function renderPage(auth: TestAuth = ADMIN, route = '/materials') {
  return renderWithRouter(
    [
      { path: '/materials', element: <MaterialsPage /> },
      { path: '/materials/:slug', element: <p>CHI TIẾT VẬT TƯ</p> },
    ],
    { route, auth },
  )
}

describe('MaterialsPage', () => {
  it('bảng: tên là link, đơn vị gốc trống → "Chưa có", số giữ số lẻ', async () => {
    capture()
    renderPage()

    expect(await screen.findByRole('link', { name: 'Xi măng' })).toHaveAttribute(
      'href',
      '/materials/m-1',
    )
    expect(screen.getByText('Chưa có')).toBeInTheDocument()
    expect(screen.getByText('100,5')).toBeInTheDocument()
  })

  it('lọc Loại vật tư → gửi typeSlug; gõ tên → gửi name, giữ typeSlug', async () => {
    const seen = capture()
    const { user } = renderPage()
    await screen.findByText('Xi măng')

    await chooseOption(user, 'Loại vật tư', 'MT-01 · Vật liệu')
    await waitFor(() => expect(seen.at(-1)?.get('typeSlug')).toBe('mt-1'))

    await user.type(screen.getByPlaceholderText('Tên hoặc mã vật tư…'), 'xi')
    await waitFor(() => expect(seen.at(-1)?.get('name')).toBe('xi'))
    expect(seen.at(-1)?.get('typeSlug')).toBe('mt-1')
  })

  it('gõ mã → trống → đổi sang tìm theo tên', async () => {
    const seen = capture()
    const { user } = renderPage()
    await screen.findByText('Xi măng')

    await user.type(screen.getByPlaceholderText('Tên hoặc mã vật tư…'), 'VT-09')
    await waitFor(() => expect(seen.at(-1)?.get('code')).toBe('VT-09'))
    await user.click(await screen.findByRole('button', { name: 'Tìm theo tên' }))
    // BE không nhận '-' trong name (100731) → gạch thành khoảng trắng khi đổi sang tìm theo tên.
    await waitFor(() => expect(seen.at(-1)?.get('name')).toBe('VT 09'))
  })

  it('ô tìm chỉ toàn ký tự BE không nhận (@@@) → không gọi GET /materials, hiện trạng thái không có kết quả (không liệt kê cả danh mục)', async () => {
    const seen = capture()
    renderPage(ADMIN, '/materials?search=%40%40%40')

    expect(await screen.findByText('Không có kết quả.')).toBeInTheDocument()
    expect(screen.queryByText('Xi măng')).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 100))
    expect(seen).toHaveLength(0)
  })

  it('bấm hàng → mở chi tiết', async () => {
    capture()
    const { user, router } = renderPage()

    await user.click(await screen.findByText('Vật liệu', { selector: 'td span' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/materials/m-1'))
  })

  it('thiếu UNIT_READ: không nút Thêm', async () => {
    capture()
    renderPage({ userName: 'a', roleName: 'ADMIN', scope: ['MATERIAL_READ', 'MATERIAL_CREATE'] })

    await screen.findByText('Xi măng')
    expect(screen.queryByRole('button', { name: 'Thêm vật tư' })).not.toBeInTheDocument()
  })

  it('đang lọc Loại + gõ mã → trống vẫn nói rõ tìm theo mã trong loại, có nút đổi sang tìm theo tên', async () => {
    const seen = capture()
    const { user } = renderPage()
    await screen.findByText('Xi măng')

    await chooseOption(user, 'Loại vật tư', 'MT-01 · Vật liệu')
    await user.type(screen.getByPlaceholderText('Tên hoặc mã vật tư…'), 'PVC')
    await waitFor(() => expect(seen.at(-1)?.get('code')).toBe('PVC'))

    expect(
      await screen.findByText(/Không có vật tư nào mang mã “PVC” trong loại đang lọc/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tìm theo tên' }))
    await waitFor(() => expect(seen.at(-1)?.get('name')).toBe('PVC'))
    expect(seen.at(-1)?.get('typeSlug')).toBe('mt-1')
  })
})

describe('MaterialsPage — sắp xếp theo cột', () => {
  it('bấm tiêu đề Mã: tăng dần → giảm dần → bỏ sắp xếp (không gửi sort/sortBy)', async () => {
    const seen = capture()
    const { user } = renderPage()
    await screen.findByText('Xi măng')
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

  it('cột Loại vật tư không sắp xếp được', async () => {
    capture()
    renderPage()
    await screen.findByText('Xi măng')
    expect(screen.queryByRole('button', { name: 'Loại vật tư' })).not.toBeInTheDocument()
  })
})

describe('MaterialsPage — lọc ngày tạo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('URL startDate/endDate → gửi đúng; ngược chiều → đảo lại; Xoá bộ lọc → hết tham số', async () => {
    // Màn hẹp: nút "Xoá bộ lọc" nằm ngoài popover.
    mockMobileViewport()
    const seen = capture()
    const { user } = renderPage(ADMIN, '/materials?startDate=2026-10-15&endDate=2026-10-01')
    await screen.findByText('Xi măng')
    expect(seen.at(-1)?.get('startDate')).toBe('2026-10-01')
    expect(seen.at(-1)?.get('endDate')).toBe('2026-10-15')

    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }))
    await waitFor(() => {
      expect(seen.at(-1)?.has('startDate')).toBe(false)
      expect(seen.at(-1)?.has('endDate')).toBe(false)
    })
  })
})
