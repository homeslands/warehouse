import { render } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { darkColors, lightColors } from '@/shared/theme/tokens'

import { SheetStackLayout } from './SheetStackLayout'

const mockStack = jest.fn()
jest.mock('expo-router', () => ({
  Stack: (props: object) => {
    mockStack(props)
    return null
  },
}))
let mockGlass = false
jest.mock('@/shared/lib/liquid-glass', () => ({ canUseLiquidGlass: () => mockGlass }))
let mockColors = lightColors
jest.mock('@/shared/theme/useTheme', () => ({ useTheme: () => ({ colors: mockColors }) }))

async function opts() {
  await render(<SheetStackLayout />)
  return mockStack.mock.calls.at(-1)![0].screenOptions
}

afterEach(() => {
  jest.restoreAllMocks()
  mockStack.mockClear()
  mockColors = lightColors
})

describe('SheetStackLayout', () => {
  it('iOS 26+ (kính): nội dung trong suốt, header không đặt nền', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    mockGlass = true
    const o = await opts()
    expect(o.contentStyle).toEqual({ backgroundColor: 'transparent' })
    expect(o.headerStyle).toBeUndefined()
  })

  it('iOS < 26 (không kính): nội dung + header nền đặc sheetSolid theo theme', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    mockGlass = false
    let o = await opts()
    expect(o.contentStyle).toEqual({ backgroundColor: lightColors.sheetSolid })
    expect(o.headerStyle).toEqual({ backgroundColor: lightColors.sheetSolid })
    mockColors = darkColors
    o = await opts()
    expect(o.contentStyle).toEqual({ backgroundColor: darkColors.sheetSolid })
    expect(o.headerStyle).toEqual({ backgroundColor: darkColors.sheetSolid })
  })

  it('Android: nền thẻ như cũ', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    mockGlass = false
    const o = await opts()
    expect(o.contentStyle).toEqual({ backgroundColor: lightColors.card })
    expect(o.headerStyle).toEqual({ backgroundColor: lightColors.card })
  })
})
