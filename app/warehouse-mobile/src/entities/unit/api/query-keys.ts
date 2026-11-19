export const unitKeys = {
  all: ['units'] as const,
  list: () => ['units', 'list'] as const,
  detail: (slug: string) => ['units', 'detail', slug] as const,
}
