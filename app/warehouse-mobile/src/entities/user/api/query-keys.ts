export const userKeys = {
  all: ['users'] as const,
  search: (term: string) => [...userKeys.all, 'search', term] as const,
}
