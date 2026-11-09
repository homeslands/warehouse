import { useRouter } from 'expo-router'

/**
 * Đóng một sheet route. Bình thường là `back()`; nếu bên dưới không còn màn nào (phiên vừa đổi làm
 * Expo Router gỡ màn nằm dưới sheet) thì thay bằng `/` — route `/` luôn bị khoá nên SessionGate chuyển
 * tới đích hiện tại (login / tab đầu…). Nhờ vậy ✕/✓ không bao giờ "bấm mà không có gì xảy ra".
 */
export function useCloseSheet(): () => void {
  const router = useRouter()
  return () => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }
}
