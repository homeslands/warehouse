import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

/** Bọc test màn dùng `useSafeAreaInsets` (vd `ScanScreen`) — metrics iPhone có tai thỏ. */
export function SafeAreaWrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {children}
    </SafeAreaProvider>
  )
}
