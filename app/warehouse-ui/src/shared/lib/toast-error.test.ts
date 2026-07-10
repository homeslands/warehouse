import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/shared/i18n'
import type { ApiError } from '@/shared/api/types'
import { toastApiError } from './toast-error'

// `sonner` gọi vào DOM thật (portal) khi render <Toaster>. Ở đây ta chỉ quan tâm
// toastApiError có GỌI `toast.error` hay không, và gọi với chuỗi nào — mock để cô lập.
vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
})

describe('toastApiError', () => {
  it('KHÔNG gọi toast.error khi lỗi là 401 (đã có handler chuyển hướng /login riêng)', () => {
    const error: ApiError = {
      statusCode: 401,
      timestamp: '',
      path: '/x',
      method: 'GET',
      message: 'Unauthorized',
    }

    toastApiError(error)

    expect(toast.error).not.toHaveBeenCalled()
  })

  it('gọi toast.error với chuỗi dịch từ mã lỗi backend (422 / exampleNameDoesExist)', () => {
    const error: ApiError = {
      statusCode: 422,
      code: 999902,
      timestamp: '',
      path: '/examples',
      method: 'POST',
      message: 'Example name already exists',
    }

    toastApiError(error)

    expect(toast.error).toHaveBeenCalledExactlyOnceWith(i18n.t('errors:exampleNameDoesExist'))
  })

  it('gọi toast.error với thông báo lỗi mạng khi lỗi không phải ApiError', () => {
    toastApiError(new Error('Network Error'))

    expect(toast.error).toHaveBeenCalledExactlyOnceWith(i18n.t('errors:network'))
  })
})
