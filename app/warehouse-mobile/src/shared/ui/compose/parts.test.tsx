import { fireEvent, render, screen, within } from '@testing-library/react-native'

import { lightColors } from '../../theme/tokens'

import { ComposeSectionHeader } from './ComposeSectionHeader'

describe('ComposeSectionHeader', () => {
  it('shows the title and presses the accent action', async () => {
    const onPress = jest.fn()
    await render(
      <ComposeSectionHeader
        testID="h"
        title="Vật tư · 2"
        action={{ label: 'Sửa', accessibilityLabel: 'Sửa Vật tư', onPress, testID: 'edit' }}
      />,
    )
    expect(within(screen.getByTestId('h')).getByRole('header')).toHaveTextContent('Vật tư · 2')
    expect(screen.getByText('Sửa')).toHaveStyle({ color: lightColors.accentText })
    expect(screen.getByRole('button', { name: 'Sửa Vật tư' })).toHaveStyle({ minHeight: 44 })
    await fireEvent.press(screen.getByTestId('edit'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('disabled action is announced and does nothing', async () => {
    const onPress = jest.fn()
    await render(
      <ComposeSectionHeader title="Vật tư" action={{ label: 'Sửa', onPress, disabled: true }} />,
    )
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeDisabled()
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa' }))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders without an action', async () => {
    await render(<ComposeSectionHeader title="Vật tư" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
