import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { confirmDialog } from '@/shared/test/confirm'
import { renderWithProviders } from '@/shared/test/render'
import type { Supplier } from '@/entities/supplier'
import { SupplierFormSheet } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const supplier: Supplier = {
  slug: 'ncc-hn-01',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  code: 'NCC-HN-01',
  name: 'Công ty ABC',
  taxCode: '0101234567',
  phonenumber: '0241234567',
  email: 'lienhe@abc.vn',
  address: null,
  contactPerson: null,
  note: null,
}

function renderSheet(target?: Supplier) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(
      <SupplierFormSheet open onOpenChange={onOpenChange} supplier={target} />,
      { auth: 'admin' },
    ),
  }
}

const codeField = () => screen.getByLabelText(/^Mã(?! số)/)
const nameField = () => screen.getByLabelText(/^Tên/)

async function fillRequired(user: ReturnType<typeof renderSheet>['user']) {
  await user.type(codeField(), 'ncc-hn-02')
  await user.type(nameField(), 'Công ty XYZ')
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

describe('SupplierFormSheet — tạo mới', () => {
  it('tiêu đề, hai ô bắt buộc có aria-required, gợi ý Mã hiện sẵn', () => {
    renderSheet()

    expect(screen.getByRole('heading', { name: 'Thêm nhà cung cấp' })).toBeInTheDocument()
    expect(codeField()).toHaveAttribute('aria-required', 'true')
    expect(nameField()).toHaveAttribute('aria-required', 'true')
    expect(
      screen.getByText('2–32 ký tự: chữ, số, gạch ngang; hệ thống tự viết hoa'),
    ).toBeInTheDocument()
  })

  it('hợp lệ → hộp xác nhận tóm tắt (Mã viết hoa, MST "Chưa có") → Thêm → POST đúng body rồi đóng', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/suppliers`, async ({ request }) => {
        body = await request.json()
        return ok(supplier)
      }),
    )
    const { user, onOpenChange } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Thêm nhà cung cấp' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Thêm nhà cung cấp mới?')
    expect(dialog).toHaveTextContent('NCC-HN-02')
    expect(dialog).toHaveTextContent('Công ty XYZ')
    expect(dialog).toHaveTextContent('Chưa có')

    await confirmDialog(user, 'Thêm')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ code: 'ncc-hn-02', name: 'Công ty XYZ' })
  })

  it('Huỷ trong hộp xác nhận → không gửi', async () => {
    let called = false
    server.use(
      mswHttp.post(`${BASE}/suppliers`, () => {
        called = true
        return ok(supplier)
      }),
    )
    const { user, onOpenChange } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Thêm nhà cung cấp' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }))
    // Hộp đã đóng = thao tác huỷ đã xử lý xong; chỉ sau đó mới khẳng định "không gửi".
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(called).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it.each([
    [101205, 'code', 'Mã nhà cung cấp đã tồn tại'],
    [101206, 'code', 'Mã này đang bị một nhà cung cấp đã xoá giữ chỗ'],
    [101208, 'taxCode', 'Mã số thuế đã tồn tại'],
    [101209, 'phonenumber', 'Số điện thoại không đúng định dạng'],
    [101210, 'email', 'Email không hợp lệ'],
  ])(
    'lỗi backend %i hiện dưới đúng ô %s, không toast, hộp xác nhận đã đóng',
    async (code, field, message) => {
      server.use(mswHttp.post(`${BASE}/suppliers`, () => apiError(422, code)))
      const { user } = renderSheet()

      await fillRequired(user)
      await user.click(screen.getByRole('button', { name: 'Thêm nhà cung cấp' }))
      await confirmDialog(user, 'Thêm')

      // Đợi lỗi hiện (yêu cầu đã trả về) rồi mới khẳng định "không toast".
      const error = await screen.findByText(message)
      expect(error).toBeInTheDocument()
      expect(toast.error).not.toHaveBeenCalled()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      const input = {
        code: codeField(),
        taxCode: screen.getByLabelText(/^Mã số thuế/),
        phonenumber: screen.getByLabelText(/^Điện thoại/),
        email: screen.getByLabelText('Email'),
      }[field as 'code' | 'taxCode' | 'phonenumber' | 'email']
      expect(input).toHaveAccessibleDescription(expect.stringContaining(message))
    },
  )

  it('đã gõ rồi bấm Huỷ → hỏi "Bỏ thay đổi chưa lưu?"', async () => {
    const { user, onOpenChange } = renderSheet()

    await user.type(codeField(), 'NCC')
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Bỏ thay đổi chưa lưu?')
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('SupplierFormSheet — sửa', () => {
  it('đổ sẵn dữ liệu, khoá Lưu khi chưa đổi, ô tuỳ chọn có gợi ý "giữ nguyên"', async () => {
    renderSheet(supplier)

    expect(screen.getByRole('heading', { name: 'Sửa nhà cung cấp' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue('lienhe@abc.vn'))
    expect(nameField()).toHaveValue('Công ty ABC')
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    // Email, Địa chỉ, Người liên hệ, Ghi chú không có gợi ý định dạng.
    expect(screen.getAllByText('Để trống sẽ giữ nguyên giá trị hiện tại')).toHaveLength(4)
    // Ô có gợi ý định dạng giữ gợi ý định dạng.
    expect(screen.getByText(/^10 chữ số/)).toBeInTheDocument()
    expect(screen.getByText('Bắt đầu bằng 0, 9–11 chữ số')).toBeInTheDocument()
  })

  it('xoá trống Email + đổi Tên → PATCH chỉ { name }, không hỏi xác nhận', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/suppliers/ncc-hn-01`, async ({ request }) => {
        body = await request.json()
        return ok(supplier)
      }),
    )
    const { user, onOpenChange } = renderSheet(supplier)
    await waitFor(() => expect(nameField()).toHaveValue('Công ty ABC'))

    await user.clear(screen.getByLabelText('Email'))
    await user.type(nameField(), ' B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({ name: 'Công ty ABC B' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('chỉ xoá trống Email (không có gì để gửi) → đóng luôn, không gọi API', async () => {
    let called = false
    server.use(
      mswHttp.patch(`${BASE}/suppliers/ncc-hn-01`, () => {
        called = true
        return ok(supplier)
      }),
    )
    const { user, onOpenChange } = renderSheet(supplier)
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue('lienhe@abc.vn'))

    await user.clear(screen.getByLabelText('Email'))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    // Đóng form là trạng thái đã ổn định; chỉ sau đó mới khẳng định "không gọi API".
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(called).toBe(false)
  })
})
