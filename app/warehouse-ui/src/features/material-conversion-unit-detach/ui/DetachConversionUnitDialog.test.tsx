import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { MaterialConversionUnit } from '@/entities/material'
import { DetachConversionUnitDialog } from '../index'

const BASE = 'http://localhost:8085/api/v1'
const bag: MaterialConversionUnit = {
  unitSlug: 'u-bag',
  unitCode: 'BAG',
  unitName: 'Bao 50kg',
  conversionRate: 50,
  isBaseUnit: false,
}

describe('DetachConversionUnitDialog', () => {
  it('xác nhận → DELETE đúng URL, đóng, toast', async () => {
    const calls: string[] = []
    server.use(
      mswHttp.delete(`${BASE}/materials/m-1/conversion-units/u-bag`, () => {
        calls.push('u-bag')
        return ok('u-bag')
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <DetachConversionUnitDialog materialSlug="m-1" unit={bag} onOpenChange={onOpenChange} />,
    )

    expect(screen.getByRole('alertdialog')).toHaveTextContent('BAG · Bao 50kg')
    await user.click(screen.getByRole('button', { name: 'Gỡ' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(calls).toEqual(['u-bag'])
    expect(toast.success).toHaveBeenCalledWith('Đã gỡ đơn vị quy đổi')
  })
})
