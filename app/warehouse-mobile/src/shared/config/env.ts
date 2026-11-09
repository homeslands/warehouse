export type AppVariant = 'development' | 'preview' | 'production'

export type Env = { apiBaseUrl: string; variant: AppVariant }

const VARIANTS: readonly AppVariant[] = ['development', 'preview', 'production']

export function readEnv(raw: Record<string, string | undefined>): Env {
  const url = raw.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!url) {
    throw new Error('Thiếu biến môi trường EXPO_PUBLIC_API_BASE_URL')
  }
  const v = raw.EXPO_PUBLIC_APP_VARIANT?.trim()
  const variant = VARIANTS.find((x) => x === v) ?? 'development'
  return { apiBaseUrl: url, variant }
}

let cached: Env | undefined

export function getEnv(): Env {
  // Expo chỉ nhúng biến EXPO_PUBLIC_* khi truy cập tĩnh (process.env.TÊN).
  cached ??= readEnv({
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT,
  })
  return cached
}

const HOST = /^[a-z][a-z\d+.-]*:\/\/([^/?#:]+)/i

/**
 * Bản không phải dữ liệu thật: host API chứa "sandbox" HOẶC không phải bản production. Dùng để hiện
 * nhãn SANDBOX; production trỏ URL thật thì ẩn.
 */
export function isSandbox(env: Env): boolean {
  const host = HOST.exec(env.apiBaseUrl)?.[1] ?? ''
  return host.toLowerCase().includes('sandbox') || env.variant !== 'production'
}
