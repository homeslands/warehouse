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

async function pickM2(user: ReturnType<typeof renderDialog>['user']) {
  await user.click(screen.getByRole('combobox', { name: 'Vật tư' }))
  await user.click(await screen.findByText('NL04 · Bột giặt · kg'))
}

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
  it('liệt kê vật tư dạng "Mã · Tên · Đơn vị", loại vật tư đã gắn', async () => {
    const { user } = renderDialog()
    await screen.findByText('Gắn vật tư cho NCC-HN-01')
    expect(screen.getByRole('button', { name: 'Gắn' })).toBeDisabled()

    await user.click(screen.getByRole('combobox', { name: 'Vật tư' }))
    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('NL04 · Bột giặt · kg')).toBeInTheDocument()
    expect(within(list).getByText('NL05 · Nhãn')).toBeInTheDocument()
    expect(within(list).queryByText(/NL01/)).not.toBeInTheDocument()
    expect(materialsUrl?.searchParams.get('page')).toBe('1')
    expect(materialsUrl?.searchParams.get('size')).toBe('100')
    expect(attachedUrl?.searchParams.get('page')).toBe('1')
    expect(attachedUrl?.searchParams.get('size')).toBe('100')
  })

  it('chọn + Gắn → PUT, đóng hộp, tải lại vật tư NCC và vật tư toàn kho', async () => {
    let putUrl = ''
    server.use(
      mswHttp.put(`${BASE}/suppliers/s-1/materials/m-2`, ({ request }) => {
        putUrl = new URL(request.url).pathname
        return ok(m2)
      }),
    )
    const { user, queryClient, onOpenChange } = renderDialog()
    await screen.findByText('Gắn vật tư cho NCC-HN-01')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await pickM2(user)
    await user.click(screen.getByRole('button', { name: 'Gắn' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(putUrl).toBe('/api/v1/suppliers/s-1/materials/m-2')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.materials('s-1') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: materialKeys.all })
  })

  it('101212 → role=alert dưới ô, hộp vẫn mở, không toast lỗi', async () => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials/m-2`, () => apiError(409, 101212)))
    const { user, onOpenChange } = renderDialog(supplier, mutationToastQueryClient())
    await screen.findByText('Gắn vật tư cho NCC-HN-01')

    await pickM2(user)
    await user.click(screen.getByRole('button', { name: 'Gắn' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vật tư này đã thuộc nhà cung cấp khác',
    )
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('lỗi khác → toast và đóng hộp', async () => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials/m-2`, () => apiError(500)))
    const { user, onOpenChange } = renderDialog(supplier, mutationToastQueryClient())
    await screen.findByText('Gắn vật tư cho NCC-HN-01')

    await pickM2(user)
    await user.click(screen.getByRole('button', { name: 'Gắn' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('đang gửi thì không đóng được bằng Esc, và không còn nút ×', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      mswHttp.put(`${BASE}/suppliers/s-1/materials/m-2`, async () => {
        await gate
        return ok(m2)
      }),
    )
    const { user, onOpenChange } = renderDialog()
    await screen.findByText('Gắn vật tư cho NCC-HN-01')

    await pickM2(user)
    await user.click(screen.getByRole('button', { name: 'Gắn' }))
    await screen.findByRole('button', { name: 'Đang lưu...' })

    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()

    release()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('đổi lựa chọn → xoá lỗi tại ô', async () => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials/m-2`, () => apiError(409, 101212)))
    const { user } = renderDialog(supplier, mutationToastQueryClient())
    await screen.findByText('Gắn vật tư cho NCC-HN-01')
    await pickM2(user)
    await user.click(screen.getByRole('button', { name: 'Gắn' }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('combobox', { name: 'Vật tư' }))
    await user.click(await screen.findByText('NL05 · Nhãn'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('đang tải danh sách → ô chọn bị khoá', async () => {
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

    expect(screen.getByRole('combobox', { name: 'Vật tư' })).toBeDisabled()

    release()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Vật tư' })).toBeEnabled())
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
    expect(screen.getByRole('combobox', { name: 'Vật tư' })).toBeDisabled()
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
