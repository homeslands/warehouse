import { fireEvent, render, screen } from '@testing-library/react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { Text } from '../Text'
import { MaterialPickList, type PickItem } from './MaterialPickList'

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

const items: PickItem[] = [
  { id: 'a', name: 'Xi măng', code: 'XM', detail: 'còn 5 kg', state: 'pickable' },
  { id: 'b', name: 'Sơn', code: 'SN', detail: 'Hết hàng', detailTone: 'warning', state: 'exists' },
  {
    id: 'c',
    name: 'Keo',
    code: 'KEO',
    detail: null,
    state: 'locked',
    lockedLabel: 'Chưa có đơn vị',
  },
]

async function setup(over: Partial<React.ComponentProps<typeof MaterialPickList>> = {}) {
  const onToggle = jest.fn()
  await render(
    <MaterialPickList
      items={items}
      checked={new Set()}
      onToggle={onToggle}
      capacityLeft={3}
      capacityLabel="Phiếu tối đa 200 dòng"
      {...over}
    />,
  )
  return { onToggle }
}
const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })

describe('MaterialPickList', () => {
  it('toggles a pickable row, reflecting checked state', async () => {
    const { onToggle } = await setup()
    expect(box('Xi măng')).not.toBeChecked()
    await fireEvent.press(box('Xi măng'))
    expect(onToggle).toHaveBeenCalledWith('a')
  })

  it('shows checked rows and lets them be unticked', async () => {
    const { onToggle } = await setup({ checked: new Set(['a']), capacityLeft: 0 })
    expect(box('Xi măng')).toBeChecked()
    await fireEvent.press(box('Xi măng'))
    expect(onToggle).toHaveBeenCalledWith('a')
  })

  it('exists / locked rows show their label and never toggle', async () => {
    const { onToggle } = await setup()
    expect(screen.getByText('đã có')).toBeOnTheScreen()
    expect(screen.getByText('Chưa có đơn vị')).toBeOnTheScreen()
    await fireEvent.press(box('Sơn'))
    await fireEvent.press(box('Keo'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('capacityLeft 0 blocks further ticks and shows capacityLabel', async () => {
    const { onToggle } = await setup({ capacityLeft: 0 })
    expect(screen.getByText('Phiếu tối đa 200 dòng')).toBeOnTheScreen()
    await fireEvent.press(box('Xi măng'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('hides capacityLabel while there is room', async () => {
    await setup()
    expect(screen.queryByText('Phiếu tối đa 200 dòng')).toBeNull()
  })
})

describe('MaterialPickList header / empty', () => {
  it('renders header and the empty node when there are no items', async () => {
    await render(
      <MaterialPickList
        items={[]}
        checked={new Set()}
        onToggle={jest.fn()}
        capacityLeft={3}
        capacityLabel="x"
        header={<Text>HEAD</Text>}
        empty={<Text>EMPTY</Text>}
      />,
    )
    expect(screen.getByText('HEAD')).toBeOnTheScreen()
    expect(screen.getByText('EMPTY')).toBeOnTheScreen()
  })
})
