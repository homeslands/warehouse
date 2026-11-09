import { useRoute } from 'expo-router'
import { useCallback, useEffect } from 'react'

/** Route (theo `key`, duy nhất mỗi lần mở màn) đã rời màn — không rời thêm lần nào nữa. */
const left = new Set<string>()

/**
 * Cho rời màn MỘT lần. Màn soạn phiếu có thể được yêu cầu rời hai lần (luồng Lưu / Gửi duyệt / Xoá rời
 * màn, rồi lần tải lại phiếu về sau đó thấy phiếu không còn Nháp) — lần thứ hai không được `back()` thêm
 * một màn nữa. Không so "đỉnh Stack": lúc màn vừa gắn (vd mở thẳng mà thiếu quyền) state của Stack chưa
 * có route của nó. Dùng chung cho mọi hook rời màn của cùng route (chung một tập `left`) — hiện là
 * `useWizardNav`.
 */
export function useLeaveOnce(): () => boolean {
  const route = useRoute()
  const key = route.key
  useEffect(() => () => void left.delete(key), [key])
  return useCallback(() => {
    if (left.has(key)) return false
    left.add(key)
    return true
  }, [key])
}
