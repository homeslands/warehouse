import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import type { SupplierMaterial } from '@/entities/supplier'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { SupplierMaterials } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const supplier = { slug: 's-1', code: 'NCC-HN-01' }

const nl04: SupplierMaterial = {
  slug: 'm-1',
  createdAt: '2026-09-01T03:00:00.000Z',
  updatedAt: '',
  code: 'NL04',
  name: 'Bột giặt',
  typeName: 'Hoá chất',
  baseUnitName: 'kg',
}
const nl05: SupplierMaterial = { ...nl04, slug: 'm-2', code: 'NL05', name: 'Nhãn dán' }

function mockMaterials(items: SupplierMaterial[], total = items.length) {
  const urls: URL[] = []
  server.use(
    mswHttp.get(`${BASE}/suppliers/s-1/materials`, ({ request }) => {
      const url = new URL(request.url)
      urls.push(url)
      return paginated(items, { page: Number(url.searchParams.get('page')), total })
    }),
    mswHttp.get(`${BASE}/materials`, () => paginated([])),
  )
  return urls
}

describe('SupplierMaterials', () => {
  it('hiện bảng Mã/Tên/Loại vật tư/Đơn vị cơ sở/Ngày tạo, gọi page=1&size=10', async () => {
    const urls = mockMaterials([nl04, nl05])
    renderWithProviders(
      <SupplierMaterials supplier={supplier} canManage={false} canFilter={false} />,
      {
        auth: 'admin',
      },
    )

    expect(await screen.findByText('Bột giặt')).toBeInTheDocument()
    expect(urls[0].searchParams.get('page')).toBe('1')
    expect(urls[0].searchParams.get('size')).toBe('10')
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Mã',
      'Tên',
      'Loại vật tư',
      'Đơn vị cơ sở',
      'Ngày tạo',
    ])
  })

  it('canManage=false → không nút Gắn vật tư, không cột thao tác', async () => {
    mockMaterials([nl04])
    renderWithProviders(
      <SupplierMaterials supplier={supplier} canManage={false} canFilter={false} />,
      {
        auth: 'admin',
      },
    )
    await screen.findByText('Bột giặt')

    expect(screen.queryByRole('button', { name: 'Gắn vật tư' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Thao tác với / })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
  })

  it('canManage=true → nút Gắn mở hộp gắn; menu ⋯ "Gỡ khỏi nhà cung cấp" mở hộp gỡ một vật tư', async () => {
    mockMaterials([nl04])
    const user = userEvent.setup()
    renderWithProviders(<SupplierMaterials supplier={supplier} canManage canFilter={false} />, {
      auth: 'admin',
    })
    await screen.findByText('Bột giặt')

    await user.click(screen.getByRole('button', { name: 'Gắn vật tư' }))
    expect(
      await screen.findByRole('dialog', { name: 'Gắn vật tư cho NCC-HN-01' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Thao tác với NL04' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Gỡ khỏi nhà cung cấp' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Gỡ vật tư?' })
    expect(within(dialog).getByText('NL04')).toBeInTheDocument()
  })

  it('rỗng → "Nhà cung cấp chưa có vật tư nào."', async () => {
    mockMaterials([])
    renderWithProviders(<SupplierMaterials supplier={supplier} canManage canFilter={false} />, {
      auth: 'admin',
    })
    expect(await screen.findByText('Nhà cung cấp chưa có vật tư nào.')).toBeInTheDocument()
  })

  it('gỡ dòng cuối của trang cuối → kéo page về trang cuối còn lại', async () => {
    const pages: number[] = []
    server.use(
      mswHttp.get(`${BASE}/suppliers/s-1/materials`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        pages.push(page)
        if (page === 1) return paginated([nl04], { page: 1, total: 11 })
        return paginated([], { page, total: 10 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(
      <SupplierMaterials supplier={supplier} canManage={false} canFilter={false} />,
      {
        auth: 'admin',
      },
    )
    await screen.findByText('Bột giặt')

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => expect(pages).toEqual([1, 2, 1]))
    expect(await screen.findByText('Bột giặt')).toBeInTheDocument()
  })

  it('canFilter=false → không ô tìm, không lọc ngày, request chỉ page & size', async () => {
    const urls = mockMaterials([nl04])
    renderWithProviders(
      <SupplierMaterials supplier={supplier} canManage={false} canFilter={false} />,
      {
        auth: 'admin',
      },
    )
    await screen.findByText('Bột giặt')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ngày tạo vật tư/ })).not.toBeInTheDocument()
    expect(urls[0].search).toBe('?page=1&size=10')
  })
})

describe('SupplierMaterials — lọc (canFilter)', () => {
  it.each([
    ['nl04', 'code', 'NL04'],
    ['Bột giặt', 'name', 'Bột giặt'],
  ])('gõ "%s" → gửi %s=%s, về trang 1', async (typed, key, value) => {
    const urls = mockMaterials([nl04, nl05], 25)
    const { user } = renderWithProviders(
      <SupplierMaterials supplier={supplier} canManage={false} canFilter />,
      { auth: 'admin' },
    )
    await screen.findByText('Bột giặt')
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('page')).toBe('2'))

    await user.type(screen.getByRole('searchbox'), typed)

    await waitFor(() => expect(urls.at(-1)?.searchParams.get(key)).toBe(value))
    expect(urls.at(-1)?.searchParams.get('page')).toBe('1')
    expect(urls.at(-1)?.searchParams.has(key === 'code' ? 'name' : 'code')).toBe(false)
  })

  it('trống khi tìm theo mã → câu nêu mã; theo tên → câu nêu tên', async () => {
    mockMaterials([])
    const { user } = renderWithProviders(
      <SupplierMaterials supplier={supplier} canManage={false} canFilter />,
      { auth: 'admin' },
    )
    await screen.findByText('Nhà cung cấp chưa có vật tư nào.')

    await user.type(screen.getByRole('searchbox'), 'nl99')
    expect(
      await screen.findByText('Không có vật tư nào mang mã “NL99” (mã phải nhập đủ).'),
    ).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'xi măng')
    expect(
      await screen.findByText('Không có vật tư nào có tên chứa “xi măng”.'),
    ).toBeInTheDocument()
  })

  it('nút Gắn vật tư vẫn ở thanh công cụ cạnh ô tìm', async () => {
    mockMaterials([nl04])
    renderWithProviders(<SupplierMaterials supplier={supplier} canManage canFilter />, {
      auth: 'admin',
    })
    await screen.findByText('Bột giặt')
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gắn vật tư' })).toBeInTheDocument()
  })
})

