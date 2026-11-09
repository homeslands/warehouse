import { act, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { useWarehouseStore } from '@/entities/warehouse'

import { WarehouseTransition } from './WarehouseTransition'

const WH1 = { slug: 'wh-1', code: 'WH1', name: 'Kho Một', isManager: true }
const WH2 = { slug: 'wh-2', code: 'WH2', name: 'Kho Hai', isManager: false }

/** Opacity hiện tại do reanimated ghi (prop `jestAnimatedStyle` trong môi trường jest). */
function opacityOf(node: ReturnType<typeof screen.getByTestId>): number {
  const style = (node.props as { jestAnimatedStyle?: { value?: { opacity?: number } } })
    .jestAnimatedStyle?.value
  return style?.opacity ?? 1
}

beforeEach(() => {
  jest.useFakeTimers()
  useWarehouseStore.setState({ current: WH1, resolved: true, resolution: 'selected' })
})
afterEach(() => jest.useRealTimers())

describe('WarehouseTransition', () => {
  it('lần đầu hiện đủ (opacity 1), không hiệu ứng', async () => {
    await render(
      <WarehouseTransition>
        <Text>nội dung</Text>
      </WarehouseTransition>,
    )
    expect(screen.getByText('nội dung')).toBeOnTheScreen()
    expect(screen.getByTestId('warehouse-transition')).toHaveAnimatedStyle({ opacity: 1 })
  })

  it('đổi kho → mờ 0.6 rồi hiện lại 1 sau ~250ms; cùng kho thì không đổi', async () => {
    await render(
      <WarehouseTransition>
        <Text>nội dung</Text>
      </WarehouseTransition>,
    )
    await act(async () => useWarehouseStore.setState({ current: WH2 }))
    await act(async () => jest.advanceTimersByTime(32))
    const midway = opacityOf(screen.getByTestId('warehouse-transition'))
    expect(midway).toBeGreaterThanOrEqual(0.6)
    expect(midway).toBeLessThan(0.9)
    await act(async () => jest.advanceTimersByTime(400))
    expect(screen.getByTestId('warehouse-transition')).toHaveAnimatedStyle({ opacity: 1 })

    await act(async () => useWarehouseStore.setState({ current: { ...WH2 } }))
    expect(screen.getByTestId('warehouse-transition')).toHaveAnimatedStyle({ opacity: 1 })
  })
})
