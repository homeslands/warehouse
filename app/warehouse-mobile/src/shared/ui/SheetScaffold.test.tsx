import { render, screen } from '@testing-library/react-native'
import { HeaderHeightContext } from 'expo-router/react-navigation'
import { Text } from 'react-native'

import { SheetScaffold } from './SheetScaffold'

jest.mock('expo-router', () => ({
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))
let mockGlass = false
jest.mock('@/shared/lib/liquid-glass', () => ({ canUseLiquidGlass: () => mockGlass }))

async function show(top?: React.ReactNode) {
  await render(
    <HeaderHeightContext value={56}>
      <SheetScaffold title="T" cancelLabel="Đóng" onCancel={() => {}} top={top} testID="s">
        <Text>Thân</Text>
      </SheetScaffold>
    </HeaderHeightContext>,
  )
}

const topBox = () => screen.getByText('Ghim').parent!

afterEach(() => {
  mockGlass = false
})

describe('SheetScaffold top', () => {
  it('iOS 26 (kính): phần ghim đẩy xuống đúng chiều cao header (header đè lên nội dung)', async () => {
    mockGlass = true
    await show(<Text>Ghim</Text>)
    expect(topBox()).toHaveStyle({ paddingTop: 8 + 56 })
  })

  it('không kính: phần ghim không cộng chiều cao header', async () => {
    await show(<Text>Ghim</Text>)
    expect(topBox()).toHaveStyle({ paddingTop: 8 })
  })

  it('phần ghim nằm ngoài vùng cuộn', async () => {
    await show(<Text>Ghim</Text>)
    expect(screen.getByTestId('s-scroll')).not.toContainElement(screen.getByText('Ghim'))
  })
})
