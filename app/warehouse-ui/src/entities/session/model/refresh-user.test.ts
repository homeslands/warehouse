import { HttpResponse, http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/shared/test/msw'
import { useAuthStore } from './auth.store'
import { refreshCurrentUser } from './refresh-user'

const BASE = 'http://localhost:8085/api/v1'
const user = { userName: 'root', roleName: 'SUPER_ADMIN', scope: [] }

beforeEach(() => {
  useAuthStore.setState({
    hasSession: true,
    sessionEpoch: 0,
    user: null,
    status: 'loading',
    endReason: null,
  })
})

describe('refreshCurrentUser', () => {
  it('nạp lại /auth/me và ghi user mới vào store', async () => {
    const updated = { ...user, scope: ['MANAGE_PERMISSIONS'] }
    server.use(
      mswHttp.get(`${BASE}/auth/me`, () =>
        HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: updated }),
      ),
    )

    await refreshCurrentUser()

    expect(useAuthStore.getState().user).toEqual(updated)
    expect(useAuthStore.getState().status).toBe('authenticated')
  })
})

describe('refreshCurrentUser — gộp lời gọi', () => {
  it('nhiều lời gọi cùng lúc chỉ bắn MỘT request /auth/me', async () => {
    // Một màn có vài query cùng bị 403 sau khi quyền đổi → mỗi cái đều gọi refresh.
    let calls = 0
    server.use(
      mswHttp.get(`${BASE}/auth/me`, () => {
        calls += 1
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: user })
      }),
    )

    await Promise.all([refreshCurrentUser(), refreshCurrentUser(), refreshCurrentUser()])

    expect(calls).toBe(1)
  })

  it('xong một đợt thì lần gọi SAU vẫn bắn request mới', async () => {
    let calls = 0
    server.use(
      mswHttp.get(`${BASE}/auth/me`, () => {
        calls += 1
        return HttpResponse.json({ message: 'ok', statusCode: 200, timestamp: '', result: user })
      }),
    )

    await refreshCurrentUser()
    await refreshCurrentUser()

    expect(calls).toBe(2)
  })
})
