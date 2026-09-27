import { getData } from '@/shared/api/http'
import type { Authority } from '../model/types'

/** `GET /authorities` KHÔNG phân trang — dùng `getData`, không phải `getPaginated`. */
export const fetchAuthorities = (): Promise<Authority[]> => getData<Authority[]>('/authorities')
