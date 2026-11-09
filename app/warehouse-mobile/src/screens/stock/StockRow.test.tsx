import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { item } from '@/entities/inventory/model/fixtures'
import { initI18n } from '@/shared/i18n'
import { lightColors } from '@/shared/theme/tokens'

import { StockRow } from './StockRow'

const bg = () => StyleSheet.flatten(screen.getByTestId('stock-row').props.style).backgroundColor

describe('StockRow — nền "đang chạm"', () => {
  beforeAll(async () => {
    await initI18n()
  })
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('chỉ tô nền rowPressed sau khi giữ yên một nhịp (không nháy khi vuốt cuộn)', async () => {
    await render(<StockRow item={item()} locale="vi" onPress={jest.fn()} />)
    const row = screen.getByTestId('stock-row')
    await fireEvent(row, 'responderGrant', { nativeEvent: { touches: [] }, persist: jest.fn() })
    expect(bg()).not.toBe(lightColors.rowPressed)
    await act(async () => {
      jest.advanceTimersByTime(130)
    })
    expect(bg()).toBe(lightColors.rowPressed)
  })

  it('chạm nhanh vẫn gọi onPress', async () => {
    const onPress = jest.fn()
    await render(<StockRow item={item()} locale="vi" onPress={onPress} />)
    fireEvent.press(screen.getByTestId('stock-row'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
