import { MutationObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// Chỉ thay `refreshCurrentUser` để khẳng định ĐƯỢC GỌI hay không một cách tất định (handler gọi nó
// kiểu bắn-rồi-quên). Đường chạy thật tới `/auth/me` + chuyển `/forbidden` do
// `app/permission-revoked.test.tsx` giữ.
vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  refreshCurrentUser: vi.fn(() => Promise.resolve()),
}))

import { toast } from 'sonner'
import { refreshCurrentUser } from '@/entities/session'
import { queryClient } from './query-client'

const apiError = (statusCode: number, extra: Record<string, unknown> = {}) => ({
  statusCode,
  timestamp: '',
  path: '/x',
  method: 'GET',
  message: 'Boom',
  ...extra,
})

async function runMutation(error: unknown, meta?: { suppressErrorToast?: boolean }) {
  const observer = new MutationObserver(queryClient, {
    mutationFn: () => Promise.reject(error),
    meta,
  })
  await observer.mutate().catch(() => {})
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(refreshCurrentUser).mockClear()
})
afterEach(() => queryClient.clear())

describe('lỗi mutation', () => {
  it('mặc định toast đúng 1 lần', async () => {
    await runMutation(apiError(422, { code: 999902 }))
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('meta.suppressErrorToast → không toast', async () => {
    await runMutation(apiError(422), { suppressErrorToast: true })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('401 → không toast (phiên đã được interceptor xử lý)', async () => {
    await runMutation(apiError(401))
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('lỗi query', () => {
  it('lỗi ở lần tải đầu (chưa có dữ liệu) → không toast', async () => {
    await queryClient
      .fetchQuery({ queryKey: ['t1'], queryFn: () => Promise.reject(apiError(500)), retry: false })
      .catch(() => {})
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('đã có dữ liệu, tải lại nền lỗi → toast 1 lần', async () => {
    queryClient.setQueryData(['t2'], { ok: true })
    await queryClient
      .fetchQuery({
        queryKey: ['t2'],
        queryFn: () => Promise.reject(apiError(500)),
        retry: false,
        staleTime: 0,
      })
      .catch(() => {})
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('đã có dữ liệu nhưng meta.suppressErrorToast → không toast', async () => {
    queryClient.setQueryData(['t3'], { ok: true })
    await queryClient
      .fetchQuery({
        queryKey: ['t3'],
        queryFn: () => Promise.reject(apiError(500)),
        retry: false,
        staleTime: 0,
        meta: { suppressErrorToast: true },
      })
      .catch(() => {})
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('request bị huỷ → không toast', async () => {
    queryClient.setQueryData(['t4'], { ok: true })
    const cancelled = Object.assign(new Error('canceled'), { __CANCEL__: true })
    await queryClient
      .fetchQuery({
        queryKey: ['t4'],
        queryFn: () => Promise.reject(cancelled),
        retry: false,
        staleTime: 0,
      })
      .catch(() => {})
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('403 do thiếu quyền → nạp lại quyền', () => {
  // Hình dạng backend trả khi guard phân quyền từ chối: không `code`, câu mặc định của Nest.
  const denied = apiError(403, { message: 'Forbidden resource' })

  it('mutation bị từ chối → nạp lại quyền', async () => {
    await runMutation(denied)
    expect(refreshCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('mutation tự lo lỗi (suppressErrorToast) vẫn nạp lại quyền — tắt TOAST, không tắt việc làm mới', async () => {
    await runMutation(denied, { suppressErrorToast: true })
    expect(refreshCurrentUser).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('403 nghiệp vụ có mã (tài khoản bị khoá) → KHÔNG nạp lại', async () => {
    await runMutation(apiError(403, { code: 100002 }))
    expect(refreshCurrentUser).not.toHaveBeenCalled()
  })

  it('query bị từ chối ngay lần tải đầu → vẫn nạp lại (để RoleGate đưa đi nếu mất quyền vào màn)', async () => {
    await queryClient
      .fetchQuery({ queryKey: ['d1'], queryFn: () => Promise.reject(denied), retry: false })
      .catch(() => {})
    expect(refreshCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('lỗi khác (500) → KHÔNG nạp lại', async () => {
    await runMutation(apiError(500))
    expect(refreshCurrentUser).not.toHaveBeenCalled()
  })
})
