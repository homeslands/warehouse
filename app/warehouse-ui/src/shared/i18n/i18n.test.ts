import { afterEach, describe, expect, it } from 'vitest'
import i18n, { resources } from '@/shared/i18n'

// Mọi file test khác ghim ngôn ngữ 'vi' trong setup.ts. Đổi ngôn ngữ ở đây thì phải trả
// lại 'vi' sau mỗi test — không dựa vào việc Vitest cô lập theo file để đảm bảo đúng.
afterEach(async () => {
  await i18n.changeLanguage('vi')
})

describe('syncHtmlLang', () => {
  it('đổi ngôn ngữ cập nhật document.documentElement.lang theo ngôn ngữ mới', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')

    await i18n.changeLanguage('vi')
    expect(document.documentElement.lang).toBe('vi')
  })
})

describe('vi/en key parity', () => {
  const namespaces = Object.keys(resources.vi) as (keyof typeof resources.vi)[]

  it.each(namespaces)('namespace "%s": khoá tiếng Anh khớp đầy đủ với khoá tiếng Việt', (ns) => {
    const viKeys = Object.keys(resources.vi[ns]).sort()
    const enKeys = Object.keys(resources.en[ns]).sort()

    // fallbackLng là 'vi': thiếu khoá bên 'en' không lộ ra qua tsc (type augmentation chỉ
    // check theo bundle 'vi') và người dùng tiếng Anh sẽ âm thầm thấy tiếng Việt.
    expect(enKeys, `namespace "${ns}" lệch khoá giữa vi và en`).toEqual(viKeys)
  })
})
