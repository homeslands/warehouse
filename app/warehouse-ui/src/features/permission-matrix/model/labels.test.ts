import { describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { AUTHORITY_CODES } from '@/shared/api/authority-codes'
import { GROUP_KEYS } from './labels'

// Tên quyền hiển thị lấy theo MÃ từ i18n (tên backend trả về lẫn Anh–Việt). Thiếu bản dịch thì màn
// âm thầm rơi về tên backend — test này bắt chỗ thiếu thay vì để người dùng thấy.
describe('bản dịch tên quyền', () => {
  it.each(['vi', 'en'])('mọi mã trong AUTHORITY_CODES có tên (%s)', (lng) => {
    const missing = AUTHORITY_CODES.filter(
      (code) => !i18n.exists(`permissions:authorityNames.${code}`, { lng }),
    )
    expect(missing).toEqual([])
  })

  it.each(['vi', 'en'])('mọi nhóm trong GROUP_KEYS có tên (%s)', (lng) => {
    const missing = Object.values(GROUP_KEYS).filter(
      (key) => !i18n.exists(`permissions:groupNames.${key}`, { lng }),
    )
    expect(missing).toEqual([])
  })
})
