import { getData, getPaginated } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type { Role, User, UserFilters } from '../model/types'

export const fetchUsers = (params: ListParams<UserFilters>): Promise<Paginated<User>> =>
  getPaginated<User>('/users', params)

/** `GET /roles` không phân trang — `getData`, không `getPaginated`. */
export const fetchRoles = (): Promise<Role[]> => getData<Role[]>('/roles')
