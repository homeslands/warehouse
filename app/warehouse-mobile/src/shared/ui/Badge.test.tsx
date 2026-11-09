import { render, screen } from '@testing-library/react-native'

import { darkColors, lightColors } from '../theme/tokens'
import { Badge } from './Badge'

const mockScheme = jest.fn(() => 'light')
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme(),
}))

describe('Badge', () => {
  it('solid: nền primary, chữ primaryForeground (sáng và tối)', async () => {
    for (const [scheme, colors] of [
      ['light', lightColors],
      ['dark', darkColors],
    ] as const) {
      mockScheme.mockReturnValue(scheme)
      const view = await render(
        <Badge variant="solid" testID="b">
          Quản lý
        </Badge>,
      )
      expect(screen.getByTestId('b')).toHaveStyle({ backgroundColor: colors.primary })
      expect(screen.getByText('Quản lý')).toHaveStyle({ color: colors.primaryForeground })
      await view.unmount()
    }
    mockScheme.mockReturnValue('light')
  })

  it('neutral: nền fill', async () => {
    await render(<Badge testID="b">Thành viên</Badge>)
    expect(screen.getByTestId('b')).toHaveStyle({ backgroundColor: lightColors.fill })
  })

  it('outline: có viền, chữ hoa', async () => {
    await render(
      <Badge variant="outline" testID="b">
        Sandbox
      </Badge>,
    )
    expect(screen.getByTestId('b')).toHaveStyle({ borderWidth: 1 })
    expect(screen.getByText('Sandbox')).toHaveStyle({ textTransform: 'uppercase' })
  })
})
