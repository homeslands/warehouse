import { render, screen } from '@testing-library/react-native'
import { Platform, Text } from 'react-native'

import { useWarehouseStore } from '@/entities/warehouse'
import { initI18n } from '@/shared/i18n'

import { tabHeaderRight } from './tab-header'

jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }))

const original = Platform.OS
beforeAll(async () => {
  await initI18n()
})
beforeEach(() => {
  useWarehouseStore.setState({
    current: { slug: 'wh', code: 'WH1', name: 'Kho Tổng', isManager: true },
  })
})
afterEach(() => {
  Platform.OS = original
})

describe('tabHeaderRight', () => {
  it('iOS: chỉ có nút kho (custom) ở bên phải; không có mục trái', () => {
    Platform.OS = 'ios'
    const opts = tabHeaderRight()
    expect(opts).not.toHaveProperty('unstable_headerLeftItems')
    expect(opts).not.toHaveProperty('headerLeft')
    const items = opts.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: false })
    expect(items).toHaveLength(1)
    expect(items?.[0]).toMatchObject({ type: 'custom' })
  })

  it('iOS: mục của màn đứng trước, nút kho LUÔN cuối cùng (ngoài cùng bên phải)', () => {
    Platform.OS = 'ios'
    const scan = { type: 'button' as const, label: 'Quét mã', onPress: jest.fn() }
    const filter = { type: 'button' as const, label: 'Lọc', onPress: jest.fn() }
    const items = tabHeaderRight({ ios: [scan, filter] }).unstable_headerRightItems?.({
      tintColor: undefined,
      canGoBack: false,
    })
    // Khoảng cách 8 tách nút kho thành viên kính riêng, không dính Quét/Lọc.
    expect(items?.map((i) => i.type)).toEqual(['button', 'button', 'spacing', 'custom'])
    expect(items?.slice(0, 2)).toEqual([scan, filter])
    expect(items?.[2]).toMatchObject({ spacing: 8 })
  })

  it('Android: headerRight là hàng [nút của màn…, nút kho]; không có headerLeft', async () => {
    Platform.OS = 'android'
    const opts = tabHeaderRight({
      android: (
        <>
          <Text>scan</Text>
          <Text>filter</Text>
        </>
      ),
    })
    expect(opts).not.toHaveProperty('headerLeft')
    expect(opts).not.toHaveProperty('unstable_headerRightItems')
    const Right = opts.headerRight as () => React.ReactElement
    await render(<>{Right()}</>)
    const names = screen.getAllByText(/scan|filter|WH1/).map((n) => n.props.children as string)
    expect(names).toEqual(['scan', 'filter', 'WH1'])
  })
})
