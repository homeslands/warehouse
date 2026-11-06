import { theme, type ConfigProviderProps, type ThemeConfig } from 'antd'
import enUS from 'antd/locale/en_US'
import viVN from 'antd/locale/vi_VN'
import { designTokens as t } from '@/shared/config/design-tokens'
import type { SupportedLanguage } from '@/shared/i18n'

export type AntdThemeMode = 'light' | 'dark'
export type AntdLocale = NonNullable<ConfigProviderProps['locale']>

/**
 * Token không phụ thuộc sáng/tối: màu chủ đạo, bo góc, cỡ chữ, chiều cao control.
 *
 * `fontFamily: 'inherit'` — hợp đồng chưa có font; để component Ant Design dùng cùng font với
 * phần UI hiện có (`body` đặt `font-sans` trong `app/styles/index.css`), tránh hai kiểu chữ
 * trong lúc chuyển dần.
 *
 * Chưa ánh xạ: `spaceBasePx` (lưới khoảng cách mặc định của Ant Design đã là bội 4/8) và
 * `mobileTouchMinPx` (phụ thuộc breakpoint, xử lý ở component khi màn đầu tiên dùng tới).
 */
const sharedToken: ThemeConfig['token'] = {
  colorPrimary: t.primary,
  borderRadius: t.radiusPx,
  fontFamily: 'inherit',
  fontSize: t.fontBodyPx,
  fontSizeSM: t.fontMetadataPx,
  controlHeight: t.desktopControlPx,
}

/** Bảng màu sáng có trong hợp đồng — chỉ áp ở chế độ sáng. */
const lightToken: ThemeConfig['token'] = {
  colorTextBase: t.text,
  colorText: t.text,
  colorTextSecondary: t.muted,
  colorTextDescription: t.muted,
  colorBgLayout: t.background,
  colorBgContainer: t.surface,
}

const components: ThemeConfig['components'] = {
  Table: { cellFontSize: t.fontTablePx },
}

export function getAntdTheme(mode: AntdThemeMode): ThemeConfig {
  if (mode === 'dark') {
    // Hợp đồng chưa có bảng màu tối: để thuật toán tối của Ant Design suy ra nền/chữ.
    return { algorithm: theme.darkAlgorithm, token: { ...sharedToken }, components }
  }
  return {
    algorithm: theme.defaultAlgorithm,
    token: { ...sharedToken, ...lightToken },
    components,
  }
}

const LOCALES: Record<SupportedLanguage, AntdLocale> = { vi: viVN, en: enUS }

/** Ngôn ngữ ngoài danh sách hỗ trợ → tiếng Việt, cùng `fallbackLng` của i18n. */
export function getAntdLocale(language: string | undefined): AntdLocale {
  return language === 'en' ? LOCALES.en : LOCALES.vi
}
