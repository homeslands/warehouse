import { Platform } from 'react-native'

import { darkColors, lightColors } from '@/shared/theme/tokens'

import { sheetScreenOptions } from './sheet-options'

let mockGlass = true
jest.mock('@/shared/lib/liquid-glass', () => ({ canUseLiquidGlass: () => mockGlass }))

afterEach(() => {
  jest.restoreAllMocks()
  mockGlass = true
})

describe('sheetScreenOptions', () => {
  it('iOS < 26 (không kính): nền đặc sheetSolid theo theme, vẫn formSheet', () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    mockGlass = false
    expect(sheetScreenOptions([1], lightColors)).toMatchObject({
      presentation: 'formSheet',
      contentStyle: { backgroundColor: lightColors.sheetSolid },
    })
    expect(sheetScreenOptions([1], darkColors).contentStyle).toEqual({
      backgroundColor: darkColors.sheetSolid,
    })
    expect(lightColors.sheetSolid).not.toMatch(/rgba/)
    expect(darkColors.sheetSolid).not.toMatch(/rgba/)
  })

  it('iOS 26+: formSheet + thanh kéo, nền phủ mờ `sheetTint` (đục hơn nền kính trong suốt)', () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const o = sheetScreenOptions([0.5, 1], lightColors)
    expect(o).toMatchObject({
      presentation: 'formSheet',
      sheetAllowedDetents: [0.5, 1],
      sheetInitialDetentIndex: 0,
      sheetGrabberVisible: true,
      contentStyle: { backgroundColor: lightColors.sheetTint },
    })
    expect(sheetScreenOptions([1], darkColors).contentStyle).toEqual({
      backgroundColor: darkColors.sheetTint,
    })
  })

  it('sheetTint là màu bán trong suốt (vẫn thấy kính), không phải trong suốt hẳn', () => {
    for (const c of [lightColors, darkColors]) {
      const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(c.sheetTint)?.[1])
      expect(alpha).toBeGreaterThan(0.4)
      expect(alpha).toBeLessThan(1)
    }
  })

  it('Android: modal nền thẻ (kính hay không đều vậy)', () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    mockGlass = false
    expect(sheetScreenOptions([0.5, 1], lightColors)).toMatchObject({
      presentation: 'modal',
      contentStyle: { backgroundColor: lightColors.card },
    })
  })
})
