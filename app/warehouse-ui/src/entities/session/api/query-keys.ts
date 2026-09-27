/** Key của hồ sơ và danh sách phiên. Xem `entities/example/api/query-keys.ts` cho mẫu chung. */
export const sessionKeys = {
  all: ['session'] as const,
  profile: () => [...sessionKeys.all, 'profile'] as const,
  devices: () => [...sessionKeys.all, 'devices'] as const,
}
