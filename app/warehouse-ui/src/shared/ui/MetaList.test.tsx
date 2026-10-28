import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { MetaList } from './MetaList'

describe('MetaList', () => {
  it('mỗi mục là một cặp nhãn (term) – giá trị (definition) theo thứ tự', () => {
    renderWithProviders(
      <MetaList
        items={[
          { label: 'A', value: 'một' },
          { label: 'B', value: <b>hai</b> },
        ]}
      />,
    )
    expect(screen.getAllByRole('term').map((el) => el.textContent)).toEqual(['A', 'B'])
    expect(screen.getAllByRole('definition').map((el) => el.textContent)).toEqual(['một', 'hai'])
  })
})
