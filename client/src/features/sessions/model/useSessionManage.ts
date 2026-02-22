import { useState, useCallback, useEffect } from 'react'
import {
    getPendingRequests,
    approveRequest as approveRequestApi,
    denyRequest as denyRequestApi,
    blockRequester as blockRequesterApi,
    unblockUser as unblockUserApi,
    getSessionMembers,
    getSessionBlocked,
    getSessionAuditLog,
    renameSession as renameSessionApi,
    changeMemberRole as changeMemberRoleApi,
    removeMember as removeMemberApi,
    refreshJoinCode as refreshJoinCodeApi,
} from '@/entities/session'
import type {
    Session,
    JoinRequest,
    SessionMember,
    AuditLogEntry,
} from '@/entities/session'

export type ManageTab = 'code' | 'requests' | 'blocked' | 'members' | 'logs'

export function useSessionManage(
    activeSessionId: number | null,
    sessions: Session[],
    showManageModal: boolean,
    loadSessions: () => Promise<void>
) {
    const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([])
    const [manageTab, setManageTab] = useState<ManageTab>('code')
    const [manageMembers, setManageMembers] = useState<SessionMember[]>([])
    const [manageBlocked, setManageBlocked] = useState<JoinRequest[]>([])
    const [manageLogs, setManageLogs] = useState<AuditLogEntry[]>([])
    const [manageLoading, setManageLoading] = useState(false)
    const [manageError, setManageError] = useState<string | null>(null)
    const [codeRefreshLoading, setCodeRefreshLoading] = useState(false)
    const [refreshedJoinCode, setRefreshedJoinCode] = useState<string | null>(
        null
    )
    const [codeCopied, setCodeCopied] = useState(false)
    const [showSessionCodes, setShowSessionCodes] = useState(false)
    const [codeConfirmPending, setCodeConfirmPending] = useState(false)
    const [codeConfirmCountdown, setCodeConfirmCountdown] = useState(0)
    const [editingSessionName, setEditingSessionName] = useState(false)
    const [editingSessionNameValue, setEditingSessionNameValue] = useState('')

    const loadPendingRequests = useCallback(async (sessionId: number) => {
        try {
            const reqs = await getPendingRequests(sessionId)
            setPendingRequests(reqs)
        } catch (e) {
            console.error('Ошибка загрузки заявок:', e)
        }
    }, [])

    const loadManageData = useCallback(async () => {
        if (!activeSessionId) return
        setManageLoading(true)
        setManageError(null)
        try {
            const [members, blocked, logs] = await Promise.all([
                getSessionMembers(activeSessionId),
                getSessionBlocked(activeSessionId),
                getSessionAuditLog(activeSessionId),
            ])
            setManageMembers(members)
            setManageBlocked(blocked)
            setManageLogs(logs)
        } catch (e: unknown) {
            const err = e as { response?: { status?: number } }
            setManageError(
                err?.response?.status === 403
                    ? 'Нет доступа. Только администраторы сессии могут просматривать.'
                    : 'Ошибка загрузки данных'
            )
        } finally {
            setManageLoading(false)
        }
    }, [activeSessionId])

    useEffect(() => {
        if (!activeSessionId) setPendingRequests([])
    }, [activeSessionId])

    useEffect(() => {
        if (!showManageModal || !activeSessionId) return
        const refresh = () => {
            loadPendingRequests(activeSessionId)
            // Не обновлять список участников по таймеру на вкладке «Участники», чтобы не закрывался открытый select с ролями
            if (manageTab !== 'members') {
                loadManageData()
            }
            loadSessions()
        }
        const interval = setInterval(refresh, 5000)
        return () => clearInterval(interval)
    }, [showManageModal, activeSessionId, manageTab, loadPendingRequests, loadManageData, loadSessions])

    useEffect(() => {
        if (!showManageModal || manageTab !== 'code') {
            setCodeConfirmPending(false)
            setCodeConfirmCountdown(0)
            return
        }
        if (!codeConfirmPending || codeConfirmCountdown <= 0) return
        const t = setInterval(() => {
            setCodeConfirmCountdown((c) => (c <= 1 ? 0 : c - 1))
        }, 1000)
        return () => clearInterval(t)
    }, [showManageModal, manageTab, codeConfirmPending, codeConfirmCountdown])

    const approveRequest = useCallback(
        async (id: number) => {
            try {
                await approveRequestApi(id)
                if (activeSessionId) {
                    loadPendingRequests(activeSessionId)
                    if (showManageModal) loadManageData()
                }
            } catch (e) {
                console.error('Ошибка утверждения:', e)
            }
        },
        [activeSessionId, showManageModal, loadPendingRequests, loadManageData]
    )

    const denyRequest = useCallback(
        async (id: number) => {
            try {
                await denyRequestApi(id)
                if (activeSessionId) {
                    loadPendingRequests(activeSessionId)
                    if (showManageModal) loadManageData()
                }
            } catch (e) {
                console.error('Ошибка отклонения:', e)
            }
        },
        [activeSessionId, showManageModal, loadPendingRequests, loadManageData]
    )

    const blockRequester = useCallback(
        async (userId: number) => {
            if (!activeSessionId) return
            try {
                await blockRequesterApi(activeSessionId, userId)
                loadPendingRequests(activeSessionId)
                if (showManageModal) loadManageData()
            } catch (e) {
                console.error('Ошибка блокировки:', e)
            }
        },
        [activeSessionId, showManageModal, loadPendingRequests, loadManageData]
    )

    const unblockUser = useCallback(
        async (userId: number) => {
            if (!activeSessionId) return
            try {
                await unblockUserApi(activeSessionId, userId)
                loadManageData()
            } catch (e) {
                console.error('Ошибка разблокировки:', e)
            }
        },
        [activeSessionId, loadManageData]
    )

    const handleRenameSession = useCallback(async () => {
        if (!activeSessionId || !editingSessionNameValue.trim()) return
        try {
            await renameSessionApi(activeSessionId, editingSessionNameValue.trim())
            await loadSessions()
            setEditingSessionName(false)
            loadManageData()
        } catch (e) {
            console.error('Ошибка переименования:', e)
        }
    }, [activeSessionId, editingSessionNameValue, loadSessions, loadManageData])

    const handleChangeRole = useCallback(
        async (
            userId: number,
            newRole: 'admin' | 'moderator' | 'member'
        ) => {
            if (!activeSessionId) return
            try {
                await changeMemberRoleApi(activeSessionId, userId, newRole)
                loadManageData()
            } catch (e) {
                console.error('Ошибка изменения роли:', e)
            }
        },
        [activeSessionId, loadManageData]
    )

    const handleRemoveMember = useCallback(
        async (userId: number) => {
            if (!activeSessionId) return
            try {
                await removeMemberApi(activeSessionId, userId)
                await loadSessions()
                loadManageData()
            } catch (e) {
                console.error('Ошибка исключения участника:', e)
            }
        },
        [activeSessionId, loadSessions, loadManageData]
    )

    const handleRefreshJoinCode = useCallback(async () => {
        if (!activeSessionId) return
        setCodeRefreshLoading(true)
        try {
            const updated = await refreshJoinCodeApi(activeSessionId)
            setRefreshedJoinCode(updated.join_code)
            setShowSessionCodes(true)
            return updated
        } catch (e) {
            console.error('Ошибка обновления кода:', e)
            return null
        } finally {
            setCodeRefreshLoading(false)
        }
    }, [activeSessionId])

    const openManageModal = useCallback(() => {
        setManageTab('code')
        setRefreshedJoinCode(null)
        setCodeCopied(false)
        loadManageData()
        if (activeSessionId) {
            loadPendingRequests(activeSessionId)
            const current = sessions.find((s) => s.id === activeSessionId)
            if (current) setEditingSessionNameValue(current.name)
        }
    }, [activeSessionId, sessions, loadManageData, loadPendingRequests])

    return {
        pendingRequests,
        manageTab,
        setManageTab,
        manageMembers,
        manageBlocked,
        manageLogs,
        manageLoading,
        manageError,
        codeRefreshLoading,
        refreshedJoinCode,
        setRefreshedJoinCode,
        codeCopied,
        setCodeCopied,
        showSessionCodes,
        setShowSessionCodes,
        codeConfirmPending,
        setCodeConfirmPending,
        codeConfirmCountdown,
        setCodeConfirmCountdown,
        editingSessionName,
        setEditingSessionName,
        editingSessionNameValue,
        setEditingSessionNameValue,
        loadPendingRequests,
        loadManageData,
        approveRequest,
        denyRequest,
        blockRequester,
        unblockUser,
        handleRenameSession,
        handleChangeRole,
        handleRemoveMember,
        handleRefreshJoinCode,
        openManageModal,
    }
}
