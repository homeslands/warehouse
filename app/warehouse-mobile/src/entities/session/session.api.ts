import type { AxiosRequestConfig } from 'axios'
import { getData, postData } from '@/shared/api/http'
import { LOGIN_PATH, ME_PATH } from '@/shared/api/routes'
import type { AuthTokens } from '@/shared/api/types'
import type { CurrentUser } from './permissions'

export const fetchProfile = (config?: AxiosRequestConfig): Promise<CurrentUser> =>
  getData<CurrentUser>(ME_PATH, config)

export const login = (phonenumber: string, password: string): Promise<AuthTokens> =>
  postData<AuthTokens>(LOGIN_PATH, { phonenumber, password })
