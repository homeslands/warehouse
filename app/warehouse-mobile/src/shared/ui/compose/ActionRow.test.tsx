import { fireEvent, render, screen } from '@testing-library/react-native'

import { lightColors } from '../../theme/tokens'
import { ActionRow } from './ActionRow'

describe('ActionRow', () => {
  it('colored text button ≥ 44pt; press calls onPress', async () => {
    const onPress = jest.fn()
    await render(<ActionRow label="Xoá khỏi phiếu" color="#ff3b30" onPress={onPress} />)
    const row = screen.getByRole('button', { name: 'Xoá khỏi phiếu' })
    expect(row).toHaveStyle({ minHeight: 44 })
    expect(screen.getByText('Xoá khỏi phiếu')).toHaveStyle({ color: '#ff3b30' })
    await fireEvent.press(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('disabled → announced, muted text, no press', async () => {
    const onPress = jest.fn()
    await render(<ActionRow label="Xoá hạn" color="#007aff" disabled onPress={onPress} />)
    expect(screen.getByRole('button', { name: 'Xoá hạn' })).toBeDisabled()
    expect(screen.getByText('Xoá hạn')).toHaveStyle({ color: lightColors.mutedForeground })
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá hạn' }))
    expect(onPress).not.toHaveBeenCalled()
  })
})
