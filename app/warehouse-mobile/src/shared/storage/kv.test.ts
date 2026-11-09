import AsyncStorage from '@react-native-async-storage/async-storage'

import { kv } from './kv'

beforeEach(async () => {
  await AsyncStorage.clear()
})

describe('kv', () => {
  it('set rồi get ra đúng object', async () => {
    await kv.set('k', { a: 1, b: ['x'] })
    expect(await kv.get('k')).toEqual({ a: 1, b: ['x'] })
  })

  it('get trả null khi chưa có khoá', async () => {
    expect(await kv.get('missing')).toBeNull()
  })

  it('giá trị không phải JSON thì get trả null', async () => {
    await AsyncStorage.setItem('bad', '{not json')
    expect(await kv.get('bad')).toBeNull()
  })

  it('remove xoá khoá', async () => {
    await kv.set('k', 1)
    await kv.remove('k')
    expect(await kv.get('k')).toBeNull()
  })

  it('không ném lỗi khi storage hỏng', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('boom'))
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('boom'))
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('boom'))
    await expect(kv.get('k')).resolves.toBeNull()
    await expect(kv.set('k', 1)).resolves.toBeUndefined()
    await expect(kv.remove('k')).resolves.toBeUndefined()
  })
})
