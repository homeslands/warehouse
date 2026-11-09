import { AxiosError } from 'axios'

import i18n, { changeLanguage, initI18n } from '@/shared/i18n'
import { errorMessage } from '@/shared/api/error-message'

import { inventoryErrorMessage, thresholdErrorKey } from './inventory-error'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

describe('inventoryErrorMessage', () => {
  it('quá trần trang khi tải hết → câu riêng của inventory', () => {
    expect(inventoryErrorMessage(new Error('inventory-too-many-pages'), i18n.t)).toBe(
      'Kho có quá nhiều vật tư để tải trên điện thoại.',
    )
  })

  it('lỗi khác → như errorMessage chung', () => {
    const e = new AxiosError('Network Error', AxiosError.ERR_NETWORK)
    expect(inventoryErrorMessage(e, i18n.t)).toBe(errorMessage(e, i18n.t))
  })
})

describe('thresholdErrorKey', () => {
  const api = (statusCode: number, code?: number, message = 'x') => ({ statusCode, code, message })
  it('100809 / 100810 / 100811 / 404 / 403 → key riêng', () => {
    expect(thresholdErrorKey(api(400, 100809))).toBe('inventory:thresholdMinInvalid')
    expect(thresholdErrorKey(api(400, 100810))).toBe('inventory:thresholdMaxInvalid')
    expect(thresholdErrorKey(api(400, 100811))).toBe('inventory:thresholdRange')
    expect(thresholdErrorKey(api(404, 100801))).toBe('inventory:thresholdNotInWarehouse')
    expect(thresholdErrorKey(api(404))).toBe('inventory:thresholdNotInWarehouse')
    expect(thresholdErrorKey(api(403, undefined, 'Forbidden resource'))).toBe(
      'errors:permissionDenied',
    )
  })
  it('lỗi khác → câu chung', () => {
    expect(thresholdErrorKey(api(500))).toBe('errors:unknown')
    expect(thresholdErrorKey(new Error('boom'))).toBe('errors:unknown')
  })
  it('key đều có trong vi + en', async () => {
    for (const lng of ['vi', 'en']) {
      await changeLanguage(lng as 'vi' | 'en')
      for (const k of [
        'thresholdMinInvalid',
        'thresholdMaxInvalid',
        'thresholdRange',
        'thresholdNotInWarehouse',
        'thresholdRequired',
      ])
        expect(i18n.exists(`inventory:${k}`)).toBe(true)
    }
  })
})
