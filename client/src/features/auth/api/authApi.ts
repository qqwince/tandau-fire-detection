import { $host } from '@/shared/api'
import type { User } from '@/entities/user'

export interface AuthResponse {
    user: User
    tokens: { access: string; refresh: string }
}

export interface LoginData {
    username: string
    password: string
}

export interface RegisterData {
    username: string
    email: string
    password: string
    password_confirm: string
    first_name?: string
    last_name?: string
}

export interface RefreshResponse {
    access: string
}

export const loginUser = async (data: LoginData): Promise<AuthResponse> => {
    const { data: response } = await $host.post<AuthResponse>('/api/auth/login/', data)
    return response
}

export const registerUser = async (data: RegisterData): Promise<AuthResponse> => {
    const { data: response } = await $host.post<AuthResponse>('/api/auth/register/', data)
    return response
}

export const refreshToken = async (refreshTokenValue: string): Promise<RefreshResponse> => {
    const { data: response } = await $host.post<RefreshResponse>('/api/auth/refresh/', {
        refresh: refreshTokenValue,
    })
    return response
}
