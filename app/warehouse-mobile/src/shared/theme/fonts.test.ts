import { Platform } from 'react-native'

import { codeStyle, fontStyle, numericStyle } from './fonts'

describe('role helpers', () => {
  it('fontStyle: không fontFamily, ánh xạ weight sang fontWeight', () => {
    expect(fontStyle('regular')).toEqual({ fontWeight: '400' })
    expect(fontStyle('medium')).toEqual({ fontWeight: '500' })
    expect(fontStyle('semibold')).toEqual({ fontWeight: '600' })
    expect(fontStyle('bold')).toEqual({ fontWeight: '700' })
  })

  it('numericStyle: tabular-nums, không fontFamily', () => {
    expect(numericStyle('semibold')).toEqual({
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    })
  })

  it('codeStyle: ui-monospace trên iOS, monospace trên Android', () => {
    expect(codeStyle('regular')).toEqual({ fontFamily: 'ui-monospace', fontWeight: '400' })
    const original = Platform.OS
    Platform.OS = 'android'
    try {
      expect(codeStyle('medium')).toEqual({ fontFamily: 'monospace', fontWeight: '500' })
    } finally {
      Platform.OS = original
    }
  })
})
