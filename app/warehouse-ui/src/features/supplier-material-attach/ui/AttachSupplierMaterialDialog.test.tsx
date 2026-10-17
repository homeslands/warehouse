import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { materialKeys, type Material } from '@/entities/material'
import { supplierKeys } from '@/entities/supplier'
import { AttachSupplierMaterialDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const supplier = { slug: 's-1', code: 'NCC-HN-01' }

const base = {
  createdAt: '',
  updatedAt: '',
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 'mt-1', code: 'MT-01', name: 'Nguyên liệu' },
  baseUnit: null,
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [],
}
const kg = { slug: 'u-kg', code: 'KG', name: 'kg' }
const m1: Material = { ...base, slug: 'm-1', code: 'NL01', name: 'Đường', baseUnit: kg }
const m2: Material = { ...base, slug: 'm-2', code: 'NL04', name: 'Bột giặt', baseUnit: kg }
const m3: Material = { ...base, slug: 'm-3', code: 'NL05', name: 'Nhãn' }
// Một vật tư có thể thuộc nhiều nhà cung cấp: m1 đã gắn với CHÍNH NCC này (ẩn), m4 thuộc NCC khác (vẫn gắn được).
const m1Attached: Material = {
  ...m1,
  hasSupplier: true,
  suppliers: [{ slug: 's-1', code: 'NCC-HN-01', name: 'NCC Hà Nội' }],
  warehouses: [],
}
const m4: Material = {
  ...base,
  slug: 'm-4',
  code: 'NL06',
  name: 'Muối',
  hasSupplier: true,
  suppliers: [{ slug: 's-2', code: 'NCC-HCM', name: 'NCC Sài Gòn' }],
  warehouses: [],
}

let materialsUrl: URL | undefined
let attachedUrl: URL | undefined

function renderDialog(
  target: typeof supplier | null = supplier,
  queryClient?: ReturnType<typeof mutationToastQueryClient>,
) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <AttachSupplierMaterialDialog supplier={target} onOpenChange={onOpenChange} />,
      { auth: 'admin', queryClient },
    ),
  }
}

const check = (user: ReturnType<typeof renderDialog>['user'], name: RegExp) =>
  user.click(screen.getByRole('checkbox', { name }))

/** Danh sách ứng viên đã tải xong (hết khung chờ). */
const ready = () => screen.findByRole('checkbox', { name: /NL04/ })

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  materialsUrl = undefined
  attachedUrl = undefined
  server.use(
    mswHttp.get(`${BASE}/materials`, ({ request }) => {
      materialsUrl = new URL(request.url)
      return paginated([m1Attached, m2, m3, m4])
    }),
    mswHttp.get(`${BASE}/suppliers/s-1/materials`, ({ request }) => {
      attachedUrl = new URL(request.url)
      return paginated([m1])
    }),
  )
})

