import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { confirmDialog } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { Unit } from '@/entities/unit'
import { UnitFormSheet } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const unit: Unit = {
  slug: 'u-kg',
  createdAt: '',
  updatedAt: '',
  code: 'KG',
  name: 'Kilogram',
  description: 'Khối lượng',
  materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
}

function renderSheet(target?: Unit) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(<UnitFormSheet open onOpenChange={onOpenChange} unit={target} />, {
      auth: 'admin',
    }),
  }
}

const codeField = () => screen.getByLabelText(/^Mã/)
const nameField = () => screen.getByLabelText(/^Tên/)
const descriptionField = () => screen.getByLabelText(/^Mô tả/)

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('UnitFormSheet', () => {
  it('tạo: xác nhận rồi POST body đã trim, đóng sheet', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/units`, async ({ request }) => {
        body = await request.json()
        return ok(unit)
      }),
    )
    const { user, onOpenChange } = renderSheet()

    await user.type(codeField(), 'm')
    await user.type(nameField(), 'Mét')
    await user.click(screen.getByRole('button', { name: 'Thêm đơn vị' }))
    await confirmDialog(user, 'Thêm')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ code: 'm', name: 'Mét' })
    expect(toast.success).toHaveBeenCalledWith('Đã thêm đơn vị')
  })

  it('tạo: 100906 (mã trùng) → lỗi tại ô Mã, không toast lỗi', async () => {
    server.use(mswHttp.post(`${BASE}/units`, () => apiError(409, 100906)))
    const { user } = renderSheet()

    await user.type(codeField(), 'KG')
    await user.type(nameField(), 'Kilogram')
    await user.click(screen.getByRole('button', { name: 'Thêm đơn vị' }))
    await confirmDialog(user, 'Thêm')

    expect(await screen.findByText('Mã đơn vị đã tồn tại')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sửa: xoá trống mô tả → PATCH { description: "" }', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/units/u-kg`, async ({ request }) => {
        body = await request.json()
        return ok({ ...unit, description: null })
      }),
    )
    const { user, onOpenChange } = renderSheet(unit)

    await user.clear(descriptionField())
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ description: '' })
  })

  it('sửa: chưa đổi gì → nút Lưu bị khoá', () => {
    renderSheet(unit)
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })
})
