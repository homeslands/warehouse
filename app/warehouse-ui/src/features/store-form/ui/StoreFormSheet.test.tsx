import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { confirmDialog } from '@/shared/test/confirm'
import { renderWithProviders } from '@/shared/test/render'
import type { Store } from '@/entities/store'
import { StoreFormSheet } from '../index'

const BASE = 'http://localhost:8085/api/v1'

const store: Store = {
  slug: 'ch-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
  phonenumber: '02412345678',
  email: 'lienhe@abc.vn',
  isActive: true,
}

function renderSheet(target?: Store) {
  const onOpenChange = vi.fn()
  return {
    onOpenChange,
    ...renderWithProviders(<StoreFormSheet open onOpenChange={onOpenChange} store={target} />, {
      auth: 'admin',
    }),
  }
}

async function fillRequired(
  user: ReturnType<typeof renderSheet>['user'],
  taxCode = '0101234567-001',
) {
  await user.type(screen.getByLabelText(/^Mã(?! số)/), 'ST-HN-02')
  await user.type(screen.getByLabelText(/^Tên(?! pháp)/), 'Cửa hàng Hà Nội 2')
  await user.type(screen.getByLabelText(/^Tên pháp lý/), 'Công ty TNHH XYZ')
  await user.type(screen.getByLabelText(/^Mã số thuế/), taxCode)
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

describe('StoreFormSheet — tạo mới', () => {
  it('bốn ô bắt buộc đều có aria-required', () => {
    renderSheet()

    for (const label of [/^Mã(?! số)/, /^Tên(?! pháp)/, /^Tên pháp lý/, /^Mã số thuế/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true')
    }
  })

  it('bỏ trống ô bắt buộc → báo lỗi tại từng ô, không gọi API', async () => {
    let called = false
    server.use(
      mswHttp.post(`${BASE}/stores`, () => {
        called = true
        return ok(store)
      }),
    )
    const { user } = renderSheet()

    await user.click(screen.getByRole('button', { name: 'Tạo cửa hàng' }))

    expect(await screen.findByText('Vui lòng nhập mã cửa hàng')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập tên cửa hàng')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập tên pháp lý')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập mã số thuế')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('mã sai định dạng (khoảng trắng) → lỗi tại ô Mã', async () => {
    const { user } = renderSheet()

    await user.type(screen.getByLabelText(/^Mã(?! số)/), 'ST HN 01')
    await user.type(screen.getByLabelText(/^Tên(?! pháp)/), 'Cửa hàng Hà Nội 2')
    await user.type(screen.getByLabelText(/^Tên pháp lý/), 'Công ty TNHH XYZ')
    await user.type(screen.getByLabelText(/^Mã số thuế/), '0101234567')
    await user.click(screen.getByRole('button', { name: 'Tạo cửa hàng' }))

    expect(await screen.findByText('Mã cửa hàng không đúng định dạng')).toBeInTheDocument()
  })

  it.each(['12345', '01012345678', '0101234567-01'])(
    'mã số thuế "%s" sai định dạng → lỗi tại ô Mã số thuế',
    async (taxCode) => {
      const { user } = renderSheet()

      await fillRequired(user, taxCode)
      await user.click(screen.getByRole('button', { name: 'Tạo cửa hàng' }))

      expect(await screen.findByText('Mã số thuế không đúng định dạng')).toBeInTheDocument()
    },
  )

  it('mã số thuế 10 chữ số kèm hậu tố chi nhánh là hợp lệ; ô có format để trống thì KHÔNG gửi', async () => {
    let body: unknown
    server.use(
      mswHttp.post(`${BASE}/stores`, async ({ request }) => {
        body = await request.json()
        return ok(store)
      }),
    )
    const { user, onOpenChange } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo cửa hàng' }))
    await confirmDialog(user, 'Tạo')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toEqual({
      code: 'ST-HN-02',
      name: 'Cửa hàng Hà Nội 2',
      legalName: 'Công ty TNHH XYZ',
      taxCode: '0101234567-001',
      invoiceAddress: '',
      address: '',
      isActive: true,
    })
  })

  it.each([
    [101006, 'Mã cửa hàng đã tồn tại'],
    [101011, 'Mã số thuế đã tồn tại'],
    [101013, 'Email cửa hàng không hợp lệ'],
  ])('lỗi backend %i hiện dưới đúng ô, không toast', async (code, message) => {
    server.use(mswHttp.post(`${BASE}/stores`, () => apiError(422, code)))
    const { user } = renderSheet()

    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Tạo cửa hàng' }))
    await confirmDialog(user, 'Tạo')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('StoreFormSheet — sửa', () => {
  it('đổ sẵn dữ liệu và khoá nút Lưu khi chưa đổi gì', async () => {
    renderSheet(store)

    expect(screen.getByRole('heading', { name: 'Sửa cửa hàng' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/^Mã số thuế/)).toHaveValue('0101234567'))
    expect(screen.getByLabelText('Email')).toHaveValue('lienhe@abc.vn')
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('đổi một ô → PATCH không kèm version', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/stores/ch-ha-noi`, async ({ request }) => {
        body = await request.json()
        return ok(store)
      }),
    )
    const { user, onOpenChange } = renderSheet(store)
    await waitFor(() =>
      expect(screen.getByLabelText(/^Tên(?! pháp)/)).toHaveValue('Cửa hàng Hà Nội 1'),
    )

    await user.type(screen.getByLabelText(/^Tên(?! pháp)/), ' B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(body).toMatchObject({ name: 'Cửa hàng Hà Nội 1 B' })
    expect(body).not.toHaveProperty('version')
  })
})
