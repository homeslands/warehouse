import type { Versioned } from '@/shared/api/types'

export type Example = {
  id: string
  slug: string
  name: string
  description?: string
  version: number
  createdAt: string
  updatedAt: string
}

export type ExampleInput = {
  name: string
  description?: string
}

export type ExampleUpdateInput = ExampleInput & Versioned

/** Backend Example chưa lọc theo gì. Màn có bộ lọc khai field ở đây (vd `{ name?: string }`). */
export type ExampleFilters = Record<never, never>
