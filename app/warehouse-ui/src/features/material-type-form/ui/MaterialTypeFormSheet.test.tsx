import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { MaterialType } from '@/entities/material-type'
import { MaterialTypeFormSheet } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const type: MaterialType = {
  slug: 'mt-1',
  createdAt: '',
  updatedAt: '',
  code: 'MT-01',
  name: 'Tiêu hao',
  description: null,
}

function renderSheet(target?: MaterialType) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <MaterialTypeFormSheet open onOpenChange={onOpenChange} materialType={target} />,
      { auth: 'admin' },
    ),
  }
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('MaterialTypeFormSheet', () => {
  it('tạo: xác nhận rồi POST', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/material-types`, async ({ request }) => {
        body = await request.json()
        return ok(type)
      }),
    )
    const { user, onOpenChange } = renderSheet()

    await user.type(screen.getByLabelText(/^Mã/), 'mt-02')
    await user.type(screen.getByLabelText(/^Tên/), 'Hoá chất')
    await user.click(screen.getByRole('button', { name: 'Thêm loại vật tư' }))
    await confirmDialog(user, 'Thêm')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ code: 'mt-02', name: 'Hoá chất' })
  })

  it('sửa: 100603 (tên trùng) → lỗi tại ô Tên', async () => {
    server.use(mswHttp.patch(`${BASE}/material-types/mt-1`, () => apiError(409, 100603)))
    const { user } = renderSheet(type)

    await user.clear(screen.getByLabelText(/^Tên/))
    await user.type(screen.getByLabelText(/^Tên/), 'Hoá chất')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Tên loại vật tư đã tồn tại')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
