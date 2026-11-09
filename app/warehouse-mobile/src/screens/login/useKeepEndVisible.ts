import { useRef } from 'react'
import type { LayoutChangeEvent, ScrollViewInstance } from 'react-native'

/**
 * Khi khung cuộn bị co lại (KeyboardAvoidingView vừa chừa chỗ cho bàn phím), cuộn xuống cuối để nút
 * gửi ở cuối form vẫn thấy được. Chạy theo `onLayout` — tức là SAU khi khung đã co — nên không cần
 * hẹn giờ hay đoán chiều cao bàn phím. Khung giãn ra (bàn phím đóng) thì để yên.
 */
export function useKeepEndVisible() {
  const scrollRef = useRef<ScrollViewInstance>(null)
  const lastHeight = useRef<number | null>(null)

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height
    if (lastHeight.current !== null && height < lastHeight.current) {
      scrollRef.current?.scrollToEnd({ animated: true })
    }
    lastHeight.current = height
  }

  return { scrollRef, onLayout }
}
