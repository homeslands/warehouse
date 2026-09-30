import { MutationCache, QueryClient, isCancelledError } from '@tanstack/react-query'
import { isCancelledRequest } from '@/shared/api/http'
import { toastApiError } from '@/shared/lib/toast-error'

/**
 * Client mang đúng chốt chặn toast lỗi mutation của `src/app/query-client.ts`.
 *
 * Client mặc định của `renderWithProviders` KHÔNG có `MutationCache.onError`, nên mọi khẳng định
 * kiểu "hook này không tự toast" chạy trên nó đều đúng sẵn — kể cả khi hook đánh mất
 * `meta.suppressErrorToast` và thực tế lại toast hai lần. Test nào kiểm nhánh đó phải truyền client
 * này vào (`renderWithProviders(ui, { queryClient: mutationToastQueryClient() })`).
 *
 * `shared` không được import `app` nên đây là bản sao chứ không phải chính handler của app; phần
 * "app thật sự có chốt chặn này" do `src/app/query-client.test.ts` giữ.
 */
export function mutationToastQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (mutation.meta?.suppressErrorToast) return
        if (isCancelledError(error) || isCancelledRequest(error)) return
        toastApiError(error)
      },
    }),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}
