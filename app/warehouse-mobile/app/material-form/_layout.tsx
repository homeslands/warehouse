import { Stack } from 'expo-router'

import { scanModalOptions } from '@/bootstrap/ScanStackLayout'
import { SheetStackLayout } from '@/bootstrap/SheetStackLayout'

export default function SheetLayout() {
  return (
    <SheetStackLayout>
      {/* Giữ đúng thứ tự route mặc định (index trước, rồi theo độ dài tên) — xem FormModalStackLayout. */}
      <Stack.Screen name="index" />
      <Stack.Screen name="pick" />
      {/* Quét mã điền ô Mã: toàn màn (ScanScreen tự ẩn header). */}
      <Stack.Screen
        name="scan"
        options={{
          ...scanModalOptions,
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
        }}
      />
      <Stack.Screen name="suppliers" />
      <Stack.Screen name="warehouses" />
    </SheetStackLayout>
  )
}
