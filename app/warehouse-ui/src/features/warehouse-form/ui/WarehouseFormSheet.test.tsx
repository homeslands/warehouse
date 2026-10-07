import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { confirmDialog } from '@/shared/test/confirm'
import { renderWithProviders } from '@/shared/test/render'
import type { Warehouse } from '@/entities/warehouse'
import { WarehouseFormSheet } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const warehouse: Warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  phonenumber: '02412345678',
  description: 'kho chính',
  isActive: true,
}

function renderSheet(target?: Warehouse) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <WarehouseFormSheet open onOpenChange={onOpenChange} warehouse={target} />,
      { auth: 'admin' },
    ),
  }
}

/** Điền đủ ba ô bắt buộc của form tạo mới. */
async function fillRequired(user: ReturnType<typeof renderSheet>['user']) {
  await user.type(screen.getByLabelText(/^Mã/), 'WH-HN-02')
  await user.type(screen.getByLabelText(/^Tên/), 'Kho Hà Nội 2')
  await user.type(screen.getByLabelText(/^Địa chỉ/), 'Số 2, Ba Đình, Hà Nội')
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

describe('WarehouseFormSheet — tạo mới', () => {
  it('tiêu đề "Tạo kho", ô bắt buộc có aria-required, công tắc bật sẵn', () => {
    renderSheet()

    expect(screen.getByRole('heading', { name: 'Tạo kho' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Mã/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(/^Tên/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(/^Địa chỉ/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('switch', { name: 'Đang hoạt động' })).toBeChecked()
  })

  it('bấm Lưu khi bỏ trống ô bắt buộc → báo lỗi tại từng ô, không gọi API', async () => {
    let called = false
    server.use(
      mswHttp.post(`${BASE}/warehouses`, () => {
        called = true
        return ok(warehouse)
      }),
    )
    const { user } = renderSheet()

    await user.click(screen.getByRole('button', { name: 'Tạo kho' }))

    expect(await screen.findByText('Vui lòng nhập mã kho')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập tên kho')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập địa chỉ kho')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('mã sai định dạng (khoảng trắng) → lỗi tại ô Mã', async () => {
    const { user } = renderSheet()

    await user.type(screen.getByLabelText(/^Mã/), 'WH HN 01')
    await user.type(screen.getByLabelText(/^Tên/), 'Kho')
    await user.type(screen.getByLabelText(/^Địa chỉ/), 'Hà Nội')
    await user.click(screen.getByRole('button', { name: 'Tạo kho' }))

    expect(await screen.findByText('Mã kho không đúng định dạng')).toBeInTheDocument()
  })

  it('gửi đúng body; ô tuỳ chọn có format (điện thoại) để trống thì KHÔNG gửi', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/warehouses`, async ({ request }) => {
        body = await request.json()
        return ok(warehouse)
      }),
    )
    const { user, onOpenChange } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo kho' }))
    await confirmDialog(user, 'Tạo')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({
      code: 'WH-HN-02',
      name: 'Kho Hà Nội 2',
      address: 'Số 2, Ba Đình, Hà Nội',
      description: '',
      isActive: true,
    })
  })

  it('form hợp lệ → hỏi "Tạo kho mới?" kèm tóm tắt mã, tên, địa chỉ; Huỷ thì KHÔNG gửi', async () => {
    let called = false
    server.use(
      mswHttp.post(`${BASE}/warehouses`, () => {
        called = true
        return ok(warehouse)
      }),
    )
    const { user } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo kho' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Tạo kho mới?')
    const rows = within(dialog)
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent])
    expect(rows).toEqual([
      ['Mã', 'WH-HN-02'],
      ['Tên', 'Kho Hà Nội 2'],
      ['Địa chỉ', 'Số 2, Ba Đình, Hà Nội'],
    ])
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }))
    expect(called).toBe(false)
  })

  it('mã trùng (100506) hiện dưới ô Mã, không toast, sheet vẫn mở', async () => {
    server.use(mswHttp.post(`${BASE}/warehouses`, () => apiError(422, 100506)))
    const { user, onOpenChange } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo kho' }))
    await confirmDialog(user, 'Tạo')

    expect(await screen.findByText('Mã kho đã tồn tại')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('mã bị bản ghi đã xoá giữ chỗ (100507) cũng hiện dưới ô Mã', async () => {
    server.use(mswHttp.post(`${BASE}/warehouses`, () => apiError(422, 100507)))
    const { user } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo kho' }))
    await confirmDialog(user, 'Tạo')

    expect(await screen.findByText('Mã kho đang bị một kho đã xoá giữ chỗ')).toBeInTheDocument()
  })

  it('lỗi không thuộc ô nào → toast, sheet vẫn mở', async () => {
    server.use(mswHttp.post(`${BASE}/warehouses`, () => apiError(500, undefined, 'Boom')))
    const { user, onOpenChange } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo kho' }))
    await confirmDialog(user, 'Tạo')

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Boom'))
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('WarehouseFormSheet — sửa', () => {
  it('đổ sẵn giá trị của kho đang sửa và khoá nút Lưu khi chưa đổi gì', async () => {
    renderSheet(warehouse)

    expect(screen.getByRole('heading', { name: 'Sửa kho' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/^Mã/)).toHaveValue('WH-HN-01'))
    expect(screen.getByLabelText(/^Tên/)).toHaveValue('Kho Hà Nội 1')
    expect(screen.getByLabelText('Điện thoại')).toHaveValue('02412345678')
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('đổi một ô → mở khoá nút Lưu, PATCH không kèm version', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, async ({ request }) => {
        body = await request.json()
        return ok(warehouse)
      }),
    )
    const { user, onOpenChange } = renderSheet(warehouse)
    await waitFor(() => expect(screen.getByLabelText(/^Tên/)).toHaveValue('Kho Hà Nội 1'))

    await user.clear(screen.getByLabelText(/^Tên/))
    await user.type(screen.getByLabelText(/^Tên/), 'Kho Hà Nội 1B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toMatchObject({ name: 'Kho Hà Nội 1B' })
    expect(body).not.toHaveProperty('version')
  })

  it('tên trùng (100503) hiện dưới ô Tên; điện thoại sai (100509) dưới ô Điện thoại', async () => {
    server.use(mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, () => apiError(422, 100503)))
    const { user, rerender } = renderSheet(warehouse)
    await waitFor(() => expect(screen.getByLabelText(/^Tên/)).toHaveValue('Kho Hà Nội 1'))

    await user.type(screen.getByLabelText(/^Tên/), ' B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Tên kho đã tồn tại')).toBeInTheDocument()

    server.use(mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, () => apiError(400, 100509)))
    rerender(<WarehouseFormSheet open onOpenChange={vi.fn()} warehouse={warehouse} />)
    await user.type(screen.getByLabelText('Điện thoại'), '9')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Số điện thoại kho không hợp lệ')).toBeInTheDocument()
  })
})