describe('SupplierMaterials — chọn nhiều để gỡ', () => {
  it('tick 2 dòng → nút "Gỡ (2)" mở hộp liệt kê cả 2; chưa tick thì không có nút', async () => {
    mockMaterials([nl04, nl05])
    const user = userEvent.setup()
    renderWithProviders(<SupplierMaterials supplier={supplier} canManage canFilter={false} />, {
      auth: 'admin',
    })
    await screen.findByText('Bột giặt')
    expect(screen.queryByRole('button', { name: /^Gỡ \(/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Chọn NL04' }))
    await user.click(screen.getByRole('checkbox', { name: 'Chọn NL05' }))
    await user.click(screen.getByRole('button', { name: 'Gỡ (2)' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Gỡ 2 vật tư?' })
    expect(dialog).toHaveTextContent('NL04 · Bột giặt')
    expect(dialog).toHaveTextContent('NL05 · Nhãn dán')
  })

  it('ô tick ở tiêu đề chọn / bỏ chọn cả trang; chọn một phần → trạng thái nửa', async () => {
    mockMaterials([nl04, nl05])
    const user = userEvent.setup()
    renderWithProviders(<SupplierMaterials supplier={supplier} canManage canFilter={false} />, {
      auth: 'admin',
    })
    await screen.findByText('Bột giặt')
    const all = screen.getByRole('checkbox', { name: 'Chọn tất cả vật tư trên trang' })

    await user.click(screen.getByRole('checkbox', { name: 'Chọn NL04' }))
    expect(all).toHaveAttribute('data-state', 'indeterminate')
    await user.click(all)
    expect(screen.getByRole('button', { name: 'Gỡ (2)' })).toBeInTheDocument()
    await user.click(all)
    expect(screen.queryByRole('button', { name: /^Gỡ \(/ })).not.toBeInTheDocument()
  })

  it('bàn phím: tick bằng Space giữ nguyên focus trên ô tick (ô không bị dựng lại), tick tiếp được', async () => {
    mockMaterials([nl04, nl05])
    const user = userEvent.setup()
    renderWithProviders(<SupplierMaterials supplier={supplier} canManage canFilter={false} />, {
      auth: 'admin',
    })
    await screen.findByText('Bột giặt')
    const box = screen.getByRole('checkbox', { name: 'Chọn NL04' })
    box.focus()
    await user.keyboard(' ')

    expect(box).toHaveAttribute('data-state', 'checked')
    expect(box).toHaveFocus()
    expect(box).toBeInTheDocument()
  })

  it('đổi trang → bỏ chọn (không gỡ nhầm dòng đã khuất)', async () => {
    mockMaterials([nl04, nl05], 25)
    const user = userEvent.setup()
    renderWithProviders(<SupplierMaterials supplier={supplier} canManage canFilter={false} />, {
      auth: 'admin',
    })
    await screen.findByText('Bột giặt')
    await user.click(screen.getByRole('checkbox', { name: 'Chọn NL04' }))
    expect(screen.getByRole('button', { name: 'Gỡ (1)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Gỡ \(/ })).not.toBeInTheDocument(),
    )
  })
})
