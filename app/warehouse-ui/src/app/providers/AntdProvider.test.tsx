import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, theme } from 'antd'
import { ThemeProvider, useTheme } from 'next-themes'
import { useContext } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { designTokens } from '@/shared/config/design-tokens'
import { AntdProvider } from './AntdProvider'

function Probe() {
  const { token } = theme.useToken()
  const { locale } = useContext(ConfigProvider.ConfigContext)
  const { setTheme } = useTheme()
  return (
    <div>
      <span>bg={token.colorBgContainer}</span>
      <span>primary={token.colorPrimary}</span>
      <span>font={token.fontSize}</span>
      <span>radius={token.borderRadius}</span>
      <span>locale={locale?.locale}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AntdProvider>
        <Probe />
      </AntdProvider>
    </ThemeProvider>,
  )
}

afterEach(async () => {
  await act(() => i18n.changeLanguage('vi'))
})

describe('AntdProvider', () => {
  it('system (matchMedia sáng) → theme sáng theo design tokens, locale vi', () => {
    renderProvider()

    expect(screen.getByText(`bg=${designTokens.surface}`)).toBeInTheDocument()
    expect(screen.getByText(`primary=${designTokens.primary}`)).toBeInTheDocument()
    expect(screen.getByText(`font=${designTokens.fontBodyPx}`)).toBeInTheDocument()
    expect(screen.getByText(`radius=${designTokens.radiusPx}`)).toBeInTheDocument()
    expect(screen.getByText('locale=vi')).toBeInTheDocument()
  })

  it('đổi giao diện qua next-themes → Ant Design đổi sáng/tối theo', async () => {
    const user = userEvent.setup()
    renderProvider()
    const dark = theme.getDesignToken({
      algorithm: theme.darkAlgorithm,
      token: { colorPrimary: designTokens.primary },
    })

    await user.click(screen.getByRole('button', { name: 'dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByText(`bg=${dark.colorBgContainer}`)).toBeInTheDocument()
    expect(screen.getByText(`primary=${dark.colorPrimary}`)).toBeInTheDocument()
    expect(screen.getByText(`font=${designTokens.fontBodyPx}`)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(screen.getByText(`bg=${designTokens.surface}`)).toBeInTheDocument()
    expect(screen.getByText(`primary=${designTokens.primary}`)).toBeInTheDocument()
  })

  it('đổi ngôn ngữ i18n → locale Ant Design đổi theo', async () => {
    renderProvider()

    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByText('locale=en')).toBeInTheDocument()

    await act(() => i18n.changeLanguage('vi'))
    expect(screen.getByText('locale=vi')).toBeInTheDocument()
  })
})
