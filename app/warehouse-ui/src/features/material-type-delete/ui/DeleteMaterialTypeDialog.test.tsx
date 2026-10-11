import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { materialKeys } from '@/entities/material'
import type { MaterialType } from '@/entities/material-type'
import { DeleteMaterialTypeDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const type: MaterialType = {
  slug: 'mt-1',
  createdAt: '',
  updatedAt: '',
  code: 'MT-01',
  name: 'Tiêu hao',
}

describe('DeleteMaterialTypeDialog', () => {
  it('100609 → hộp giữ mở, báo trong hộp, không toast lỗi', async () => {
    server.use(mswHttp.delete(`${BASE}/material-types/mt-1`, () => apiError(422, 100609)))
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <DeleteMaterialTypeDialog materialType={type} onOpenChange={onOpenChange} />,
      { queryClient: mutationToastQueryClient() },
    )

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Loại vật tư còn vật tư thuộc loại — chuyển hoặc xoá các vật tư đó trước',
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('xoá xong → đóng, làm mới phía vật tư', async () => {
    server.use(mswHttp.delete(`${BASE}/material-types/mt-1`, () => ok('mt-1')))
    const onOpenChange = vi.fn()
    const queryClient = mutationToastQueryClient()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { user } = renderWithProviders(
      <DeleteMaterialTypeDialog materialType={type} onOpenChange={onOpenChange} />,
      { queryClient },
    )

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(spy).toHaveBeenCalledWith({ queryKey: materialKeys.all })
  })

  it('đóng rồi mở lại đúng loại đó → lỗi cũ không còn', async () => {
    server.use(mswHttp.delete(`${BASE}/material-types/mt-1`, () => apiError(422, 100609)))
    const onOpenChange = vi.fn()
    const view = renderWithProviders(
      <DeleteMaterialTypeDialog materialType={type} onOpenChange={onOpenChange} />,
      { queryClient: mutationToastQueryClient() },
    )
    await view.user.click(screen.getByRole('button', { name: 'Xoá' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    view.rerender(<DeleteMaterialTypeDialog materialType={null} onOpenChange={onOpenChange} />)
    view.rerender(<DeleteMaterialTypeDialog materialType={type} onOpenChange={onOpenChange} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
