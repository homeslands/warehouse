/**
 * UI-02 (API v1) — API là MSW MOCK đúng OpenAPI R2, không phải API thật.
 */
import { configureStore } from '@reduxjs/toolkit'
import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { endV1Session, injectSessionV1, loginV1, selectSessionV1 } from '@/entities/session'
import { clearCredentials, readPersistedSession } from '@/shared/api/v1'
import { appReducer } from '@/shared/store'
import { V1_BASE, v1LoginResult, v1User, v1ok } from '@/shared/test/api-v1'
import { server } from '@/shared/test/msw'
import { renderWithRouter } from '@/shared/test/render'
import { LockedPage } from './LockedPage'

function makeStore() {
  injectSessionV1()
  return configureStore({ reducer: appReducer })
}

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  store = makeStore()
})

afterEach(() => {
  clearCredentials()
})

async function lockAs(reason: 'idle' | 'locked') {
  server.use(mswHttp.post(`${V1_BASE}/auth/login`, () => v1ok(v1LoginResult())))
  await store.dispatch(loginV1({ phoneNumber: '0900000001', password: 'p' }))
  store.dispatch(endV1Session(reason))
}

function renderLocked(route = '/locked?redirect=%2Fimport-forms%2Fnew') {
  return renderWithRouter(
    [
      { path: '/locked', element: <LockedPage /> },
      { path: '/login', element: <p>Màn đăng nhập</p> },
      { path: '/', element: <p>Trang chủ</p> },
      { path: '/import-forms/new', element: <p>Form nhập đang dở</p> },
    ],
    { route, store },
  )
}

describe('LockedPage (UI-02)', () => {
  it('idle → tiêu đề, lý do 30 phút, tên user; số điện thoại điền sẵn và focus ô mật khẩu', async () => {
    await lockAs('idle')
    renderLocked()
    expect(screen.getByRole('heading', { level: 1, name: 'Phiên đã khoá' })).toBeInTheDocument()
    expect(screen.getByText(/không hoạt động 30 phút/)).toBeInTheDocument()
    expect(screen.getByText('Tài khoản: Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByLabelText('Số điện thoại')).toHaveValue('0900000001')
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu')).toHaveFocus())
    expect(screen.getByText(/tài khoản khác sẽ xoá toàn bộ dữ liệu nháp/)).toBeInTheDocument()
  })

  it('khoá chủ động → mô tả "đã được khoá"', async () => {
    await lockAs('locked')
    renderLocked()
    expect(screen.getByText(/Phiên làm việc đã được khoá/)).toBeInTheDocument()
  })

  it('mở khoá (POST /auth/login) → quay lại đúng trang đang làm', async () => {
    await lockAs('idle')
    let body: unknown
    server.use(
      mswHttp.post(`${V1_BASE}/auth/login`, async ({ request }) => {
        body = await request.json()
        return v1ok(v1LoginResult({ user: v1User() }))
      }),
    )
    const { user, router } = renderLocked()
    await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau')
    await user.click(screen.getByRole('button', { name: 'Mở khoá' }))
    expect(await screen.findByText('Form nhập đang dở')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/import-forms/new')
    expect(body).toEqual({ phoneNumber: '0900000001', password: 'mat-khau' })
  })

  it('Đăng xuất từ màn khoá → về đăng nhập, xoá CSRF, không gọi API (không còn access token)', async () => {
    await lockAs('idle')
    const { user } = renderLocked()
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(await screen.findByText('Màn đăng nhập')).toBeInTheDocument()
    expect(selectSessionV1(store.getState()).endReason).toBe('loggedOut')
    expect(readPersistedSession()).toBeNull()
  })

  it('không bị khoá (chưa đăng nhập) → chuyển /login, giữ redirect', async () => {
    store.dispatch(endV1Session('expired'))
    const { router } = renderLocked()
    expect(await screen.findByText('Màn đăng nhập')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?redirect=%2Fimport-forms%2Fnew')
  })

  it('đang đăng nhập → không ở lại màn khoá', async () => {
    server.use(mswHttp.post(`${V1_BASE}/auth/login`, () => v1ok(v1LoginResult())))
    await store.dispatch(loginV1({ phoneNumber: '0900000001', password: 'p' }))
    renderLocked()
    expect(await screen.findByText('Form nhập đang dở')).toBeInTheDocument()
  })
})
