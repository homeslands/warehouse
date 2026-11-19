import { callsTo, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { deleteMaterialType, updateMaterialType } from './material-type.api'

beforeEach(resetFakeApi)

describe('material-type api', () => {
  it('updateMaterialType gửi PATCH /material-types/bot đúng body', async () => {
    let body: unknown
    route('patch', '/material-types/bot', (config) => {
      body = JSON.parse(config.data as string)
      return ok({ slug: 'bot' })
    })
    await updateMaterialType('bot', { description: '' })
    expect(body).toEqual({ description: '' })
  })
  it('deleteMaterialType gọi DELETE /material-types/bot', async () => {
    route('delete', '/material-types/bot', () => ok(null))
    await deleteMaterialType('bot')
    expect(callsTo('delete', '/material-types/bot')).toHaveLength(1)
  })
})
