import { randomBytes } from 'crypto';
import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HarnessTarget, HarnessTargetError } from './target';

/** Giá trị đánh dấu cho provider ra ngoài bị vô hiệu — không routable, không phải credential thật. */
export const SIMULATED = 'SIMULATED';
/** Prefix legacy `api/${VERSION}` (main.ts). Trùng chữ "v1" với contract R2 nhưng KHÔNG phải `/api/v1` typed R2. */
export const LEGACY_VERSION = 'v1';
export const HARNESS_ROOT_PHONENUMBER = 'e2e-root';

const secret = () => randomBytes(32).toString('hex');

/**
 * `ConfigModule.forRoot()` của AppModule tự nạp `.env` từ `process.cwd()`. Chuyển cwd sang thư mục
 * tạm rỗng để chắc chắn không file `.env` nào (của dev/prod) được nạp, rồi assert lại.
 */
export function isolateWorkingDirectory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wh-e2e-cwd-'));
  process.chdir(dir);
  if (existsSync(join(process.cwd(), '.env')))
    throw new HarnessTargetError('.env visible from harness working directory');
  return dir;
}

/**
 * Đặt ĐẦY ĐỦ biến app cần từ target đã guard. Secret (JWT/session/root password) sinh ngẫu nhiên
 * mỗi run, không ghi ra đâu. Mail/Firebase/Google/AWS nhận `SIMULATED` — provider tương ứng bị
 * override trong composition, giá trị này chỉ để qua `env.validation`.
 */
export function applyHarnessEnv(target: HarnessTarget): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '0',
    VERSION: LEGACY_VERSION,
    DATABASE_HOST: target.mysql.host,
    DATABASE_PORT: String(target.mysql.port),
    DATABASE_USERNAME: target.mysql.user,
    DATABASE_PASSWORD: target.mysql.password,
    DATABASE_NAME: target.mysql.database,
    SALT_ROUNDS: '12',
    DURATION: '3600',
    REFRESHABLE_DURATION: '86400',
    REDIS_HOST: target.redis.host,
    REDIS_PORT: String(target.redis.port),
    REDIS_AUTH_DB: '1',
    SESSION_SECRET: secret(),
    JWT_SECRET: secret(),
    ROOT_PHONENUMBER: HARNESS_ROOT_PHONENUMBER,
    ROOT_PASSWORD: secret(),
    MAIL_HOST: SIMULATED,
    MAIL_USER: SIMULATED,
    MAIL_PASSWORD: SIMULATED,
    MAIL_FROM: SIMULATED,
    GOOGLE_MAP_API_URL: 'http://simulated.invalid',
    GOOGLE_MAPS_API_KEY: SIMULATED,
    FIREBASE_PROJECT_ID: SIMULATED,
    FIREBASE_CLIENT_EMAIL: SIMULATED,
    FIREBASE_PRIVATE_KEY: SIMULATED,
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: SIMULATED,
    AWS_SECRET_ACCESS_KEY: SIMULATED,
    AWS_BUCKET: SIMULATED,
    VIETQR_BUSINESS_API_URL: 'http://simulated.invalid',
    ALLOWED_ORIGINS: 'http://localhost',
  });
}
