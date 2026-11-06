/**
 * Design tokens R2 — bản sao của `docs/project/baseline/contracts/design-tokens.json` (D07/D08).
 * App tự chứa (không import file ngoài `app/warehouse-ui` lúc build), nên giữ bản sao ở đây;
 * `design-tokens.test.ts` so với file hợp đồng để chặn lệch. Đổi token: đổi hợp đồng trước.
 *
 * Hợp đồng chỉ có bảng màu SÁNG. Chế độ tối dùng thuật toán tối của Ant Design (xem
 * `shared/ui/antd-theme.ts`) — chưa có token tối được duyệt.
 */
export const designTokens = {
  fontBodyPx: 16,
  fontTablePx: 14,
  fontMetadataPx: 12,
  mobileTouchMinPx: 44,
  desktopControlPx: 32,
  spaceBasePx: 8,
  radiusPx: 8,
  primary: '#1677ff',
  surface: '#ffffff',
  background: '#f5f7fa',
  text: '#172b3a',
  muted: '#617784',
  status: {
    DRAFT: '#1677ff',
    SUBMITTED: '#ad6800',
    CONFIRMED: '#237804',
    CANCELLED: '#667780',
    IN_PROGRESS: '#ad6800',
    COMPLETED: '#237804',
  },
} as const

export type DesignTokens = typeof designTokens
export type DocumentStatusToken = keyof DesignTokens['status']
