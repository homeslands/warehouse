export const materialTypeKeys = {
  all: ['material-types'] as const,
  list: () => ['material-types', 'list'] as const,
  detail: (slug: string) => ['material-types', 'detail', slug] as const,
}
