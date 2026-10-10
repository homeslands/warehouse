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

const m1: Material = { slug: 'm-1', code: 'NL01', name: 'Đường', baseUnitName: 'kg' }
const m2: Material = { slug: 'm-2', code: 'NL04', name: 'Bột giặt', baseUnitName: 'kg' }
const m3: Material = { slug: 'm-3', code: 'NL05', name: 'Nhãn' }

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
      return paginated([m1, m2, m3])
    }),
    mswHttp.get(`${BASE}/suppliers/s-1/materials`, ({ request }) => {
      attachedUrl = new URL(request.url)
      return paginated([m1])
    }),
  )
})

describe('AttachSupplierMaterialDialog', () => {
  it('liệt kê "Mã · Tên · Đơn vị" có ô tick, loại vật tư đã gắn; nút Gắn khoá khi chưa chọn', async () => {
    renderDialog()
    await ready()
    const list = screen.getByRole('group', { name: 'Vật tư chưa thuộc nhà cung cấp này' })
    expect(within(list).getByRole('checkbox', { name: 'NL04 · Bột giặt · kg' })).toBeInTheDocument()
    expect(within(list).getByRole('checkbox', { name: 'NL05 · Nhãn' })).toBeInTheDocument()
    expect(within(list).queryByText(/NL01/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gắn' })).toBeDisabled()
    expect(screen.getByText('Đã chọn 0')).toBeInTheDocument()
    expect(materialsUrl?.searchParams.get('size')).toBe('100')
    expect(attachedUrl?.searchParams.get('size')).toBe('100')
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
    const all = screen.getByRole('checkbox', { name: 'Chọn tất cả (2)' })

    await check(user, /NL04/)
    expect(all).toHaveAttribute('data-state', 'indeterminate')
    await user.click(all)
    expect(screen.getByText('Đã chọn 2')).toBeInTheDocument()
    await user.click(all)
    expect(screen.getByText('Đã chọn 0')).toBeInTheDocument()
  })

  it('101212 khi chọn MỘT vật tư → câu của mã lỗi tại hộp, hộp vẫn mở, không toast', async () => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => apiError(409, 101212)))
    const { user, onOpenChange } = renderDialog(supplier, mutationToastQueryClient())
    await ready()
    await check(user, /NL04/)
    await user.click(screen.getByRole('button', { name: 'Gắn (1)' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vật tư này đã thuộc nhà cung cấp khác',
    )
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it.each([
    [101212, 'Chưa gắn vật tư nào: ít nhất một vật tư đã chọn đã thuộc nhà cung cấp khác.'],
    [100701, 'Chưa gắn vật tư nào: ít nhất một vật tư đã chọn không còn tồn tại.'],
  ])('%s khi chọn NHIỀU → nói rõ cả lô chưa gắn (BE không nói vật tư nào)', async (code, text) => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => apiError(409, code)))
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
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => apiError(409, 101212)))
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
      screen.getByRole('group', { name: 'Vật tư chưa thuộc nhà cung cấp này' }),
    ).toHaveAttribute('aria-busy', 'true')

    release()
    await waitFor(() => expect(screen.getByLabelText('Vật tư')).toBeEnabled())
  })

  it.each([
    ['vật tư toàn kho', `${BASE}/materials`],
    ['vật tư đã gắn', `${BASE}/suppliers/s-1/materials`],
  ])('tải %s lỗi → câu lỗi, không báo "hết vật tư", nút Gắn khoá', async (_name, url) => {
    server.use(mswHttp.get(url, () => apiError(500, 1, 'boom')))
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
