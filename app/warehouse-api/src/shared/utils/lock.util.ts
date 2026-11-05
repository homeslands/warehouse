/**
 * Khoá dòng `SELECT ... FOR UPDATE` cho luồng đọc-rồi-ghi trong transaction (BE-TX-02). Lý do khoá
 * của từng luồng ghi ở chỗ dùng.
 */
export const WRITE_LOCK = { mode: 'pessimistic_write' } as const;
