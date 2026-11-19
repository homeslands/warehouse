import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useLayoutEffect, useRef } from 'react'

/**
 * Áp bộ lọc dựng sẵn từ param `preset` của route (tab Tổng quan mở danh sách đã lọc mà không import
 * store của màn khác). `preset` thuộc `allowed` → gọi `apply` ĐÚNG MỘT LẦN cho giá trị đó rồi xoá
 * param (quay lại tab sau đó không reset bộ lọc người dùng đã chỉnh); giá trị lạ → chỉ xoá param.
 * Chạy ở layout effect để màn không kịp vẽ một khung hình với bộ lọc cũ.
 *
 * Xoá param bằng `navigation.setParams` của CHÍNH màn này: `router.setParams` gửi lên navigator gốc
 * (route `(tabs)`), param của màn danh sách vẫn còn → chạm lại cùng số sẽ không áp lại được.
 */
export function useRoutePreset<T extends string>(
  allowed: readonly T[],
  apply: (preset: T) => void,
): void {
  const { preset } = useLocalSearchParams<{ preset?: string | string[] }>()
  const navigation = useNavigation()
  // Giá trị đã xử lý gần nhất: param chưa kịp xoá mà màn vẽ lại thì không áp lại.
  const handled = useRef<string | string[] | undefined>(undefined)

  useLayoutEffect(() => {
    if (preset === undefined) {
      handled.current = undefined
      return
    }
    if (handled.current === preset) return
    handled.current = preset
    if (typeof preset === 'string' && (allowed as readonly string[]).includes(preset))
      apply(preset as T)
    navigation.setParams({ preset: undefined } as never)
  }, [preset, allowed, apply, navigation])
}
