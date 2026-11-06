import { readFileSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

/**
 * Đọc grant fixture do harness BE (`npm run test:e2e:serve` trong app/warehouse-api) ghi ra cho
 * mỗi lần seed. File này chứa mật khẩu actor ⇒ chỉ đọc qua biến môi trường, không copy vào repo,
 * không in ra log/report. Thiếu biến hoặc sai định dạng ⇒ ném lỗi (fail-closed), không skip test.
 */
export const FIXTURE_SECRET_ENV = 'WH_E2E_FIXTURE_SECRET_FILE'

export type ActorAlias =
  | 'ADMIN'
  | 'MANAGER_AB'
  | 'MANAGER_A'
  | 'MANAGER_C'
  | 'SUP_A1'
  | 'SUP_A2'
  | 'SUP_B'
  | 'SUP_A_NO_EXPORT'

export type WarehouseAlias = 'A' | 'B' | 'C'

export type Actor = { alias: ActorAlias; id: string; phonenumber: string; password: string }

export type RealApiFixture = {
  /** `http://127.0.0.1:<port>/api/v1` — origin của API thật do harness listen. */
  baseUrl: string
  targetId: string
  fixtureVersion: string
  warehouses: Record<WarehouseAlias, string>
  actor(alias: ActorAlias): Actor
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

const fail = (message: string): never => {
  throw new Error(`[e2e real-api] ${message}`)
}

/** Chỉ chấp nhận API trên loopback: smoke này không bao giờ được chạy vào sandbox/production. */
export function assertLoopbackApi(baseUrl: string): URL {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return fail('baseUrl in fixture file is not a URL')
  }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname))
    fail('baseUrl must be http on loopback (harness serve listens on 127.0.0.1 only)')
  return url
}

/** Đường dẫn file grant, hoặc `undefined` nếu chưa đặt biến (config vẫn nạp được để `--list`). */
export function fixtureSecretPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const path = env[FIXTURE_SECRET_ENV]?.trim()
  return path ? path : undefined
}

let cached: RealApiFixture | undefined

export function loadRealApiFixture(env: NodeJS.ProcessEnv = process.env): RealApiFixture {
  if (cached) return cached
  const path = fixtureSecretPath(env)
  if (!path)
    return fail(
      `${FIXTURE_SECRET_ENV} is not set — start \`npm run test:e2e:serve\` in app/warehouse-api ` +
        'and point this variable at its fixture file (REAL_API smoke has no offline fallback)',
    )
  if (!isAbsolute(path)) fail(`${FIXTURE_SECRET_ENV} must be an absolute path`)

  let mode: number
  try {
    mode = statSync(path).mode
  } catch {
    return fail(`${FIXTURE_SECRET_ENV} is not readable (harness stopped or file removed?)`)
  }
  if ((mode & 0o077) !== 0) fail(`${FIXTURE_SECRET_ENV} must not be group/other accessible`)

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fail(`${FIXTURE_SECRET_ENV} is not valid JSON`)
  }
  const data = raw as Partial<{
    baseUrl: string
    targetId: string
    fixtureVersion: string
    warehouses: Record<WarehouseAlias, string>
    actors: Record<string, { id: string; phonenumber: string; password: string }>
  }>
  if (typeof data.baseUrl !== 'string') fail('fixture file has no baseUrl')
  if (typeof data.targetId !== 'string') fail('fixture file has no targetId')
  if (typeof data.fixtureVersion !== 'string') fail('fixture file has no fixtureVersion')
  if (!data.warehouses || !data.actors) fail('fixture file has no warehouses/actors')
  assertLoopbackApi(data.baseUrl!)

  const actors = data.actors!
  cached = {
    baseUrl: data.baseUrl!.replace(/\/+$/, ''),
    targetId: data.targetId!,
    fixtureVersion: data.fixtureVersion!,
    warehouses: data.warehouses!,
    actor(alias) {
      const entry = actors[alias]
      if (!entry?.phonenumber || !entry.password) return fail(`actor ${alias} missing in fixture`)
      return { alias, id: entry.id, phonenumber: entry.phonenumber, password: entry.password }
    },
  }
  return cached
}
