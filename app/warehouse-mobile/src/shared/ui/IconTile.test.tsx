import { render, screen } from '@testing-library/react-native'
import { Warehouse } from './icons'

import { lightColors } from '../theme/tokens'
import { IconTile } from './IconTile'

describe('IconTile', () => {
  it.each([
    ['solid', lightColors.primary],
    ['light', lightColors.fill],
    ['destructive', lightColors.destructiveSoft],
  ] as const)('tone %s → nền đúng token', async (tone, bg) => {
    await render(<IconTile icon={Warehouse} tone={tone} />)
    expect(screen.getByTestId('icon-tile', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: bg,
    })
  })
})
