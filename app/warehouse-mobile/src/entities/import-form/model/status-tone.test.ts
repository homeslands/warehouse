import { lightColors as c } from '@/shared/theme/tokens'

import { importStatusTone } from './status-tone'

describe('importStatusTone', () => {
  it('map trạng thái sang cặp màu nền/icon', () => {
    expect(importStatusTone(c, 'DRAFT')).toEqual({ bg: c.warningSoft, fg: c.warningText })
    expect(importStatusTone(c, 'CONFIRMED')).toEqual({ bg: c.successSoft, fg: c.successText })
    expect(importStatusTone(c, 'CANCELLED')).toEqual({ bg: c.fill, fg: c.mutedForeground })
  })
})
