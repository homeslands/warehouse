/**
 * Theo dõi tương tác NGƯỜI DÙNG THẬT để (1) báo `POST /auth/activity` có giới hạn tần suất và
 * (2) khoá màn hình cục bộ khi không tương tác đủ 30 phút.
 *
 * Nguồn: business-rules §Auth/RBAC "server idle 30 phút. Polling/refresh không gia hạn idle.
 * Interactive activity endpoint chỉ caller session, rate limit; UI không gọi từ timer làm giả
 * activity" · D14 §2 · screen-contracts UI-02 "polling không giữ phiên; overlay che dữ liệu".
 *
 * Bất biến (test khoá):
 * - Chỉ handler của sự kiện `pointerdown` / `keydown` gọi `report`. Timer KHÔNG BAO GIỜ gọi `report`
 *   — timer chỉ kiểm hạn idle để khoá màn hình cục bộ (không gửi request nào).
 * - Request API (polling, refresh) không đụng tới tracker → không gia hạn idle.
 * - Tương tác thật ĐẦU TIÊN sau khi khởi động (login, restore sau reload, tab mới, tab khác mở khoá)
 *   được báo NGAY (review r1 M1): refresh không gia hạn idle, nên không được giả định server đã có mốc.
 * - Sau đó báo tối đa 1 lần / `reportIntervalMs` cho CẢ PHIÊN: tab khác vừa báo trong khoảng này
 *   (mốc `shared`) thì tab này bỏ qua (review r1 L4; server giới hạn 30 lần/phút/phiên — BE Q4).
 *   Tương tác trong khoảng chờ không được báo bù bằng timer; server có thể tính idle sớm hơn tối đa
 *   `reportIntervalMs` so với tương tác cuối.
 * - `pointermove`/`scroll` KHÔNG tính: con trỏ trôi hay trang tự cuộn không phải thao tác.
 * - Idle là của PHIÊN (chung mọi tab): trước khi khoá, lấy mốc muộn nhất giữa tương tác của tab này
 *   và mốc tab khác đã báo (`shared`). Tab bị bỏ quên không khoá người đang làm ở tab khác.
 */

/** Server idle 30 phút (D14 §2). Màn hình khoá cục bộ theo cùng ngưỡng, tính từ tương tác cuối. */
export const IDLE_TIMEOUT_MS = 30 * 60_000

/**
 * Khoảng tối thiểu giữa hai lần `POST /auth/activity` của cả phiên. BE Q4 (#197): server giới hạn
 * 30 lần/phút/phiên (DEV-197-10, số tạm vì R2 không có) và xác nhận 60 giây là phù hợp.
 */
export const ACTIVITY_REPORT_INTERVAL_MS = 60_000

export const INTERACTION_EVENTS = ['pointerdown', 'keydown'] as const

type EventTargetLike = Pick<Window, 'addEventListener' | 'removeEventListener'>
type VisibilitySource = Pick<
  Document,
  'addEventListener' | 'removeEventListener' | 'visibilityState'
>

export type ActivityTrackerOptions = {
  /** Gửi `POST /auth/activity`. Lỗi bị nuốt: 401 do client v1 xử lý, 429/mạng thì bỏ qua. */
  report: () => Promise<unknown>
  /** Hết hạn idle cục bộ — tầng trên khoá phiên (không gọi API). Gọi tối đa một lần. */
  onIdle: () => void
  /** Mốc báo activity dùng chung giữa các tab (localStorage). Không truyền = chỉ tab này. */
  shared?: { read: () => number | null; write: (at: number) => void }
  target?: EventTargetLike
  visibility?: VisibilitySource
  now?: () => number
  idleTimeoutMs?: number
  reportIntervalMs?: number
}

/** Bắt đầu theo dõi; trả hàm dừng (gỡ listener + timer). */
export function startActivityTracker({
  report,
  onIdle,
  shared,
  target = window,
  visibility = document,
  now = Date.now,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
  reportIntervalMs = ACTIVITY_REPORT_INTERVAL_MS,
}: ActivityTrackerOptions): () => void {
  // Mốc idle cục bộ bắt đầu từ lúc khởi động. KHÔNG đặt `lastReport` = bây giờ: tương tác thật đầu
  // tiên phải được báo ngay (sau restore, server có thể đã gần idle).
  let lastInteraction = now()
  let lastReport = Number.NEGATIVE_INFINITY
  let reporting = false
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    INTERACTION_EVENTS.forEach((type) => target.removeEventListener(type, onInteraction, true))
    visibility.removeEventListener('visibilitychange', onVisibility)
  }

  function checkIdle() {
    if (stopped) return
    const elapsed = now() - Math.max(lastInteraction, shared?.read() ?? 0)
    if (elapsed >= idleTimeoutMs) {
      stop()
      onIdle()
      return
    }
    clearTimeout(timer)
    timer = setTimeout(checkIdle, idleTimeoutMs - elapsed)
  }

  function onInteraction() {
    if (stopped) return
    const at = now()
    lastInteraction = at
    if (reporting) return
    // Mốc báo của cả phiên: của tab này hoặc tab khác, lấy cái muộn hơn.
    const sessionLastReport = Math.max(lastReport, shared?.read() ?? Number.NEGATIVE_INFINITY)
    if (at - sessionLastReport < reportIntervalMs) return
    lastReport = at
    reporting = true
    shared?.write(at)
    report()
      .catch(() => {
        // Bỏ qua: không báo lỗi cho người dùng vì một cập nhật kỹ thuật (screen-contracts §Quy tắc chung).
      })
      .finally(() => {
        reporting = false
      })
  }

  // Tab ẩn thì trình duyệt hãm timer — quay lại là kiểm ngay, không đợi timer trễ.
  function onVisibility() {
    if (visibility.visibilityState === 'visible') checkIdle()
  }

  // capture: thao tác trong component chặn lan truyền (stopPropagation) vẫn được tính.
  INTERACTION_EVENTS.forEach((type) => target.addEventListener(type, onInteraction, true))
  visibility.addEventListener('visibilitychange', onVisibility)
  timer = setTimeout(checkIdle, idleTimeoutMs)

  return stop
}
