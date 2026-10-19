import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useActiveSection } from './useActiveSection'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

let fire: Callback = () => {}
const disconnect = vi.fn()

function stubObserver() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Callback) {
        fire = cb
      }
      observe() {}
      disconnect = disconnect
    },
  )
}

function Probe({ enabled = true }: { enabled?: boolean }) {
  const a = useRef<HTMLElement>(null)
  const b = useRef<HTMLElement>(null)
  const active = useActiveSection(
    [
      { key: 'seller', ref: a },
      { key: 'items', ref: b },
    ],
    enabled,
  )
  return (
    <>
      <section ref={a} data-testid="a" />
      <section ref={b} data-testid="b" />
      <output>{active}</output>
    </>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('useActiveSection', () => {
  it('không có IntersectionObserver → giữ khối đầu', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Probe />)
    expect(screen.getByRole('status')).toHaveTextContent('seller')
  })

  it('khối sau cùng đang chạm dải trên được chọn; rời dải thì về khối trước', () => {
    stubObserver()
    render(<Probe />)
    const a = screen.getByTestId('a')
    const b = screen.getByTestId('b')
    act(() =>
      fire([
        { target: a, isIntersecting: true },
        { target: b, isIntersecting: true },
      ]),
    )
    expect(screen.getByRole('status')).toHaveTextContent('items')
    act(() => fire([{ target: b, isIntersecting: false }]))
    expect(screen.getByRole('status')).toHaveTextContent('seller')
  })

  it('tắt (sheet đóng) → ngắt observer, về khối đầu', () => {
    stubObserver()
    const { rerender } = render(<Probe />)
    act(() => fire([{ target: screen.getByTestId('b'), isIntersecting: true }]))
    expect(screen.getByRole('status')).toHaveTextContent('items')
    rerender(<Probe enabled={false} />)
    expect(disconnect).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('seller')
  })
})
