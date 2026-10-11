import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import { materialKeys } from '@/entities/material'
import { unitKeys, type Unit } from '@/entities/unit'
import { DeleteUnitDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const unit: Unit = {
  slug: 'u-kg',
  createdAt: '',
  updatedAt: '',
  code: 'KG',
  name: 'Kilogram',
  materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

function setup() {
  const onOpenChange = vi.fn()
  const queryClient = mutationToastQueryClient()
  const view = renderWithProviders(<DeleteUnitDialog unit={unit} onOpenChange={onOpenChange} />, {
    queryClient,
  })
  const rerender = (next: Unit | null) =>
    view.rerender(<DeleteUnitDialog unit={next} onOpenChange={onOpenChange} />)
  return { ...view, onOpenChange, queryClient, rerender }
}

describe('DeleteUnitDialog', () => {
  it('xác nhận → DELETE, đóng, toast thành công', async () => {
    server.use(mswHttp.delete(`${BASE}/units/u-kg`, () => ok('u-kg')))
    const { user, onOpenChange } = setup()

    expect(screen.getByRole('alertdialog')).toHaveTextContent('KG · Kilogram')
    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toast.success).toHaveBeenCalledWith('Đã xoá đơn vị')
  })

  it('100909 → hộp giữ mở, báo trong hộp, không toast lỗi', async () => {
    server.use(mswHttp.delete(`${BASE}/units/u-kg`, () => apiError(422, 100909)))
    const { user, onOpenChange } = setup()

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đơn vị còn được vật tư dùng — đổi đơn vị gốc hoặc gỡ đơn vị quy đổi ở các vật tư đó trước',
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('xoá xong → làm mới cả phía vật tư (danh sách "đơn vị gắn được" nằm dưới materialKeys)', async () => {
    server.use(mswHttp.delete(`${BASE}/units/u-kg`, () => ok('u-kg')))
    const { user, queryClient, onOpenChange } = setup()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(spy).toHaveBeenCalledWith({ queryKey: materialKeys.all })
  })

  it('đóng rồi mở lại đúng đơn vị đó → lỗi cũ không còn', async () => {
    server.use(mswHttp.delete(`${BASE}/units/u-kg`, () => apiError(422, 100909)))
    const { user, rerender } = setup()
    await user.click(screen.getByRole('button', { name: 'Xoá' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    rerender(null)
    rerender(unit)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('100909 → tải lại danh sách đơn vị để số "Đang dùng" và mục Xoá đúng', async () => {
    server.use(mswHttp.delete(`${BASE}/units/u-kg`, () => apiError(422, 100909)))
    const { user, queryClient } = setup()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'Xoá' }))

    await screen.findByRole('alert')
    expect(spy).toHaveBeenCalledWith({ queryKey: unitKeys.all })
  })
})
