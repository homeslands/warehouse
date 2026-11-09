import { fireEvent, render, screen } from '@testing-library/react-native'

import { lightColors, radius } from '../../theme/tokens'
import { AddLineRow } from './AddLineRow'

const onPress = jest.fn()
beforeEach(() => jest.clearAllMocks())

describe('AddLineRow', () => {
  it('accent circle + accent label, ≥ 50 tall; press calls onPress', async () => {
    await render(<AddLineRow label="Thêm vật tư" onPress={onPress} testID="add" />)
    const row = screen.getByRole('button', { name: 'Thêm vật tư' })
    expect(row).toBe(screen.getByTestId('add'))
    expect(row).toHaveStyle({ minHeight: 50 })
    expect(screen.getByText('Thêm vật tư')).toHaveStyle({
      fontSize: 17,
      color: lightColors.accent,
    })
    expect(screen.getByTestId('add-icon')).toHaveStyle({
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: lightColors.accent,
    })
    expect(screen.getByTestId('add-hairline')).toBeOnTheScreen()
    await fireEvent.press(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('disabled: not pressable, reported disabled, muted', async () => {
    await render(<AddLineRow label="Thêm vật tư" onPress={onPress} disabled testID="add" />)
    const row = screen.getByRole('button', { name: 'Thêm vật tư' })
    expect(row).toBeDisabled()
    await fireEvent.press(row)
    expect(onPress).not.toHaveBeenCalled()
    expect(screen.getByText('Thêm vật tư')).toHaveStyle({ color: lightColors.mutedForeground })
  })

  it('first (no line above): no hairline', async () => {
    await render(<AddLineRow label="Thêm vật tư" onPress={onPress} first testID="add" />)
    expect(screen.queryByTestId('add-hairline')).toBeNull()
    expect(screen.getByTestId('add')).toHaveStyle({
      borderTopLeftRadius: radius.groupLarge,
      borderBottomLeftRadius: radius.groupLarge,
    })
  })

  it('not first: square top, rounded bottom (last row of the block)', async () => {
    await render(<AddLineRow label="Thêm vật tư" onPress={onPress} testID="add" />)
    expect(screen.getByTestId('add')).toHaveStyle({
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: radius.groupLarge,
    })
  })

  it('the + glyph does not scale with Dynamic Type (fixed 24pt circle)', async () => {
    await render(<AddLineRow label="Thêm vật tư" onPress={onPress} testID="add" />)
    expect(screen.getByText('+').props.allowFontScaling).toBe(false)
  })
})
