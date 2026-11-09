import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

/**
 * Bộ định tuyến axios tự viết dùng chung cho test của slice (cùng cách `shared/api/http.test.ts`).
 * `http` thừa hưởng `axios.defaults.adapter` LÚC TẠO → file test phải import module này TRƯỚC mọi
 * module kéo `@/shared/api/http` vào (thứ tự import được giữ nguyên khi biên dịch sang CJS).
 */
export type Reply = { status: number; data?: unknown } | 'network' | 'hang'
type Handler = (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>

const routes = new Map<string, Handler>()
export const calls: { method: string; url: string; auth: string | undefined }[] = []

export const route = (method: string, url: string, handler: Handler) =>
  routes.set(`${method} ${url}`, handler)

export const resetFakeApi = () => {
  routes.clear()
  calls.length = 0
}

export const callsTo = (method: string, url: string) =>
  calls.filter((c) => c.method === method && c.url === url)

async function fakeAdapter(config: InternalAxiosRequestConfig) {
  const method = (config.method ?? 'get').toLowerCase()
  const url = config.url ?? ''
  const auth = config.headers.get('Authorization')
  calls.push({ method, url, auth: typeof auth === 'string' ? auth : undefined })

  const handler = routes.get(`${method} ${url}`)
  if (!handler) throw new Error(`Chưa khai route: ${method} ${url}`)
  const reply = await handler(config)
  if (reply === 'hang') {
    // Như axios thật: có `timeout` thì treo đến hạn rồi báo ECONNABORTED (không có response).
    return new Promise<never>((_, reject) => {
      if (config.timeout)
        setTimeout(
          () => reject(new AxiosError('timeout', AxiosError.ECONNABORTED, config)),
          config.timeout,
        )
    })
  }
  if (reply === 'network') throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)

  const response = { data: reply.data, status: reply.status, statusText: '', headers: {}, config }
  if (reply.status >= 200 && reply.status < 300) return response
  throw new AxiosError(
    `Request failed with status code ${reply.status}`,
    reply.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    response,
  )
}

axios.defaults.adapter = fakeAdapter

export const ok = (result: unknown = {}): Reply => ({
  status: 200,
  data: { message: 'ok', statusCode: 200, timestamp: '', result },
})

export const failure = (status: number, code?: number): Reply => ({
  status,
  data: {
    statusCode: status,
    ...(code ? { code } : {}),
    timestamp: '',
    path: '',
    method: 'GET',
    message: 'x',
  },
})

export const refreshed = (accessToken: string, refreshToken = 'ref-2'): Reply =>
  ok({ accessToken, refreshToken, expireTime: '', expireTimeRefreshToken: '' })

export const profile = (over: object = {}) => ({
  userSlug: 'root',
  userName: 'root',
  phonenumber: 'root',
  firstName: '',
  lastName: '',
  roleName: 'MANAGER',
  scope: ['USER_READ'],
  warehouses: [{ slug: 'wh-1', code: 'WH1', name: 'Kho 1', isManager: true }],
  ...over,
})
