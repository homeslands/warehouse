export type ColorTokens = {
  background: string
  foreground: string
  card: string
  primary: string
  primaryForeground: string
  muted: string
  mutedForeground: string
  border: string
  input: string
  ring: string
  destructive: string
  success: string
  warning: string
  info: string
  /** Xanh dương hệ thống (nút tạo nổi) + chữ/icon trên nó. */
  accent: string
  accentForeground: string
  /** Nền + chữ viên nhãn xanh dương nhạt (dòng "Mới" thêm trên máy). */
  accentSoft: string
  accentText: string
  /** Lớp phủ bán trong suốt trên nền kính của sheet iOS (đục hơn kính trần, vẫn thấy kính). */
  sheetTint: string
  /** Nền ĐẶC của sheet iOS < 26 (không có kính) = `grouped` cả 2 theme, để thẻ `card` trong sheet vẫn nổi. */
  sheetSolid: string
  /** Nền màn kiểu "Cài đặt" iOS (nhóm thẻ trắng trên nền xám). */
  grouped: string
  /** Đường kẻ giữa các dòng trong một nhóm. */
  separator: string
  /** Chữ tiêu đề/chú thích của nhóm. */
  groupedLabel: string
  /** Nền trung tính của ô icon nhạt, chip, ô tìm kiếm. */
  fill: string
  /** Chữ/icon trên nền `fill`. */
  fillForeground: string
  /** Mũi tên ">" cuối dòng. */
  chevron: string
  /** Nền ô icon của dòng nguy hiểm (đăng xuất); nền nhãn "Hết hàng". */
  destructiveSoft: string
  /** Chữ đỏ nhỏ trên nền nhạt (viên nhãn "Hết", tổng quan): đậm hơn `destructive` để đạt AA. */
  destructiveText: string
  /** Nền + chữ nhãn cảnh báo nhạt ("Dưới min"): chữ đậm hơn `warning` để đủ tương phản. */
  warningSoft: string
  warningText: string
  /** Nền + chữ nhãn thông tin nhạt ("Vượt max"). */
  infoSoft: string
  infoText: string
  /** Nền vùng "bình thường" của thanh min/max; nền ô icon "Nhập kho". */
  successSoft: string
  /** Chữ xanh đủ tương phản trên nền thẻ (số "+48" của lịch sử). */
  successText: string
  /** Con trượt của segmented control (trên nền `fill`). */
  segmentThumb: string
  /** Vòng sáng quanh ô đang nhập. */
  ringSoft: string
  /** Nền dòng danh sách khi đang bấm. */
  rowPressed: string
  /** Nền thanh tab đáy. */
  tabBar: string
  /** Nhãn phía trên ô nhập. */
  fieldLabel: string
  /** Nền ô chọn riêng lẻ trên nền sheet (thẻ kho chưa chọn). */
  cell: string
  /** Nền thẻ khi đang nhấn (thẻ kho trong sheet). */
  cellPressed: string
  /** Vòng tròn chọn (radio) chưa chọn. */
  radioRing: string
  /** Nền avatar lớn (gradient CSS, RN New Architecture) và chữ/icon trên nó. */
  avatarGradient: string
  avatarForeground: string
  /** Màu nền đặc của avatar khi không vẽ được gradient (chữ `avatarForeground` vẫn đọc được). */
  avatarFallback: string
}

export const lightColors: ColorTokens = {
  background: '#ffffff',
  foreground: '#0a0a0a',
  card: '#ffffff',
  primary: '#171717',
  primaryForeground: '#fafafa',
  muted: '#f5f5f5',
  mutedForeground: '#737373',
  border: '#e5e5e5',
  input: '#e5e5e5',
  ring: '#a1a1a1',
  destructive: '#e7000b',
  success: '#009966',
  warning: '#d08700',
  info: '#2e7dd7',
  accent: '#007aff',
  accentForeground: '#ffffff',
  accentSoft: '#e5f0ff',
  accentText: '#0060df',
  sheetTint: 'rgba(242,242,247,0.6)',
  sheetSolid: '#f2f2f7',
  grouped: '#f2f2f7',
  separator: '#e4e4e7',
  groupedLabel: '#6b6b70',
  fill: '#eeeeef',
  fillForeground: '#3f3f46',
  chevron: '#c4c4c7',
  destructiveSoft: '#fde8e8',
  destructiveText: '#c50009',
  warningSoft: '#fdf3d6',
  warningText: '#8a5a00',
  infoSoft: '#e9f1fd',
  infoText: '#1f4f9e',
  successSoft: '#ddf4ea',
  successText: '#007a55',
  segmentThumb: '#ffffff',
  ringSoft: 'rgba(23,23,23,0.08)',
  rowPressed: '#e5e5ea',
  tabBar: '#f9f9fa',
  fieldLabel: '#3f3f46',
  cell: '#f8f8fa',
  cellPressed: '#ececf0',
  radioRing: '#c7c7cc',
  avatarGradient: 'linear-gradient(160deg, #3f3f46, #0a0a0a)',
  avatarForeground: '#fafafa',
  avatarFallback: '#27272a',
}

export const darkColors: ColorTokens = {
  background: '#0a0a0a',
  foreground: '#fafafa',
  card: '#1c1c1e',
  primary: '#e5e5e5',
  primaryForeground: '#171717',
  muted: '#262626',
  mutedForeground: '#a1a1a1',
  border: 'rgba(255,255,255,0.10)',
  input: 'rgba(255,255,255,0.15)',
  ring: '#737373',
  destructive: '#ff6467',
  success: '#00bc7d',
  warning: '#fe9a00',
  info: '#51a2ff',
  accent: '#0a84ff',
  accentForeground: '#ffffff',
  accentSoft: 'rgba(10,132,255,0.18)',
  accentText: '#6cb4ff',
  sheetTint: 'rgba(28,28,30,0.6)',
  sheetSolid: '#000000',
  grouped: '#000000',
  separator: '#38383a',
  groupedLabel: '#8e8e93',
  fill: '#2c2c2e',
  fillForeground: '#d4d4d8',
  chevron: '#5a5a5e',
  destructiveSoft: 'rgba(255,100,103,0.16)',
  destructiveText: '#ff6467',
  warningSoft: 'rgba(254,154,0,0.16)',
  warningText: '#fcbb4a',
  infoSoft: 'rgba(81,162,255,0.16)',
  infoText: '#8ec5ff',
  successSoft: 'rgba(0,188,125,0.18)',
  successText: '#5ee9b5',
  segmentThumb: '#636366',
  ringSoft: 'rgba(250,250,250,0.14)',
  rowPressed: '#2c2c2e',
  tabBar: '#121212',
  fieldLabel: '#a1a1aa',
  cell: '#242426',
  cellPressed: '#3a3a3c',
  radioRing: '#48484a',
  avatarGradient: 'linear-gradient(160deg, #52525b, #27272a)',
  avatarForeground: '#fafafa',
  avatarFallback: '#3f3f46',
}

export const radius = { sm: 6, md: 8, lg: 10, group: 12, groupLarge: 26, xl: 14 } as const
