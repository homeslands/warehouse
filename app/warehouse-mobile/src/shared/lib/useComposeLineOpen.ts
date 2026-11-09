import { useNavigation, useRouter, type Href } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'

import { useLineFocus, type LineFocusKind } from './line-focus'

/**
 * Mở SHEET SỬA DÒNG từ bước 2 của màn soạn phiếu (xuất và nhập dùng chung; không biết bản nháp nào —
 * `href` do màn đưa, đọc thẳng store của nó; spec wizard-apple §6):
 * - `openLine(key)`: chạm dòng / chạm phần thiếu ở đáy / "Tiếp tục" khi thiếu → `router.navigate(href(key,
 *   { justAdded: false }))` (sheet KHÔNG tự focus ô số).
 * - Yêu cầu từ sheet khác (`useLineFocus.ask(kind, formSlug, key)` — bộ chọn vật tư thêm dòng, quét mã
 *   khớp / thêm dòng): CHỈ yêu cầu của đúng `kind` + `formSlug` (màn soạn phiếu kia ở tab khác không thấy,
 *   không xoá); chờ màn được FOCUS lại (sự kiện `'focus'` của navigation khi sheet kia rời Stack gốc;
 *   đang focus sẵn thì làm ngay), qua một `requestAnimationFrame`, rồi BỎ yêu cầu và mở sheet của dòng đó
 *   với `justAdded: true` (sheet focus ô số — người dùng nhập số ngay). Yêu cầu được tiêu thụ đúng MỘT lần:
 *   quay lại bước 2 (vd từ bước 3) không mở lại. `href` trả `null` (dòng không còn) → chỉ bỏ yêu cầu.
 *   Rời màn → bỏ yêu cầu còn treo của chính nó.
 */
export function useComposeLineOpen({
  kind,
  formSlug,
  href,
}: {
  /** Loại phiếu của màn soạn — chỉ nhận yêu cầu `useLineFocus` cùng loại. */
  kind: LineFocusKind
  formSlug: string | undefined
  /** Route sheet của dòng `key`; `null` = không có dòng đó. */
  href: (key: string, opts: { justAdded: boolean }) => Href | null
}): { openLine: (key: string) => void } {
  const router = useRouter()
  const routerRef = useRef(router)
  const hrefRef = useRef(href)
  useEffect(() => {
    routerRef.current = router
    hrefRef.current = href
  })

  const open = useCallback((key: string, justAdded: boolean) => {
    const target = hrefRef.current(key, { justAdded })
    if (target) routerRef.current.navigate(target)
  }, [])
  const openLine = useCallback((key: string) => open(key, false), [open])

  const navigation = useNavigation()
  const navRef = useRef(navigation)
  useEffect(() => {
    navRef.current = navigation
  })
  const request = useLineFocus((s) => s.requestFor(kind, formSlug))
  /** Phiếu hiện tại cho các lần `clear` (gọi trong callback / lúc rời màn). */
  const scopeRef = useRef({ kind, formSlug })
  useEffect(() => {
    scopeRef.current = { kind, formSlug }
  })
  const clearOwn = useCallback(() => {
    const { kind: k, formSlug: f } = scopeRef.current
    useLineFocus.getState().clear(k, f)
  }, [])

  useEffect(() => {
    if (!request) return
    let done = false
    let frame: number | undefined
    const run = () => {
      if (done) return
      done = true
      // Bỏ yêu cầu TRƯỚC khi mở: chỉ một lần, kể cả khi màn được focus lại về sau.
      clearOwn()
      open(request.key, true)
    }
    const nav = navRef.current
    if (nav.isFocused()) {
      frame = requestAnimationFrame(run)
      return () => {
        done = true
        if (frame !== undefined) cancelAnimationFrame(frame)
      }
    }
    const unsubscribe = nav.addListener('focus', () => {
      frame = requestAnimationFrame(run)
    })
    return () => {
      done = true
      if (frame !== undefined) cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [request, open, clearOwn])

  // Rời màn soạn thì bỏ yêu cầu còn treo của chính nó.
  useEffect(() => () => clearOwn(), [clearOwn])

  return { openLine }
}
