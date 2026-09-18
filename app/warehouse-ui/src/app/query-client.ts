import { MutationCache, QueryCache, QueryClient, isCancelledError } from '@tanstack/react-query'
import { isApiError, isCancelledRequest } from '@/shared/api/http'
import { toastApiError } from '@/shared/lib/toast-error'

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { suppressErrorToast?: boolean }
    mutationMeta: { suppressErrorToast?: boolean }
  }
}

function notifyError(error: unknown): void {
  if (isCancelledError(error) || isCancelledRequest(error)) return
  // 401: interceptor đã kết thúc phiên và màn login hiện lý do (toastApiError cũng bỏ qua 401).
  toastApiError(error)
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.suppressErrorToast) return
      // Tải lần đầu lỗi: component tự hiện lỗi tại chỗ; toast thêm là báo cùng một lỗi 2 lần.
      // Đã có dữ liệu mà tải lại nền lỗi: màn vẫn hiện dữ liệu cũ, không toast thì người dùng không biết.
      if (query.state.data === undefined) return
      notifyError(error)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      if (mutation.meta?.suppressErrorToast) return
      notifyError(error)
    },
  }),
  defaultOptions: {
    queries: {
      // Mặc định là 0 — mount lại component nào cũng bắn request mới. 30s đủ để điều hướng
      // qua lại giữa các màn hình không tạo request thừa, mà vẫn đủ ngắn cho dữ liệu kho.
      staleTime: 30_000,
      // Thử lại một request 403 ba lần là vô nghĩa và làm chậm phản hồi lỗi.
      retry: (failureCount, error) => {
        if (isApiError(error) && error.statusCode >= 400 && error.statusCode < 500) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})
