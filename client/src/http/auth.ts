import { $host } from './index.ts'

export interface User {
    id: number
    username: string
    email: string
    first_name: string
    last_name: string
    date_joined: string
}

export interface AuthResponse {
    user: User
    tokens: {
        access: string
        refresh: string
    }
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

export interface Session {
    id: number
    name: string
    owner: number
    owner_username: string
    join_code: string
    created_at: string
}

export interface JoinRequest {
    id: number
    session: number
    requester: number
    requester_username: string
    status: 'pending' | 'approved' | 'denied' | 'blocked'
    created_at: string
    updated_at: string
}

// Регистрация пользователя
export const registerUser = async (data: RegisterData): Promise<AuthResponse> => {
    const { data: response } = await $host.post('/api/auth/register/', data)
    return response
}

// Вход пользователя
export const loginUser = async (data: LoginData): Promise<AuthResponse> => {
    const { data: response } = await $host.post('/api/auth/login/', data)
    return response
}

// Обновление токена
export const refreshToken = async (refreshToken: string): Promise<RefreshResponse> => {
    const { data: response } = await $host.post('/api/auth/refresh/', {
        refresh: refreshToken
    })
    return response
}

// Получение профиля пользователя
export const getUserProfile = async (): Promise<User> => {
    const { data: response } = await $host.get('/api/auth/profile/')
    return response
}

// -------- Sessions API --------
export const createSession = async (name: string): Promise<Session> => {
    const { data } = await $host.post('/api/sessions/', { name })
    return data
}

export const getMySessions = async (): Promise<Session[]> => {
    const { data } = await $host.get('/api/sessions/mine/')
    return data
}

export const requestJoinByCode = async (join_code: string): Promise<JoinRequest> => {
    const { data } = await $host.post('/api/sessions/join/', { join_code })
    return data
}

export const getPendingRequests = async (sessionId: number): Promise<JoinRequest[]> => {
    const { data } = await $host.get(`/api/sessions/${sessionId}/requests/`)
    return data
}

export const approveRequest = async (requestId: number): Promise<JoinRequest> => {
    const { data } = await $host.post(`/api/requests/${requestId}/approve/`)
    return data
}

export const denyRequest = async (requestId: number): Promise<JoinRequest> => {
    const { data } = await $host.post(`/api/requests/${requestId}/deny/`)
    return data
}

export const blockRequester = async (sessionId: number, userId: number): Promise<JoinRequest> => {
    const { data } = await $host.post(`/api/sessions/${sessionId}/block/${userId}/`)
    return data
}
