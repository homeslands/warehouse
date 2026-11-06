import {
  V1_AUTH_PATHS,
  assertLoginResult,
  v1Get,
  v1Post,
  type V1ActionResult,
  type V1LoginBody,
  type V1LoginResult,
  type V1User,
} from '@/shared/api/v1'

/**
 * Operation auth v1 (OpenAPI R2). CHỈ gọi khi cờ `apiV1Auth` bật — API v1 chưa chạy trên main.
 * `refresh` không ở đây: nó nằm trong client v1 (`shared/api/v1/client.ts`) vì interceptor 401 cần.
 */

/** operationId `login`. 401 = sai thông tin (thông điệp chung, TC-AUTH-02), 429 = vượt 20/phút. */
export async function loginRequestV1(body: V1LoginBody): Promise<V1LoginResult> {
  return assertLoginResult(await v1Post<unknown>(V1_AUTH_PATHS.login, body))
}

/** operationId `logout` — server thu hồi phiên + xoá cookie. */
export const logoutRequestV1 = (): Promise<V1ActionResult> =>
  v1Post<V1ActionResult>(V1_AUTH_PATHS.logout)

/** operationId `logoutall`. */
export const logoutAllRequestV1 = (): Promise<V1ActionResult> =>
  v1Post<V1ActionResult>(V1_AUTH_PATHS.logoutAll)

/**
 * operationId `lock`. Đi qua interceptor v1: access token hết hạn (401) thì refresh MỘT lần rồi gửi
 * lại (review r1 M2) — để server thật sự khoá phiên chứ không chỉ che màn hình.
 */
export const lockRequestV1 = (): Promise<V1ActionResult> =>
  v1Post<V1ActionResult>(V1_AUTH_PATHS.lock)

/** operationId `recordInteractiveActivity` — CHỈ gọi từ tương tác thật (activity-tracker). */
export const recordActivityV1 = (): Promise<V1ActionResult> =>
  v1Post<V1ActionResult>(V1_AUTH_PATHS.activity)

/** operationId `getProfile`. Dùng qua React Query ở M03 (UI-03); M02 chỉ khai. */
export const fetchProfileV1 = (): Promise<V1User> => v1Get<V1User>(V1_AUTH_PATHS.me)
