import { describe, expect, it } from 'vitest'
import { designTokens } from './design-tokens'

// Hợp đồng nằm NGOÀI app (`docs/` ở root repo). Không `import` tĩnh: `tsc -b` trong Docker context
// chỉ có `app/warehouse-ui` sẽ báo TS2307 (review r1 F1). `import.meta.glob` được Vite/Vitest phân
// giải lúc chạy test và typecheck không cần file tồn tại. Thiếu file → test FAIL, không skip.
const CONTRACT = '../../../../../docs/project/baseline/contracts/design-tokens.json'
const found = import.meta.glob<unknown>(
  '../../../../../docs/project/baseline/contracts/design-tokens.json',
  { eager: true, import: 'default' },
)

describe('designTokens', () => {
  it('tìm thấy đúng một file hợp đồng design-tokens.json R2', () => {
    expect(Object.keys(found)).toEqual([CONTRACT])
  })

  it('khớp đúng hợp đồng R2 docs/project/baseline/contracts/design-tokens.json', () => {
    expect(designTokens).toEqual(found[CONTRACT])
  })
})
