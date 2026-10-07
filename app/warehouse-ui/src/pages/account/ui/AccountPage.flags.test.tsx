import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hai tính năng này backend CHƯA có nên mặc định tắt. File này bật để kiểm phần dựng sẵn thật sự
// chạy — nếu không, code sau cờ chỉ nằm im và sẽ hỏng âm thầm tới ngày ai đó bật lên.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: {
    sort: false,
    search: false,
    userSort: false,
    profileEdit: true,
    sessionList: true,
  },
}))

import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { AccountPage } from '@/pages/account'

const BASE = 'http://localhost:8085/api/v1'

const profile = {
  userName: '0901234567',
  roleName: 'ADMIN',
  scope: [],
  version: 3,
  fullName: 'Nguyễn Văn A',
  email: 'a@cmsiot.net',
}

const devices = [
  {
    sessionId: 's-this',
    createdAt: '2026-09-01T00:00:00.000Z',
    userAgent: 'Chrome',
    current: true,
  },
  {
    sessionId: 's-other',
    createdAt: '2026-09-02T00:00:00.000Z',
    lastSeenAt: '2026-09-20T03:00:00.000Z',
    userAgent: 'Safari trên iPhone',
    current: false,
  },
]

beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/auth/me`, () => ok(profile)),
    mswHttp.get(`${BASE}/auth/sessions`, () => ok(devices)),
  )
})

function renderPage() {
  return renderWithProviders(<AccountPage />, { route: '/account', auth: 'admin' })
}

describe('AccountPage — hồ sơ (cờ bật)', () => {
  it('đổ sẵn hồ sơ từ GET /auth/me', async () => {
    renderPage()

    expect(await screen.findByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn A')
    expect(screen.getByLabelText('Email')).toHaveValue('a@cmsiot.net')
  })

  it('chưa sửa gì thì khoá nút Lưu', async () => {
    renderPage()
    await screen.findByLabelText('Họ và tên')

    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('email sai định dạng báo lỗi tại ô, không gửi đi', async () => {
    let called = false
    server.use(
      mswHttp.patch(`${BASE}/auth/me`, () => {
        called = true
        return ok(profile)
      }),
    )
    const { user } = renderPage()
    await screen.findByLabelText('Email')

    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'sai-dinh-dang')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Email không hợp lệ')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('lưu gửi PATCH /auth/me kèm version', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/auth/me`, async ({ request }) => {
        body = await request.json()
        return ok({ ...profile, version: 4 })
      }),
    )
    const { user } = renderPage()
    await screen.findByLabelText('Họ và tên')

    await user.clear(screen.getByLabelText('Họ và tên'))
    await user.type(screen.getByLabelText('Họ và tên'), 'Trần Thị B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() =>
      expect(body).toEqual({ fullName: 'Trần Thị B', email: 'a@cmsiot.net', version: 3 }),
    )
  })

  it('hồ sơ chưa có version thì KHÔNG gửi field version', async () => {
    // `GET /auth/me` hôm nay chưa trả `version`. Gửi `version: undefined` sẽ bị backend hiểu là
    // thiếu field (100512) chứ không phải "bỏ qua".
    server.use(mswHttp.get(`${BASE}/auth/me`, () => ok({ ...profile, version: undefined })))
    let body: Record<string, unknown> = {}
    server.use(
      mswHttp.patch(`${BASE}/auth/me`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return ok(profile)
      }),
    )
    const { user } = renderPage()
    await screen.findByLabelText('Họ và tên')

    await user.clear(screen.getByLabelText('Họ và tên'))
    await user.type(screen.getByLabelText('Họ và tên'), 'X')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(body.fullName).toBe('X'))
    expect('version' in body).toBe(false)
  })
})

describe('AccountPage — thiết bị (cờ bật)', () => {
  it('liệt kê thiết bị; thiết bị hiện tại không có nút thu hồi', async () => {
    renderPage()

    expect(await screen.findByText('Chrome')).toBeInTheDocument()
    expect(screen.getByText('Thiết bị này')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Thu hồi' })).toHaveLength(1)
  })

  it('thu hồi hỏi lại rồi mới gọi DELETE', async () => {
    let deleted = ''
    server.use(
      mswHttp.delete(`${BASE}/auth/sessions/:id`, ({ params }) => {
        deleted = String(params.id)
        return ok('revoked')
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Safari trên iPhone')

    await user.click(screen.getByRole('button', { name: 'Thu hồi' }))
    const box = await screen.findByRole('alertdialog')
    expect(deleted).toBe('')

    await user.click(within(box).getByRole('button', { name: 'Thu hồi' }))

    await waitFor(() => expect(deleted).toBe('s-other'))
  })
})
