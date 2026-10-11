import { screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import type { MaterialConversionUnit } from '@/entities/material'
import { ConversionUnitDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const material = { slug: 'm-1', baseUnitCode: 'KG' }
const bag: MaterialConversionUnit = {
  unitSlug: 'u-bag',
  unitCode: 'BAG',
  unitName: 'Bao 50kg',
  conversionRate: 50,
  isBaseUnit: false,
}

let availableCalls = 0
beforeEach(() => {
  availableCalls = 0
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  server.use(
    mswHttp.get(`${BASE}/materials/m-1/conversion-units/available`, () => {
      availableCalls += 1
      return paginated([{ slug: 'u-bag', code: 'BAG', name: 'Bao 50kg' }])
    }),
  )
})

function renderDialog(editing: MaterialConversionUnit | null = null) {
  const onOpenChange = vi.fn()
  const view = renderWithProviders(
    <ConversionUnitDialog material={material} open editing={editing} onOpenChange={onOpenChange} />,
    { queryClient: mutationToastQueryClient() },
  )
  return { ...view, onOpenChange }
}

async function pickBag(user: UserEvent) {
  await user.click(screen.getByRole('combobox', { name: 'Đơn vị' }))
  await user.click(await screen.findByText('BAG · Bao 50kg'))
}

describe('ConversionUnitDialog', () => {
  it('gắn: chọn đơn vị + tỉ lệ, xem trước, POST đúng body', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/materials/m-1/conversion-units`, async ({ request }) => {
        body = await request.json()
        return ok(bag)
      }),
    )
    const { user, onOpenChange } = renderDialog()

    await pickBag(user)
    await user.type(screen.getByLabelText('Tỉ lệ'), '50')
    expect(screen.getByText('1 BAG = 50 KG')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ unitSlug: 'u-bag', conversionRate: 50 })
    expect(toast.success).toHaveBeenCalledWith('Đã thêm đơn vị quy đổi')
  })

  it('tỉ lệ quá 6 số lẻ → lỗi dưới ô, không gửi; ≥ 1e12 → câu "quá lớn"', async () => {
    const posted = vi.fn()
    server.use(
      mswHttp.post(`${BASE}/materials/m-1/conversion-units`, () => {
        posted()
        return ok(bag)
      }),
    )
    const { user } = renderDialog()

    await pickBag(user)
    await user.type(screen.getByLabelText('Tỉ lệ'), '0.1234567')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nhập số > 0, tối đa 6 chữ số thập phân',
    )

    await user.clear(screen.getByLabelText('Tỉ lệ'))
    await user.type(screen.getByLabelText('Tỉ lệ'), '1000000000000')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Số quá lớn')
    expect(posted).not.toHaveBeenCalled()
  })

  it('100716 → lỗi dưới ô đơn vị, hộp giữ mở, tải lại danh sách gắn được', async () => {
    server.use(mswHttp.post(`${BASE}/materials/m-1/conversion-units`, () => apiError(409, 100716)))
    const { user, onOpenChange } = renderDialog()

    await pickBag(user)
    await user.type(screen.getByLabelText('Tỉ lệ'), '50')
    expect(availableCalls).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đơn vị này đã là đơn vị quy đổi của vật tư',
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    await waitFor(() => expect(availableCalls).toBe(2))
  })

  it('sửa: đơn vị cố định, tỉ lệ điền sẵn; chưa đổi → khoá Lưu; đổi → PATCH', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/materials/m-1/conversion-units/u-bag`, async ({ request }) => {
        body = await request.json()
        return ok({ ...bag, conversionRate: 25 })
      }),
    )
    const { user, onOpenChange } = renderDialog(bag)

    expect(screen.getByRole('heading', { name: 'Sửa tỉ lệ quy đổi' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Đơn vị' })).not.toBeInTheDocument()
    expect(screen.getByText('BAG · Bao 50kg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()

    await user.clear(screen.getByLabelText('Tỉ lệ'))
    await user.type(screen.getByLabelText('Tỉ lệ'), '25')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ conversionRate: 25 })
  })

  it('đóng rồi mở lại: không còn lựa chọn / lỗi cũ', async () => {
    const { user, rerender } = renderDialog()
    await user.type(screen.getByLabelText('Tỉ lệ'), '5')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Vui lòng chọn đơn vị')

    const onOpenChange = vi.fn()
    rerender(
      <ConversionUnitDialog
        material={material}
        open={false}
        editing={null}
        onOpenChange={onOpenChange}
      />,
    )
    rerender(
      <ConversionUnitDialog material={material} open editing={null} onOpenChange={onOpenChange} />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Tỉ lệ')).toHaveValue('')
  })

  it('hết đơn vị gắn được → ô ghi rõ, nút Lưu khoá', async () => {
    server.use(mswHttp.get(`${BASE}/materials/m-1/conversion-units/available`, () => paginated([])))
    renderDialog()

    // Đợi danh sách tải xong (lần render đầu còn "Đang tải").
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Đơn vị' })).toHaveTextContent(
        'Không còn đơn vị nào để thêm',
      ),
    )
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('tải danh sách gắn được lỗi → báo lỗi + Thử lại (không báo nhầm là hết đơn vị)', async () => {
    let fail = true
    server.use(
      mswHttp.get(`${BASE}/materials/m-1/conversion-units/available`, () =>
        fail ? apiError(500) : paginated([{ slug: 'u-bag', code: 'BAG', name: 'Bao 50kg' }]),
      ),
    )
    const { user } = renderDialog()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Đơn vị' })).not.toHaveTextContent(
      'Không còn đơn vị nào để thêm',
    )
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    await pickBag(user)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sửa tỉ lệ: 100718 → lỗi dưới ô tỉ lệ; 100717 → toast rồi đóng', async () => {
    server.use(
      mswHttp.patch(`${BASE}/materials/m-1/conversion-units/u-bag`, () => apiError(422, 100718)),
    )
    const { user, onOpenChange } = renderDialog(bag)
    await user.clear(screen.getByLabelText('Tỉ lệ'))
    await user.type(screen.getByLabelText('Tỉ lệ'), '25')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tỉ lệ phải lớn hơn 0, tối đa 6 chữ số thập phân',
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    server.use(
      mswHttp.patch(`${BASE}/materials/m-1/conversion-units/u-bag`, () => apiError(404, 100717)),
    )
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toast.error).toHaveBeenCalled()
  })
})
