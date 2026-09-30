import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { Toaster } from '@/shared/ui/sonner'
import { useAuthStore } from './auth.store'
import type { CurrentUser } from './permissions'
import { shouldRecheck, usePermissionSync } from './usePermissionSync'

const BASE = 'http://localhost:8085/api/v1'

describe('shouldRecheck — khi nào quay lại tab thì kiểm tra quyền', () => {
  const base = { hiddenFor: 40_000, sinceLastCheck: 100_000, authenticated: true }

  it('ẩn đủ lâu, đủ xa lần trước, đang đăng nhập → kiểm tra', () => {
    expect(shouldRecheck(base)).toBe(true)
  })

  it('ẩn < 30s (liếc qua tab khác) → không', () => {
    expect(shouldRecheck({ ...base, hiddenFor: 29_999 })).toBe(false)
  })

  it('chưa đủ 60s từ lần trước (kể cả lần nạp lúc mở phiên) → không', () => {
    expect(shouldRecheck({ ...base, sinceLastCheck: 59_999 })).toBe(false)
  })

  it('đúng ngưỡng 30s / 60s → có', () => {
    expect(shouldRecheck({ ...base, hiddenFor: 30_000, sinceLastCheck: 60_000 })).toBe(true)
  })

  it('chưa đăng nhập → không', () => {
    expect(shouldRecheck({ ...base, authenticated: false })).toBe(false)
  })
})

const MANAGER: CurrentUser = {
  userId: 'u1',
  userName: 'm',
  roleName: 'MANAGER',
  scope: ['IMPORT_FORM_CONFIRM'],
}

const T0 = 1_000_000

/**
 * Toaster THẬT, không mock 'sonner': hook này được `src/app/test-setup.ts` nạp (qua barrel
 * `entities/session`) TRƯỚC khi `vi.mock` của file test kịp áp dụng, nên nó giữ bản sonner thật —
 * mock sẽ không bao giờ thấy lời gọi. Kiểm thẳng thứ người dùng thấy trên DOM.
 */
function Probe() {
  usePermissionSync()
  return <Toaster />
}

const UPDATED = 'Quyền của bạn vừa được cập nhật.'

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Ẩn 40s, quay lại lúc cách mount 100s — qua cả hai ngưỡng. */
function comeBackAfterAWhile() {
  vi.setSystemTime(T0 + 60_000)
  setVisibility('hidden')
  vi.setSystemTime(T0 + 100_000)
  setVisibility('visible')
}

let meCalls = 0
function meReturns(next: CurrentUser) {
  server.use(
    mswHttp.get(`${BASE}/auth/me`, () => {
      meCalls += 1
      return ok(next)
    }),
  )
}

/** Chờ /auth/me về và store ghi xong, rồi xả hết microtask còn lại (nhánh toast chạy sau setUser). */
async function settled(expectedUserName: string) {
  await waitFor(() => expect(useAuthStore.getState().user?.userName).toBe(expectedUserName))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  // Chỉ giả `Date`: setTimeout thật để waitFor và MSW còn chạy.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  meCalls = 0
})

afterEach(() => {
  toast.dismiss()
  vi.useRealTimers()
  setVisibility('visible')
})

describe('usePermissionSync', () => {
  it('quay lại tab sau một lúc → nạp lại /auth/me', async () => {
    meReturns(MANAGER)
    renderWithProviders(<Probe />, { auth: MANAGER })

    comeBackAfterAWhile()

    await waitFor(() => expect(meCalls).toBe(1))
  })

  it('được cấp thêm quyền → toast thông tin', async () => {
    meReturns({ ...MANAGER, scope: ['IMPORT_FORM_CONFIRM', 'WAREHOUSE_DELETE'] })
    renderWithProviders(<Probe />, { auth: MANAGER })

    comeBackAfterAWhile()

    expect(await screen.findByText(UPDATED)).toBeInTheDocument()
    expect(document.querySelector('[data-sonner-toast]')).toHaveAttribute('data-type', 'info')
  })

  it('bị đổi VAI TRÒ (scope giữ nguyên) → cũng là đổi quyền', async () => {
    meReturns({ ...MANAGER, roleName: 'SUPERVISOR' })
    renderWithProviders(<Probe />, { auth: MANAGER })

    comeBackAfterAWhile()

    expect(await screen.findByText(UPDATED)).toBeInTheDocument()
  })

  it('quyền không đổi (chỉ khác thứ tự) → im lặng', async () => {
    // userName khác để có tín hiệu "store đã ghi" — userName không thuộc quyền.
    meReturns({ ...MANAGER, userName: 'm2', scope: ['B', 'A'] })
    renderWithProviders(<Probe />, { auth: { ...MANAGER, scope: ['A', 'B'] } })

    comeBackAfterAWhile()

    await settled('m2')
    expect(screen.queryByText(UPDATED)).not.toBeInTheDocument()
  })
})
