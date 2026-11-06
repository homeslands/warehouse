import { theme } from 'antd'
import { describe, expect, it } from 'vitest'
import { designTokens } from '@/shared/config/design-tokens'
import { getAntdLocale, getAntdTheme } from './antd-theme'

describe('getAntdTheme', () => {
  it('light: ánh xạ màu/bo góc/cỡ chữ/control và bảng màu sáng từ design tokens', () => {
    const config = getAntdTheme('light')

    expect(config.algorithm).toBe(theme.defaultAlgorithm)
    expect(config.token).toMatchObject({
      colorPrimary: designTokens.primary,
      borderRadius: designTokens.radiusPx,
      fontSize: designTokens.fontBodyPx,
      fontSizeSM: designTokens.fontMetadataPx,
      controlHeight: designTokens.desktopControlPx,
      colorText: designTokens.text,
      colorTextSecondary: designTokens.muted,
      colorBgLayout: designTokens.background,
      colorBgContainer: designTokens.surface,
    })
    expect(config.components?.Table?.cellFontSize).toBe(designTokens.fontTablePx)
  })

  it('dark: thuật toán tối, giữ token chung nhưng KHÔNG áp nền/chữ sáng của hợp đồng', () => {
    const config = getAntdTheme('dark')

    expect(config.algorithm).toBe(theme.darkAlgorithm)
    expect(config.token).toMatchObject({
      colorPrimary: designTokens.primary,
      borderRadius: designTokens.radiusPx,
      fontSize: designTokens.fontBodyPx,
    })
    for (const key of ['colorText', 'colorTextBase', 'colorBgLayout', 'colorBgContainer']) {
      expect(config.token).not.toHaveProperty(key)
    }
  })

  it('dark tính ra nền tối thật (không lẫn #ffffff của chế độ sáng)', () => {
    const dark = theme.getDesignToken(getAntdTheme('dark'))
    const light = theme.getDesignToken(getAntdTheme('light'))

    expect(light.colorBgContainer).toBe(designTokens.surface)
    expect(dark.colorBgContainer).not.toBe(designTokens.surface)
    // Seed vẫn là `primary` của hợp đồng; thuật toán tối tự hạ sắc độ cho nền tối.
    expect(dark.colorPrimary).toBe(
      theme.getDesignToken({
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: designTokens.primary },
      }).colorPrimary,
    )
  })
})

describe('getAntdLocale', () => {
  it.each([
    ['vi', 'vi'],
    ['en', 'en'],
    ['fr', 'vi'],
    [undefined, 'vi'],
  ])('%s → locale Ant Design %s', (language, expected) => {
    expect(getAntdLocale(language).locale).toBe(expected)
  })
})
