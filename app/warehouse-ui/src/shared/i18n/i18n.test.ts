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

describe('số nhiều tiếng Anh (importForms)', () => {
  const en = () => i18n.getFixedT('en', 'importForms')

  it('supplierChangedLines: 1 line / 2 lines', () => {
    expect(en()('supplierChangedLines', { count: 1 })).toBe('Seller changed on 1 line')
    expect(en()('supplierChangedLines', { count: 2 })).toBe('Seller changed on 2 lines')
  })

  it('infoNewSupplier: 1 material / 3 materials', () => {
    expect(en()('infoNewSupplier', { supplier: 'X', count: 1 })).toBe(
      'X will be added as a supplier of 1 material not bought from them before.',
    )
    expect(en()('infoNewSupplier', { supplier: 'X', count: 3 })).toBe(
      'X will be added as a supplier of 3 materials not bought from them before.',
    )
  })

  it('tiếng Việt không đổi theo số', () => {
    const vi = i18n.getFixedT('vi', 'importForms')
    expect(vi('supplierChangedLines', { count: 1 })).toBe('Đã đổi bên bán cho 1 dòng')
    expect(vi('supplierChangedLines', { count: 2 })).toBe('Đã đổi bên bán cho 2 dòng')
  })
})
