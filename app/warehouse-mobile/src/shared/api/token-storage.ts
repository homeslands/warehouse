import * as SecureStore from 'expo-secure-store'

/**
 * Nơi DUY NHẤT giữ token. Bộ nhớ là nguồn sự thật ĐỒNG BỘ (interceptor gọi `getTokens()` trên MỌI
 * request, không thể await); SecureStore chỉ là bản lưu bền để sống qua lần mở app sau.
 *
 * Ghi SecureStore là fire-and-forget nhưng được xếp hàng tuần tự: `setTokens` rồi `clearTokens`
 * liền nhau không được để lần ghi cũ về đích sau lần xoá. Lỗi ghi bị nuốt (có log) — token vẫn
 * nằm trong bộ nhớ nên phiên hiện tại chạy bình thường, tệ nhất là phải đăng nhập lại lần mở sau.
 */

export type TokenPair = { accessToken: string; refreshToken: string }

export const TOKEN_STORAGE_KEY = 'warehouse.auth'

type Listener = (pair: TokenPair | null) => void
const listeners = new Set<Listener>()

let current: TokenPair | null = null
/** `setTokens`/`clearTokens` đã chạy: `hydrateTokens` đang bay không được ghi đè giá trị mới hơn. */
let touched = false
let writeQueue: Promise<void> = Promise.resolve()

function parse(raw: string | null): TokenPair | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { accessToken, refreshToken } = value as Record<string, unknown>
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null
    if (accessToken === '' || refreshToken === '') return null
    return { accessToken, refreshToken }
  } catch {
    return null
  }
}

function persist(op: () => Promise<void>): void {
  writeQueue = writeQueue
    .then(op)
    .catch((e: unknown) => console.warn('[token-storage] Ghi SecureStore thất bại', e))
}

function notify(pair: TokenPair | null): void {
  listeners.forEach((listener) => listener(pair))
}

/**
 * Gọi một lần lúc khởi động, trước khi quyết định hiện màn nào. Không báo `subscribe` — nơi gọi
 * nhận giá trị trả về. Đọc SecureStore lỗi thì coi như chưa đăng nhập.
 */
export async function hydrateTokens(): Promise<TokenPair | null> {
  let pair: TokenPair | null = null
  try {
    pair = parse(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY))
  } catch (e) {
    console.warn('[token-storage] Đọc SecureStore thất bại', e)
  }
  // Trong lúc chờ đọc, người dùng đã đăng nhập/đăng xuất: bộ nhớ mới hơn bản lưu.
  if (touched) return current
  current = pair
  return current
}

export function getTokens(): TokenPair | null {
  return current
}

export function setTokens(pair: TokenPair): void {
  touched = true
  current = { accessToken: pair.accessToken, refreshToken: pair.refreshToken }
  const raw = JSON.stringify(current)
  persist(() => SecureStore.setItemAsync(TOKEN_STORAGE_KEY, raw))
  notify(current)
}

export function clearTokens(): void {
  touched = true
  current = null
  persist(() => SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY))
  notify(null)
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
