import { $host } from '@/shared/api'
import type { Session, JoinRequest, SessionMember, AuditLogEntry } from '../model/types'

export const createSession = async (name: string): Promise<Session> => {
    const { data } = await $host.post<Session>('/api/sessions/', { name })
    return data
}

export const getMySessions = async (): Promise<Session[]> => {
    const { data } = await $host.get<Session[]>('/api/sessions/mine/')
    return data
}

export const requestJoinByCode = async (join_code: string): Promise<JoinRequest> => {
    const { data } = await $host.post<JoinRequest>('/api/sessions/join/', { join_code })
    return data
}

export const getPendingRequests = async (sessionId: number): Promise<JoinRequest[]> => {
    const { data } = await $host.get<JoinRequest[]>(`/api/sessions/${sessionId}/requests/`)
    return data
}

export const approveRequest = async (requestId: number): Promise<JoinRequest> => {
    const { data } = await $host.post<JoinRequest>(`/api/requests/${requestId}/approve/`)
    return data
}

export const denyRequest = async (requestId: number): Promise<JoinRequest> => {
    const { data } = await $host.post<JoinRequest>(`/api/requests/${requestId}/deny/`)
    return data
}

export const blockRequester = async (sessionId: number, userId: number): Promise<JoinRequest> => {
    const { data } = await $host.post<JoinRequest>(`/api/sessions/${sessionId}/block/${userId}/`)
    return data
}

export const unblockUser = async (
    sessionId: number,
    userId: number
): Promise<{ status: string }> => {
    const { data } = await $host.post<{ status: string }>(
        `/api/sessions/${sessionId}/unblock/${userId}/`
    )
    return data
}

export const getSessionMembers = async (sessionId: number): Promise<SessionMember[]> => {
    const { data } = await $host.get<SessionMember[]>(`/api/sessions/${sessionId}/members/`)
    return data
}

export const getSessionBlocked = async (sessionId: number): Promise<JoinRequest[]> => {
    const { data } = await $host.get<JoinRequest[]>(`/api/sessions/${sessionId}/blocked/`)
    return data
}

export const getSessionAuditLog = async (sessionId: number): Promise<AuditLogEntry[]> => {
    const { data } = await $host.get<AuditLogEntry[]>(`/api/sessions/${sessionId}/audit-log/`)
    return data
}

export const renameSession = async (
    sessionId: number,
    newName: string
): Promise<Session> => {
    const { data } = await $host.patch<Session>(`/api/sessions/${sessionId}/rename/`, {
        name: newName,
    })
    return data
}

export const changeMemberRole = async (
    sessionId: number,
    userId: number,
    role: 'admin' | 'moderator' | 'member'
): Promise<SessionMember> => {
    const { data } = await $host.post<SessionMember>(
        `/api/sessions/${sessionId}/members/${userId}/role/`,
        { role }
    )
    return data
}

export const removeMember = async (
    sessionId: number,
    userId: number
): Promise<{ status: string }> => {
    const { data } = await $host.post<{ status: string }>(
        `/api/sessions/${sessionId}/members/${userId}/remove/`
    )
    return data
}

export const refreshJoinCode = async (sessionId: number): Promise<Session> => {
    const { data } = await $host.post<Session>(`/api/sessions/${sessionId}/refresh-code/`)
    return data
}
