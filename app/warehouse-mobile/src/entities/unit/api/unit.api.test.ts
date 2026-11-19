import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { deleteUnit, updateUnit } from './unit.api'

beforeEach(resetFakeApi)

describe('unit api', () => {
  it('updateUnit gửi PATCH /units/kg đúng body', async () => {
    let body: unknown
    route('patch', '/units/kg', (config) => {
      body = JSON.parse(config.data as string)
      return ok({ slug: 'kg' })
    })
    await updateUnit('kg', { description: '' })
    expect(body).toEqual({ description: '' })
  })
  it('deleteUnit gọi DELETE /units/kg', async () => {
    route('delete', '/units/kg', () => ok(null))
    await deleteUnit('kg')
    expect(callsTo('delete', '/units/kg')).toHaveLength(1)
  })
})
