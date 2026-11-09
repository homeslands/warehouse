/**
 * TẠM THỜI (quyết định 2026-11-09): tắt bước kiểm hàng (vòng tròn đánh dấu, bộ lọc, tiến độ "đã kiểm
 * n/m", chặn Xác nhận khi còn dòng chưa kiểm) trước khi duyệt phiếu. Màn vẫn mở như cũ nhưng gọi là
 * "Duyệt phiếu" và "Xác nhận" bật không cần đánh dấu (vẫn hỏi lại, cảnh báo cộng tồn ngay).
 * Bật lại: đổi thành `true` — toàn bộ code checklist còn nguyên.
 */
export const RECEIVE_CHECKLIST_ENABLED: boolean = false
