import { lightColors as c } from '@/shared/theme/tokens'

import { exportStatusTone } from './status-tone'

describe('exportStatusTone', () => {
  it('map trạng thái sang cặp màu nền/icon', () => {
    expect(exportStatusTone(c, 'DRAFT')).toEqual({ bg: c.warningSoft, fg: c.warningText })
    expect(exportStatusTone(c, 'PENDING')).toEqual({ bg: c.accentSoft, fg: c.accentText })
    expect(exportStatusTone(c, 'CONFIRMED')).toEqual({ bg: c.successSoft, fg: c.successText })
    expect(exportStatusTone(c, 'CANCELLED')).toEqual({ bg: c.fill, fg: c.mutedForeground })
  })
})
