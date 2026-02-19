import { useEffect, useState, useCallback } from 'react'
import {
    getMySessions,
    createSession,
    requestJoinByCode,
} from '@/entities/session'
import type { Session } from '@/entities/session'

export function useSessions(isAuthenticated: boolean) {
    const [sessions, setSessions] = useState<Session[]>([])
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
    const [newSessionName, setNewSessionName] = useState('')
    const [joinCode, setJoinCode] = useState('')
    const [joinMessage, setJoinMessage] = useState<string | null>(null)

    const loadSessions = useCallback(async () => {
        try {
            const list = (await getMySessions()).sort((a, b) => a.id - b.id)
            setSessions(list)
            setActiveSessionId((prev) => {
                if (prev != null && list.some((s) => s.id === prev))
                    return prev
                return list.length > 0 ? list[0].id : null
            })
        } catch (e) {
            console.error('Ошибка загрузки сессий:', e)
        }
    }, [])

    useEffect(() => {
        if (isAuthenticated) {
            loadSessions()
        } else {
            setSessions([])
            setActiveSessionId(null)
        }
    }, [isAuthenticated, loadSessions])

    useEffect(() => {
        if (!isAuthenticated) return
        const interval = setInterval(loadSessions, 15000)
        return () => clearInterval(interval)
    }, [isAuthenticated, loadSessions])

    const handleCreateSession = useCallback(async () => {
        if (!newSessionName.trim()) return
        try {
            const s = await createSession(newSessionName.trim())
            setSessions((prev) => [s, ...prev])
            setActiveSessionId(s.id)
            setNewSessionName('')
        } catch (e) {
            console.error('Ошибка создания сессии:', e)
        }
    }, [newSessionName])

    const handleJoinByCode = useCallback(async () => {
        if (!joinCode.trim()) return
        try {
            const jr = await requestJoinByCode(joinCode.trim())
            setJoinMessage(
                jr.status === 'pending'
                    ? 'Заявка отправлена'
                    : `Статус: ${jr.status}`
            )
            setJoinCode('')
        } catch (e: unknown) {
            const err = e as { response?: { data?: { error?: string } } }
            setJoinMessage(
                err?.response?.data?.error ?? 'Ошибка отправки заявки'
            )
        }
    }, [joinCode])

    return {
        sessions,
        setSessions,
        activeSessionId,
        setActiveSessionId,
        newSessionName,
        setNewSessionName,
        joinCode,
        setJoinCode,
        joinMessage,
        loadSessions,
        handleCreateSession,
        handleJoinByCode,
    }
}
