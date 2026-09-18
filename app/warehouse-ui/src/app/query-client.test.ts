import { MutationObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
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

beforeEach(() => vi.mocked(toast.error).mockClear())
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
