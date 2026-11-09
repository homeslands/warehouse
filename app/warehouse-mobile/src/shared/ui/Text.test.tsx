import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { Text } from './Text'

const styleOf = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style)

describe('Text', () => {
  it('mặc định: font hệ thống (không fontFamily), fontWeight theo weight', async () => {
    await render(
      <>
        <Text>reg</Text>
        <Text weight="medium">med</Text>
        <Text weight="semibold">semi</Text>
        <Text weight="bold">bold</Text>
      </>,
    )
    expect(styleOf('reg').fontFamily).toBeUndefined()
    expect(styleOf('reg').fontWeight).toBe('400')
    expect(styleOf('med').fontWeight).toBe('500')
    expect(styleOf('semi').fontWeight).toBe('600')
    expect(styleOf('bold').fontWeight).toBe('700')
    expect(styleOf('reg').fontVariant).toBeUndefined()
  })

  it('numeric: tabular-nums, không fontFamily', async () => {
    await render(
      <Text numeric weight="semibold">
        1.234
      </Text>,
    )
    expect(styleOf('1.234').fontVariant).toEqual(['tabular-nums'])
    expect(styleOf('1.234').fontFamily).toBeUndefined()
    expect(styleOf('1.234').fontWeight).toBe('600')
  })

  it('code: ui-monospace (iOS)', async () => {
    await render(<Text code>VT-01</Text>)
    expect(styleOf('VT-01').fontFamily).toBe('ui-monospace')
  })

  it('không còn prop mono', async () => {
    // @ts-expect-error `mono` đã bị gỡ
    await render(<Text mono>x</Text>)
  })
})
