import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { Toaster } from '@/shared/ui/sonner'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { usePermissionSync, useSession } from '@/entities/session'
import { queryClient } from '@/app/query-client'
import { AntdProvider } from '@/app/providers/AntdProvider'
import { store as appStore, type AppStore } from '@/app/store'

function SessionGate({ children }: { children: ReactNode }) {
  useSession()
  usePermissionSync()
  return <>{children}</>
}

/**
 * Redux + Ant Design (D08) bọc NGOÀI stack hiện có và không thêm DOM, để màn cũ (Tailwind/shadcn)
 * chạy y nguyên trong lúc chuyển dần từng màn. `AntdProvider` cần nằm trong `ThemeProvider`.
 */
export function App({ children, store = appStore }: { children: ReactNode; store?: AppStore }) {
  return (
    <ReduxProvider store={store}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AntdProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={300}>
              <SessionGate>{children}</SessionGate>
            </TooltipProvider>
            <Toaster />
          </QueryClientProvider>
        </AntdProvider>
      </ThemeProvider>
    </ReduxProvider>
  )
}
