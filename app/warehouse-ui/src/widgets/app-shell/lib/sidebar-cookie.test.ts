import { describe, expect, it } from 'vitest'
import { readSidebarOpenCookie } from './sidebar-cookie'

describe('readSidebarOpenCookie', () => {
  it('chưa có cookie → mở', () => {
    expect(readSidebarOpenCookie('')).toBe(true)
    expect(readSidebarOpenCookie('khac=1')).toBe(true)
  })

  it('đọc đúng giá trị đã lưu, giữa các cookie khác', () => {
    expect(readSidebarOpenCookie('a=1; sidebar_state=false; b=2')).toBe(false)
    expect(readSidebarOpenCookie('sidebar_state=true')).toBe(true)
  })

  it('không nhầm cookie có tên chứa sidebar_state', () => {
    expect(readSidebarOpenCookie('old_sidebar_state=false')).toBe(true)
  })
})
