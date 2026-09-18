import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { ModeToggle } from './ModeToggle'

// next-themes (storageKey mặc định 'theme', xem node_modules/next-themes/dist/index.mjs)
// ghi lựa chọn theme vào đúng khoá này trong localStorage.
const THEME_STORAGE_KEY = 'theme'

function renderToggle() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ModeToggle />
    </ThemeProvider>,
  )
}

afterEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY)
  document.documentElement.classList.remove('dark')
})

describe('ModeToggle', () => {
  it('chọn mục "Tối" trong dropdown thêm class dark vào <html> và ghi lựa chọn vào localStorage', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(screen.getByRole('button', { name: i18n.t('theme') }))
    await user.click(await screen.findByRole('menuitem', { name: i18n.t('themeDark') }))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
