import { Stack, type NativeStackNavigationOptions } from 'expo-router'
import { Platform } from 'react-native'

/**
 * Trình bày màn quét mã toàn màn (`/scan-material`, `/scan-line`, `/scan-export-line` trên Stack gốc;
 * màn con `scan` của sheet `/material-form`): modal toàn màn che thanh tab (Android trượt từ dưới lên),
 * không vuốt xuống để đóng (✕ của `ScanScreen`). Nền: `ScanScreen` tự phủ đen; Stack gốc đặt thêm nền đen
 * cho route (SessionGate).
 */
export const scanModalOptions: NativeStackNavigationOptions = {
  presentation: 'fullScreenModal',
  gestureEnabled: false,
  ...(Platform.OS === 'android' ? { animation: 'slide_from_bottom' } : null),
}

/**
 * Stack lồng của một route quét toàn màn (`app/<scan route>/_layout.tsx`). `ScanScreen` tự vẽ nền đen phủ
 * kín; header ẩn, nền route đen.
 */
export function ScanStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }} />
  )
}
