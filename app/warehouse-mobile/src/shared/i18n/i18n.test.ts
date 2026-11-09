import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Localization from 'expo-localization'

import { kv } from '@/shared/storage/kv'

import i18n, { changeLanguage, initI18n, resources } from './index'

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }))

const mockLocales = Localization.getLocales as jest.Mock

function device(languageCode: string | null) {
  mockLocales.mockReturnValue([{ languageCode }])
}

beforeEach(async () => {
  await AsyncStorage.clear()
})

describe('i18n', () => {
  it('chưa lưu ngôn ngữ, máy en-US thì dùng en', async () => {
    device('en')
    await initI18n()
    expect(i18n.language).toBe('en')
    expect(i18n.t('common:retry')).toBe('Try again')
  })

  it('máy fr-FR thì về vi', async () => {
    device('fr')
    await initI18n()
    expect(i18n.language).toBe('vi')
    expect(i18n.t('common:retry')).toBe('Thử lại')
  })

  it('đã lưu vi thì dùng vi bất kể máy', async () => {
    device('en')
    await kv.set('warehouse.language', 'vi')
    await initI18n()
    expect(i18n.language).toBe('vi')
  })

  it('giá trị đã lưu không hợp lệ thì rơi về ngôn ngữ máy', async () => {
    device('en')
    await kv.set('warehouse.language', 'de')
    await initI18n()
    expect(i18n.language).toBe('en')
  })

  it('changeLanguage(en) ghi kv', async () => {
    device('fr')
    await initI18n()
    await changeLanguage('en')
    expect(i18n.language).toBe('en')
    expect(await kv.get('warehouse.language')).toBe('en')
  })

  it('có đủ key mobile ở cả hai ngôn ngữ', async () => {
    device('vi')
    await initI18n()
    const keys = [
      'nav:import',
      'nav:export',
      'nav:stock',
      'nav:account',
      'common:comingSoon',
      'common:retry',
      'common:offline',
      'auth:noWarehouse',
      'auth:noAccess',
      'auth:selectWarehouse',
      'auth:tagline',
      'auth:warehouseCount',
      'auth:yourWarehouses',
      'auth:warehouseRememberHint',
      'account:noName',
      'account:workSection',
      'account:warehouseRow',
      'common:sandbox',
      'importForms:list.empty',
      'inventory:searchPlaceholder',
      'inventory:filterTypeAll',
      'inventory:filter',
      'inventory:badgeOut',
    ]
    for (const lng of ['vi', 'en']) {
      for (const k of keys) expect(i18n.exists(k, { lng })).toBe(true)
    }
  })

  it('vi và en có bộ key giống hệt nhau ở mọi namespace', () => {
    const keysOf = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object'
        ? Object.entries(node).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k))
        : [prefix]
    const namespaces = Object.keys(resources.vi) as (keyof typeof resources.vi)[]
    expect(Object.keys(resources.en).sort()).toEqual([...namespaces].sort())
    for (const ns of namespaces) {
      expect({ ns, keys: keysOf(resources.en[ns]).sort() }).toEqual({
        ns,
        keys: keysOf(resources.vi[ns]).sort(),
      })
    }
  })
})
