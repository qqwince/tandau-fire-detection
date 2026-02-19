import { $host } from '@/shared/api'
import type { User } from '../model/types'

export const getUserProfile = async (): Promise<User> => {
    const { data } = await $host.get<User>('/api/auth/profile/')
    return data
}
