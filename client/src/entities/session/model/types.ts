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
    requester_first_name?: string
    requester_last_name?: string
    requester_email?: string
    status: 'pending' | 'approved' | 'denied' | 'blocked'
    created_at: string
    updated_at: string
}

export interface SessionMember {
    id: number
    user: number
    username: string
    session: number
    role: 'admin' | 'moderator' | 'member'
    is_active: boolean
    created_at: string
}

export interface AuditLogEntry {
    id: number
    session: number
    actor: number | null
    actor_username: string
    action: 'approved' | 'denied' | 'blocked' | 'unblocked' | 'removed' | 'role_changed'
    action_display: string
    target_user: number | null
    target_username: string
    role_granted?: string | null
    role_display?: string | null
    created_at: string
}
