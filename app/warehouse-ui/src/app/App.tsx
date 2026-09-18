import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { Toaster } from '@/shared/ui/sonner'
import { useSession } from '@/entities/session'
import { queryClient } from '@/app/query-client'

function SessionGate({ children }: { children: ReactNode }) {
  useSession()
  return <>{children}</>
}

export function App({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionGate>{children}</SessionGate>
        <Toaster richColors />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