describe('AttachSupplierMaterialDialog', () => {
  it('liệt kê "Mã · Tên · Đơn vị" có ô tick, ẩn vật tư đã gắn với NCC này, giữ vật tư của NCC khác', async () => {
    renderDialog()
    await ready()
    const list = screen.getByRole('group', { name: 'Vật tư chưa gắn với nhà cung cấp này' })
    expect(within(list).getByRole('checkbox', { name: 'NL04 · Bột giặt · kg' })).toBeInTheDocument()
    expect(within(list).getByRole('checkbox', { name: 'NL05 · Nhãn' })).toBeInTheDocument()
    // Một vật tư có nhiều NCC: đang thuộc NCC khác vẫn gắn được.
    expect(within(list).getByRole('checkbox', { name: 'NL06 · Muối' })).toBeInTheDocument()
    expect(within(list).queryByText(/NL01/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gắn' })).toBeDisabled()
    expect(screen.getByText('Đã chọn 0')).toBeInTheDocument()
    expect(materialsUrl?.searchParams.get('size')).toBe('100')
    // Không lọc `hasSupplier` nữa; loại vật tư đã gắn dựa trên `suppliers` của chính response, không tải thêm.
    expect(materialsUrl?.searchParams.has('hasSupplier')).toBe(false)
    expect(attachedUrl).toBeUndefined()
  })

  it('ô tìm lọc không phân biệt dấu (theo mã hoặc tên); không khớp → "Không có kết quả"', async () => {
    const { user } = renderDialog()
    await ready()
    await user.type(screen.getByLabelText('Vật tư'), 'bot giat')
    expect(screen.getByRole('checkbox', { name: /NL04/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /NL05/ })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Vật tư'))
    await user.type(screen.getByLabelText('Vật tư'), 'zzz')
    expect(screen.getByText('Không có kết quả.')).toBeInTheDocument()
  })

  it('chọn nhiều + "Gắn (2)" → PUT một lần với cả 2 slug, đóng hộp, tải lại vật tư NCC và toàn kho', async () => {
    let putUrl = ''
    let body: unknown
    server.use(
      mswHttp.put(`${BASE}/suppliers/s-1/materials`, async ({ request }) => {
        putUrl = new URL(request.url).pathname
        body = await request.json()
        return ok([m2, m3])
      }),
    )
    const { user, queryClient, onOpenChange } = renderDialog()
    await ready()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await check(user, /NL04/)
    await check(user, /NL05/)
    expect(screen.getByText('Đã chọn 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gắn (2)' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(putUrl).toBe('/api/v1/suppliers/s-1/materials')
    expect(body).toEqual({ materialSlugs: ['m-2', 'm-3'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.materials('s-1') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: materialKeys.all })
  })

  it('"Chọn tất cả" chọn / bỏ chọn mọi vật tư đang hiện; chọn một phần → trạng thái nửa', async () => {
    const { user } = renderDialog()
    await ready()
    const all = screen.getByRole('checkbox', { name: 'Chọn tất cả (3)' })

    await check(user, /NL04/)
    expect(all).toHaveAttribute('data-state', 'indeterminate')
    await user.click(all)
    expect(screen.getByText('Đã chọn 3')).toBeInTheDocument()
    await user.click(all)
    expect(screen.getByText('Đã chọn 0')).toBeInTheDocument()
  })

  it('100701 khi chọn MỘT vật tư → câu của mã lỗi tại hộp, hộp vẫn mở, không toast', async () => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => apiError(404, 100701)))
    const { user, onOpenChange } = renderDialog(supplier, mutationToastQueryClient())
    await ready()
    await check(user, /NL04/)
    await user.click(screen.getByRole('button', { name: 'Gắn (1)' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('100701 khi chọn NHIỀU → nói rõ cả lô chưa gắn (BE không nói vật tư nào)', async () => {
    const text = 'Chưa gắn vật tư nào: ít nhất một vật tư đã chọn không còn tồn tại.'
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => apiError(404, 100701)))
    const { user, onOpenChange } = renderDialog(supplier, mutationToastQueryClient())
    await ready()
    await check(user, /NL04/)
    await check(user, /NL05/)
    await user.click(screen.getByRole('button', { name: 'Gắn (2)' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('đổi lựa chọn → xoá lỗi tại hộp', async () => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => apiError(404, 100701)))
    const { user } = renderDialog(supplier, mutationToastQueryClient())
    await ready()
    await check(user, /NL04/)
    await user.click(screen.getByRole('button', { name: 'Gắn (1)' }))
    await screen.findByRole('alert')

    await check(user, /NL04/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lỗi khác → toast và đóng hộp', async () => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => apiError(500)))
    const { user, onOpenChange } = renderDialog(supplier, mutationToastQueryClient())
    await ready()
    await check(user, /NL04/)
    await user.click(screen.getByRole('button', { name: 'Gắn (1)' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đang gửi thì không đóng được bằng Esc, và không còn nút ×', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.put(`${BASE}/suppliers/s-1/materials`, async () => {
        await gate
        return ok([m2])
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await ready()
    await check(user, /NL04/)
    await user.click(screen.getByRole('button', { name: 'Gắn (1)' }))
    await screen.findByRole('button', { name: 'Đang lưu...' })

    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()

    release()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('đang tải danh sách → ô tìm khoá, có khung chờ', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.get(`${BASE}/materials`, async () => {
        await gate
        return paginated([m1, m2, m3])
      }),
    )
    renderDialog()
    await screen.findByText('Gắn vật tư cho NCC-HN-01')
    expect(screen.getByLabelText('Vật tư')).toBeDisabled()
    expect(
      screen.getByRole('group', { name: 'Vật tư chưa gắn với nhà cung cấp này' }),
    ).toHaveAttribute('aria-busy', 'true')

    release()
    await waitFor(() => expect(screen.getByLabelText('Vật tư')).toBeEnabled())
  })

  it('tải danh sách vật tư lỗi → câu lỗi, không báo "hết vật tư", nút Gắn khoá', async () => {
    server.use(mswHttp.get(`${BASE}/materials`, () => apiError(500, 1, 'boom')))
    renderDialog()
    await screen.findByText('Gắn vật tư cho NCC-HN-01')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/\S/)
    expect(screen.getByLabelText('Vật tư')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Gắn' })).toBeDisabled()
    expect(screen.queryByText('Không còn vật tư nào để gắn')).not.toBeInTheDocument()
  })

  it('đóng thì KHÔNG tải danh sách', async () => {
    renderDialog(null)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(materialsUrl).toBeUndefined()
    expect(attachedUrl).toBeUndefined()
  })
})
