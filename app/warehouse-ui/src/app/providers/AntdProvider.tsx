import { ConfigProvider } from 'antd'
import { useTheme } from 'next-themes'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getAntdLocale, getAntdTheme } from '@/shared/ui/antd-theme'

/**
 * ConfigProvider của Ant Design theo design tokens R2. Không giữ state riêng:
 * - sáng/tối đọc từ `next-themes` (`resolvedTheme`, đã quy `system` về light/dark) — cùng nguồn
 *   với nút đổi giao diện và lớp `.dark` của Tailwind;
 * - ngôn ngữ đọc từ i18next — `useTranslation` render lại khi `languageChanged`.
 * Phải nằm TRONG `ThemeProvider` của next-themes.
 */
export function AntdProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme()
  const { i18n } = useTranslation()
  const mode = resolvedTheme === 'dark' ? 'dark' : 'light'
  const language = i18n.resolvedLanguage ?? i18n.language

  const themeConfig = useMemo(() => getAntdTheme(mode), [mode])
  const locale = getAntdLocale(language)

  return (
    <ConfigProvider theme={themeConfig} locale={locale}>
      {children}
    </ConfigProvider>
  )
}
