import 'reflect-metadata';
import { validate } from './env.validation';

describe('env validation — BARCODE_PREFIX', () => {
  /** Đủ mọi biến bắt buộc, để chỉ `BARCODE_PREFIX` quyết định pass/fail. */
  const baseEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    VERSION: 'v1',
    DATABASE_HOST: 'localhost',
    DATABASE_PORT: '3306',
    DATABASE_USERNAME: 'root',
    DATABASE_PASSWORD: 'root',
    DATABASE_NAME: 'warehouse_db',
    SALT_ROUNDS: '10',
    DURATION: '3600',
    REFRESHABLE_DURATION: '86400',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    SESSION_SECRET: 'x',
    JWT_SECRET: 'x',
    MAIL_HOST: 'x',
    MAIL_USER: 'x',
    MAIL_PASSWORD: 'x',
    MAIL_FROM: 'x',
    GOOGLE_MAP_API_URL: 'x',
    GOOGLE_MAPS_API_KEY: 'x',
    FIREBASE_PROJECT_ID: 'x',
    FIREBASE_CLIENT_EMAIL: 'x',
    FIREBASE_PRIVATE_KEY: 'x',
    ALLOWED_ORIGINS: 'http://localhost',
  };

  it('is optional (code falls back to 20)', () => {
    expect(() => validate(baseEnv)).not.toThrow();
  });

  it.each(['20', '29', '05'])('accepts 2 digits %p', (prefix) => {
    expect(validate({ ...baseEnv, BARCODE_PREFIX: prefix }).BARCODE_PREFIX).toBe(prefix);
  });

  // Sai format phải chết lúc boot, không phải sinh mã vạch hỏng (sai độ dài / có chữ).
  it.each(['2', '200', 'AB', '2A'])('rejects %p at boot', (prefix) => {
    expect(() => validate({ ...baseEnv, BARCODE_PREFIX: prefix })).toThrow(/BARCODE_PREFIX/);
  });
});
