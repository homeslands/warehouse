export type ApiProxy = Record<string, { target: string; changeOrigin: boolean }>

const PROXY_PREFIX = '/api'

/**
 * Cấu hình proxy cho `vite dev` và `vite preview`. File này được `vite.config.ts` import và chạy
 * trong Node — không import gì khác, không dùng `import.meta.env`.
 *
 * Proxy làm trình duyệt gọi API cùng origin với trang, nên không phụ thuộc `ALLOWED_ORIGINS` của
 * backend (cổng 4173 của `preview` trước đây bị CORS chặn). Không rewrite path: backend đã có sẵn
 * tiền tố `/api/v1`.
 */
export function resolveApiProxy(
  env: Record<string, string | undefined>,
  { mode, command }: { mode: string; command: 'serve' | 'build' },
): ApiProxy | undefined {
  const base = env.VITE_API_BASE_URL?.trim() ?? ''
  const target = env.VITE_API_PROXY_TARGET?.trim() ?? ''
  const isRelative = base.startsWith('/')

  // Chỉ kiểm khi `serve` (`vite dev` và `vite preview`) — nơi proxy thật sự được dùng. `vite build`
  // với base tương đối là hợp lệ: production đặt sau reverse proxy chuyển `/api` về backend.
  // Không kiểm khi test: Vitest đặt VITE_API_BASE_URL tuyệt đối trong vite.config.ts.
  if (isRelative && command === 'serve' && mode !== 'test') {
    if (target === '') {
      throw new Error(
        `VITE_API_BASE_URL là đường dẫn tương đối (${base}) nhưng VITE_API_PROXY_TARGET trống — ` +
          'mọi request sẽ 404. Đặt VITE_API_PROXY_TARGET=http://localhost:8085 trong .env, ' +
          'hoặc đổi VITE_API_BASE_URL thành URL đầy đủ.',
      )
    }
    if (!base.startsWith(PROXY_PREFIX)) {
      throw new Error(
        `VITE_API_BASE_URL tương đối phải bắt đầu bằng ${PROXY_PREFIX} (đang là ${base}) — proxy chỉ chuyển tiếp ${PROXY_PREFIX}.`,
      )
    }
  }

  if (target === '') return undefined
  return { [PROXY_PREFIX]: { target: target.replace(/\/+$/, ''), changeOrigin: true } }
}
