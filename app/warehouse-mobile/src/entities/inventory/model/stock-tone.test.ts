import { lightColors as c } from '@/shared/theme/tokens'

import { stockLevelTone } from './stock-tone'

describe('stockLevelTone', () => {
  it('map mức tồn sang cặp màu nền/icon', () => {
    expect(stockLevelTone(c, 'out')).toEqual({ bg: c.destructiveSoft, fg: c.destructive })
    expect(stockLevelTone(c, 'low')).toEqual({ bg: c.warningSoft, fg: c.warningText })
    expect(stockLevelTone(c, 'high')).toEqual({ bg: c.accentSoft, fg: c.accentText })
    expect(stockLevelTone(c, 'ok')).toEqual({ bg: c.fill, fg: c.foreground })
  })
})
