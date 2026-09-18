import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { server } from '@/shared/test/msw'
import { useLogin } from '@/features/auth-login'
import { queryClient } from '@/app/query-client'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

afterEach(() => {
  queryClient.clear()
  vi.mocked(toast.error).mockClear()
})

describe('đăng nhập lỗi', () => {
  it('KHÔNG toast global — LoginPage đã hiện lỗi tại chỗ (403/100002 user bị khoá)', async () => {
    server.use(
      mswHttp.post('http://localhost:8085/api/v1/auth/login', () =>
        HttpResponse.json(
          {
            statusCode: 403,
            code: 100002,
            timestamp: '',
            path: '/auth/login',
            method: 'POST',
            message: 'User is inactive',
          },
          { status: 403 },
        ),
      ),
    )
    const { result } = renderHook(() => useLogin(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ phonenumber: '0900000000', password: 'x' }).catch(() => {})
    })

    await waitFor(() =>
      expect(result.current.error).toMatchObject({ statusCode: 403, code: 100002 }),
    )
    expect(toast.error).not.toHaveBeenCalled()
  })
})
