import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { bootstrapSession, useRefreshProfileOnForeground } from '@/entities/session'
import { isApiError } from '@/shared/api/http'
import i18n, { initI18n } from '@/shared/i18n'
import { useTheme } from '@/shared/theme/useTheme'

import { navigationThemeFor } from './navigation-theme'
import { wireSession } from './session-wiring'

// Docs expo-splash-screen: gọi ở phạm vi module, trước khi splash kịp tự ẩn. SessionGate ẩn nó.
void SplashScreen.preventAutoHideAsync()

/** 4xx là câu trả lời dứt khoát của server: gửi lại cũng vậy. Lỗi mạng / 5xx thử thêm 1 lần. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.statusCode >= 400 && error.statusCode < 500) return false
  return failureCount < 1
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry },
    mutations: { retry: false },
  },
})

/**
 * Nối dây phiên rồi chạy song song i18n + `bootstrapSession()`. True khi cả hai xong (lỗi
 * cũng tính là xong — không bao giờ kẹt ở splash). Gọi đúng một lần, ở SessionGate.
 */
export function useAppBootstrap(): boolean {
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    // TRƯỚC bootstrapSession: handler 401 và listener resolve kho phải có mặt khi nó chạy.
    const unwire = wireSession(queryClient)
    let alive = true
    Promise.all([initI18n(), bootstrapSession()])
      .catch((e: unknown) => console.warn('[bootstrap] Khởi động lỗi', e))
      .finally(() => {
        if (alive) setBooted(true)
      })
    return () => {
      alive = false
      unwire()
    }
  }, [])

  useRefreshProfileOnForeground()

  return booted
}

function NavigationTheme({ children }: { children: ReactNode }) {
  const { scheme } = useTheme()
  const value = useMemo(() => navigationThemeFor(scheme), [scheme])
  return <ThemeProvider value={value}>{children}</ThemeProvider>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    // Gốc của mọi cử chỉ RNGH (vuốt để xoá thẻ vật tư) — docs RNGH: bọc ngoài cùng, `flex: 1`.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <NavigationTheme>{children}</NavigationTheme>
          </I18nextProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
