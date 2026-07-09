export type Env = { apiBaseUrl: string }

export function readEnv(raw: Record<string, unknown>): Env {
  const value = raw.VITE_API_BASE_URL

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      'Thiếu biến môi trường VITE_API_BASE_URL. Chạy `cp .env.example .env` rồi điền giá trị.',
    )
  }

  return { apiBaseUrl: value.trim().replace(/\/+$/, '') }
}

let cached: Env | null = null

/**
 * Đọc và validate biến môi trường một lần, có nhớ kết quả (lazy + memoized).
 *
 * Không dùng `export const env = readEnv(import.meta.env)` ở top-level vì điều đó
 * khiến `import.meta.env` bị đánh giá ngay lúc module được import — kể cả khi module
 * này chỉ được import để lấy `readEnv` cho việc test. Nếu VITE_API_BASE_URL vắng mặt
 * (ví dụ trên CI runner không có file .env), lỗi sẽ ném ra ngay lúc load module,
 * làm chết cả file test trước khi bất kỳ assertion nào chạy — sai lệch hoàn toàn so
 * với triệu chứng mong đợi. Trì hoãn việc đọc `import.meta.env` tới lần gọi đầu tiên
 * giúp `readEnv` được test độc lập với sự tồn tại của `.env`.
 */
export function getEnv(): Env {
  cached ??= readEnv(import.meta.env as unknown as Record<string, unknown>)
  return cached
}
