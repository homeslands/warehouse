import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { renderWithProviders } from '@/shared/test/render'
import { FlagIcon } from './FlagIcon'
import { LanguageToggle } from './LanguageToggle'

// Ca cuối đổi sang tiếng Anh — trả lại để thứ tự chạy test không đổi kết quả.
afterEach(() => i18n.changeLanguage('vi'))

async function openMenu() {
  const utils = renderWithProviders(<LanguageToggle />)
  await utils.user.click(screen.getByRole('button', { name: 'Ngôn ngữ' }))
  return { ...utils, menu: await screen.findByRole('menu') }
}

describe('LanguageToggle', () => {
  it('mỗi ngôn ngữ có cờ tròn đứng trước tên', async () => {
    const { menu } = await openMenu()

    const vi = within(menu).getByRole('menuitem', { name: 'Tiếng Việt' })
    const en = within(menu).getByRole('menuitem', { name: 'English' })
    expect(vi.querySelector('[data-flag="vi"]')).not.toBeNull()
    expect(en.querySelector('[data-flag="en"]')).not.toBeNull()
  })

  it('cờ là hình trang trí — không đọc thêm gì ngoài tên ngôn ngữ', async () => {
    const { menu } = await openMenu()

    // Tên truy cập của mục vẫn đúng là "Tiếng Việt" (ca trên) — cờ không chen thêm chữ nào.
    const flags = menu.querySelectorAll('[data-flag]')
    expect(flags).toHaveLength(2)
    for (const flag of Array.from(flags)) expect(flag).toHaveAttribute('aria-hidden', 'true')
  })

  it('hai lá cờ Anh cùng lúc trên trang không đụng id clipPath của nhau', () => {
    render(
      <>
        <FlagIcon lang="en" />
        <FlagIcon lang="en" />
      </>,
    )
    // Union Jack dùng clipPath theo id. Id trùng thì lá thứ hai cắt theo clipPath của lá thứ nhất —
    // lỗi chỉ lộ khi có hai bản trên cùng trang.
    const ids = Array.from(document.querySelectorAll('clipPath'), (node) => node.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('menu rộng/thoáng hơn mặc định — class đè thật sự còn sống sau tailwind-merge', async () => {
    // jsdom không dựng CSS: kiểm class trên phần tử là cách duy nhất biết class đè không bị nuốt
    // (bẫy "class trần thua biến thể" trong CLAUDE.md).
    const { menu } = await openMenu()

    expect(menu).toHaveClass('min-w-48', 'p-1.5')
    expect(menu.className).not.toMatch(/min-w-\[max/)
    expect(within(menu).getByRole('menuitem', { name: 'Tiếng Việt' })).toHaveClass('gap-3', 'py-2')
  })

  it('bấm một ngôn ngữ thì đổi ngôn ngữ app', async () => {
    const { user, menu } = await openMenu()

    await user.click(within(menu).getByRole('menuitem', { name: 'English' }))

    expect(await screen.findByRole('button', { name: 'Language' })).toBeInTheDocument()
  })
})
