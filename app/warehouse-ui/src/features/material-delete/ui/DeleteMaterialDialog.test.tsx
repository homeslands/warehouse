import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { materialKeys, type Material } from '@/entities/material'
import { DeleteMaterialDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const material: Material = {
  slug: 'm-1',
  createdAt: '',
  updatedAt: '',
  code: 'VT-01',
  name: 'Xi măng',
  minimumInventory: 0,
  maximumInventory: 0,
  typeSlug: 'mt-1',
  typeCode: 'MT-01',
  typeName: 'Vật liệu',
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

function setup() {
  const onOpenChange = vi.fn()
  const onDeleted = vi.fn()
  const view = renderWithProviders(
    <DeleteMaterialDialog material={material} onOpenChange={onOpenChange} onDeleted={onDeleted} />,
    { queryClient: mutationToastQueryClient() },
  )
  const rerender = (next: Material | null) =>
    view.rerender(
      <DeleteMaterialDialog material={next} onOpenChange={onOpenChange} onDeleted={onDeleted} />,
    )
  return { ...view, onOpenChange, onDeleted, rerender }
}

describe('DeleteMaterialDialog', () => {
  it('xác nhận → DELETE, onDeleted, đóng', async () => {
    server.use(mswHttp.delete(`${BASE}/materials/m-1`, () => ok('m-1')))
    const { user, onDeleted, onOpenChange } = setup()

    expect(screen.getByRole('alertdialog')).toHaveTextContent('VT-01 · Xi măng')
    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toast.success).toHaveBeenCalledWith('Đã xoá vật tư')
  })

  it('100712 → giữ mở, báo trong hộp', async () => {
    server.use(mswHttp.delete(`${BASE}/materials/m-1`, () => apiError(422, 100712)))
    const { user, onDeleted } = setup()

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vật tư còn được gán vào kho — gỡ khỏi các kho trước khi xoá',
    )
    expect(onDeleted).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('đóng rồi mở lại đúng vật tư đó → lỗi cũ không còn', async () => {
    server.use(mswHttp.delete(`${BASE}/materials/m-1`, () => apiError(422, 100712)))
    const { user, rerender } = setup()
    await user.click(screen.getByRole('button', { name: 'Xoá' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    rerender(null)
    rerender(material)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('xoá từ màn danh sách (không có onDeleted) → gỡ cache chi tiết + quy đổi của vật tư đó', async () => {
    server.use(mswHttp.delete(`${BASE}/materials/m-1`, () => ok('m-1')))
    const onOpenChange = vi.fn()
    const queryClient = mutationToastQueryClient()
    const spy = vi.spyOn(queryClient, 'removeQueries')
    const { user } = renderWithProviders(
      <DeleteMaterialDialog material={material} onOpenChange={onOpenChange} />,
      { queryClient },
    )

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(spy).toHaveBeenCalledWith({ queryKey: materialKeys.detail('m-1') })
    expect(spy).toHaveBeenCalledWith({ queryKey: materialKeys.conversions('m-1') })
  })
})
