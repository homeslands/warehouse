import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { isApiError } from '@/shared/api/http'
import { useSession } from '@/shared/auth/useSession'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Thử lại một request 403 ba lần là vô nghĩa và làm chậm phản hồi lỗi.
      retry: (failureCount, error) => {
        if (isApiError(error) && error.statusCode >= 400 && error.statusCode < 500) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})

function SessionGate({ children }: { children: ReactNode }) {
  useSession()
  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionGate>{children}</SessionGate>
      <Toaster richColors />
    </QueryClientProvider>
  )
}
