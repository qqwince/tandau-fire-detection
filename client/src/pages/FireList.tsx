import { useEffect, useState, useRef } from 'react'
import { fetchFireSites, type PaginationParams, type PaginatedResponse } from '../features/fires/api'
import { useAuth } from '../contexts/AuthContext.tsx'
import {
    createSession,
    getMySessions,
    requestJoinByCode,
    type Session,
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
    type JoinRequest,
    type SessionMember,
    type AuditLogEntry,
} from '../http/auth.ts'

import { type FireSite, type Filters, type ImagePosition, type SortField, type SortOrder } from '../features/fires/types'

const FireList = () => {
    const { isAuthenticated } = useAuth()
    const [sites, setSites] = useState<FireSite[]>([])
    const [loading, setLoading] = useState(true)
    const [hasLoaded, setHasLoaded] = useState(false)
    const [sessions, setSessions] = useState<Session[]>([])
    const [showSessionCodes, setShowSessionCodes] = useState(false)
    const [codeConfirmPending, setCodeConfirmPending] = useState(false)
    const [codeConfirmCountdown, setCodeConfirmCountdown] = useState(0)
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
    const [newSessionName, setNewSessionName] = useState('')
    const [joinCode, setJoinCode] = useState('')
    const [joinMessage, setJoinMessage] = useState<string | null>(null)
    const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([])
    const [showManageModal, setShowManageModal] = useState(false)
    const [manageTab, setManageTab] = useState<'code' | 'requests' | 'blocked' | 'members' | 'logs'>('code')
    const [manageMembers, setManageMembers] = useState<SessionMember[]>([])
    const [manageBlocked, setManageBlocked] = useState<JoinRequest[]>([])
    const [manageLogs, setManageLogs] = useState<AuditLogEntry[]>([])
    const [manageLoading, setManageLoading] = useState(false)
    const [codeRefreshLoading, setCodeRefreshLoading] = useState(false)
    /** Код, возвращённый последним запросом «Обновить», чтобы гарантированно отобразить новый код */
    const [refreshedJoinCode, setRefreshedJoinCode] = useState<string | null>(null)
    const [codeCopied, setCodeCopied] = useState(false)
    const [manageError, setManageError] = useState<string | null>(null)
    const [editingSessionName, setEditingSessionName] = useState(false)
    const [editingSessionNameValue, setEditingSessionNameValue] = useState('')
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const [imageScale, setImageScale] = useState(1)
    const [imagePosition, setImagePosition] = useState<ImagePosition>({
        x: 0,
        y: 0,
    })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<ImagePosition>({ x: 0, y: 0 })
    const [showControls, setShowControls] = useState(true)
    const [approvedSites, setApprovedSites] = useState<Set<string>>(new Set())
    const [animatingApprovals, setAnimatingApprovals] = useState<Set<string>>(
        new Set()
    )
    const imageRef = useRef<HTMLImageElement>(null)
    const [filters, setFilters] = useState<Filters>({
        selectedLocations: [],
        sortField: 'time',
        sortOrder: 'desc',
        confMin: 30,
        confMax: 100,
    })

    // Состояние пагинации
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        pageSize: 10,
        hasNext: false,
        hasPrevious: false,
    })

    // Ключ списка сессий: при изменении (например, приняли в новую сессию) перезапрашиваем отчёты
    const sessionIdsKey = sessions.map((s) => s.id).sort().join(',')

    useEffect(() => {
        // Показываем большой лоадер только при самом первом входе
        loadSites(true)
    }, [filters, pagination.currentPage, pagination.pageSize, activeSessionId, sessionIdsKey])

    // Live updates via SSE (stable) with polling fallback
    useEffect(() => {
        const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
        if (!base) return

        let es: EventSource | null = null
        ;(window as any).__fires_sse_active = false

        const connectSSE = () => {
            try {
                const streamUrl = `${base}api/fires/stream/`
                es = new EventSource(streamUrl)
                es.onopen = () => {
                    ;(window as any).__fires_sse_active = true
                }
                es.onmessage = (ev) => {
                    try {
                        const msg = JSON.parse(ev.data)
                        if (msg?.type === 'fire_created') {
                            const newItem = {
                                id: String(msg.id),
                                location: msg.location,
                                time: msg.time,
                                description: `Автоматическое обнаружение на ${msg.location}`,
                                latitude: Number(msg.latitude ?? 0),
                                longitude: Number(msg.longitude ?? 0),
                                image: msg.image || '',
                                conf: Number(msg.conf ?? 0),
                            } as FireSite

                            const locationOk =
                                filters.selectedLocations.length === 0 ||
                                filters.selectedLocations.includes(newItem.location)
                            const confOk =
                                Math.round(newItem.conf) >= filters.confMin &&
                                Math.round(newItem.conf) <= filters.confMax
                            const sessionOk =
                                !activeSessionId || Number(msg.session) === activeSessionId

                            if (locationOk && confOk && sessionOk) {
                                setSites((prev) => {
                                    const exists = prev.some((s) => s.id === newItem.id)
                                    if (exists) return prev
                                    const merged = [newItem, ...prev]
                                    return merged.slice(0, pagination.pageSize)
                                })
                                setPagination((prev) => ({
                                    ...prev,
                                    totalCount: prev.totalCount + 1,
                                }))
                            }
                        }
                    } catch {}
                }
                es.onerror = () => {
                    ;(window as any).__fires_sse_active = false
                }
            } catch {
                // noop, will rely on polling
            }
        }

        connectSSE()

        return () => {
            try { es && es.close() } catch {}
        }
    }, [filters, pagination.currentPage, pagination.pageSize, activeSessionId])

    // Background polling only if both WS and SSE are down
    useEffect(() => {
        const interval = setInterval(() => {
            const sseActive = (window as any).__fires_sse_active
            if (!sseActive) {
                loadSites()
            }
        }, 15000)
        return () => clearInterval(interval)
    }, [filters, pagination.currentPage, pagination.pageSize, activeSessionId])

    useEffect(() => {
        if (isAuthenticated) {
            loadSessions()
        } else {
            setSessions([])
            setActiveSessionId(null)
        }
    }, [isAuthenticated])

    // Периодически обновляем список сессий, чтобы новые приглашения
    // появлялись без перезагрузки страницы
    useEffect(() => {
        if (!isAuthenticated) return
        const interval = setInterval(() => {
            loadSessions()
        }, 15000)
        return () => clearInterval(interval)
    }, [isAuthenticated])

    useEffect(() => {
        if (!isAuthenticated || !activeSessionId) {
            setPendingRequests([])
        }
    }, [isAuthenticated, activeSessionId])

    // Динамическое обновление заявок и данных модалки, пока она открыта
    useEffect(() => {
        if (!showManageModal || !activeSessionId) return
        const refresh = () => {
            loadPendingRequests(activeSessionId)
            loadManageData()
            loadSessions()
        }
        const interval = setInterval(refresh, 5000)
        return () => clearInterval(interval)
    }, [showManageModal, activeSessionId])

    // Таймер подтверждения показа кода (3 сек)
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

    // Keyboard and mouse event handlers for image modal
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (selectedImage) {
                switch (event.key) {
                    case 'Escape':
                        closeImageModal()
                        break
                    case 'r':
                    case 'R':
                        resetImagePosition()
                        break
                }
            }
        }

        const handleMouseMove = (event: MouseEvent) => {
            if (isDragging && selectedImage) {
                const deltaX = event.clientX - dragStart.x
                const deltaY = event.clientY - dragStart.y
                const factor = 0.45
                setImagePosition((prev) => ({
                    x: prev.x + deltaX * factor,
                    y: prev.y + deltaY * factor,
                }))
                setDragStart({ x: event.clientX, y: event.clientY })
            }
        }

        const handleMouseUp = () => {
            setIsDragging(false)
        }

        // Auto-hide controls when zooming
        let hideControlsTimer: ReturnType<typeof setTimeout>
        if (selectedImage && imageScale > 1.25) {
            hideControlsTimer = setTimeout(() => {
                setShowControls(false)
            }, 2000)
        } else {
            setShowControls(true)
        }

        const handleWheel = (event: WheelEvent) => {
            if (selectedImage) {
                event.preventDefault()
                const delta = event.deltaY > 0 ? -0.1 : 0.1
                setImageScale((prev) => {
                    const newScale = Math.max(0.5, Math.min(3, prev + delta))
                    if (newScale > 1.25) {
                        setTimeout(() => setShowControls(false), 2000)
                    } else {
                        setShowControls(true)
                    }
                    return newScale
                })
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        window.addEventListener('wheel', handleWheel, { passive: false })

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('wheel', handleWheel)
            if (hideControlsTimer) clearTimeout(hideControlsTimer)
        }
    }, [selectedImage, isDragging, dragStart, imageScale])

    // Mouse enter/leave to show/hide controls
    const handleModalMouseEnter = () => {
        setShowControls(true)
    }

    const handleModalMouseLeave = () => {
        if (imageScale > 1.25) {
            setTimeout(() => setShowControls(false), 1000)
        }
    }

    const loadSites = async (showInitialSpinner = false) => {
        try {
            // Избегаем глобального спиннера после первого рендера
            if (showInitialSpinner && !hasLoaded) {
                setLoading(true)
            }

            const params: PaginationParams = {
                page: pagination.currentPage,
                page_size: pagination.pageSize,
                sort_field: filters.sortField,
                sort_order: filters.sortOrder,
                conf_min: filters.confMin,
                conf_max: filters.confMax,
            }
            if (activeSessionId) params.session_id = activeSessionId

            // Добавляем фильтр по локации если выбраны конкретные локации
            if (filters.selectedLocations.length > 0) {
                // Для множественного выбора локаций используем первую выбранную
                // В будущем можно расширить API для поддержки массива локаций
                params.location = filters.selectedLocations[0]
            }

            const data: PaginatedResponse<FireSite> =
                await fetchFireSites(params)

            // Мягкая замена данных без пустого экрана
            const newList = data.results || []
            setSites((prev: FireSite[]) => {
                if (!prev.length) return newList
                // Попробуем сохранить плавность: если сортировка по времени desc —
                // добавляем новые сверху, существующие оставляем
                const byId = new Map(prev.map((s) => [s.id, s]))
                const merged: FireSite[] = []
                for (const item of newList) {
                    merged.push(byId.get(item.id) ?? item)
                }
                return merged
            })
            setPagination((prev: typeof pagination) => ({
                ...prev,
                totalPages: data.total_pages,
                totalCount: data.count,
                hasNext: data.has_next,
                hasPrevious: data.has_previous,
            }))
        } catch (error) {
            console.error('Ошибка при загрузке:', error)
            // Не очищаем текущие карточки чтобы избежать мигания
        } finally {
            setLoading(false)
            setHasLoaded(true)
        }
    }

    const loadSessions = async () => {
        try {
            const list = (await getMySessions()).sort((a, b) => a.id - b.id)
            setSessions(list)
            setActiveSessionId((prev) => {
                if (prev != null && list.some((s) => s.id === prev)) return prev
                return list.length > 0 ? list[0].id : null
            })
        } catch (e) {
            console.error('Ошибка загрузки сессий:', e)
        }
    }

    const loadPendingRequests = async (sessionId: number) => {
        try {
            const reqs = await getPendingRequests(sessionId)
            setPendingRequests(reqs)
        } catch (e) {
            console.error('Ошибка загрузки заявок:', e)
        }
    }

    const handleCreateSession = async () => {
        if (!newSessionName.trim()) return
        try {
            const s = await createSession(newSessionName.trim())
            setSessions((prev) => [s, ...prev])
            setActiveSessionId(s.id)
            setNewSessionName('')
        } catch (e) {
            console.error('Ошибка создания сессии:', e)
        }
    }

    const handleJoinByCode = async () => {
        if (!joinCode.trim()) return
        try {
            const jr = await requestJoinByCode(joinCode.trim())
            setJoinMessage(
                jr.status === 'pending'
                    ? 'Заявка отправлена'
                    : `Статус: ${jr.status}`
            )
            setJoinCode('')
        } catch (e: any) {
            setJoinMessage(e?.response?.data?.error || 'Ошибка отправки заявки')
        }
    }

    const approveRequest = async (id: number) => {
        try {
            await approveRequestApi(id)
            if (activeSessionId) {
                loadPendingRequests(activeSessionId)
                if (showManageModal) loadManageData()
            }
        } catch (e) {
            console.error('Ошибка утверждения:', e)
        }
    }

    const denyRequest = async (id: number) => {
        try {
            await denyRequestApi(id)
            if (activeSessionId) {
                loadPendingRequests(activeSessionId)
                if (showManageModal) loadManageData()
            }
        } catch (e) {
            console.error('Ошибка отклонения:', e)
        }
    }

    const blockRequester = async (userId: number) => {
        try {
            if (!activeSessionId) return
            await blockRequesterApi(activeSessionId, userId)
            loadPendingRequests(activeSessionId)
            if (showManageModal) loadManageData()
        } catch (e) {
            console.error('Ошибка блокировки:', e)
        }
    }

    const loadManageData = async () => {
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
            setManageError(err?.response?.status === 403 ? 'Нет доступа. Только администраторы сессии могут просматривать.' : 'Ошибка загрузки данных')
        } finally {
            setManageLoading(false)
        }
    }

    const openManageModal = () => {
        setShowManageModal(true)
        setManageTab('code')
        setRefreshedJoinCode(null)
        setCodeCopied(false)
        loadManageData()
        if (activeSessionId) {
            loadPendingRequests(activeSessionId)
            const currentSession = sessions.find(s => s.id === activeSessionId)
            if (currentSession) {
                setEditingSessionNameValue(currentSession.name)
            }
        }
    }

    const handleRenameSession = async () => {
        if (!activeSessionId || !editingSessionNameValue.trim()) return
        try {
            await renameSessionApi(activeSessionId, editingSessionNameValue.trim())
            await loadSessions()
            setEditingSessionName(false)
            loadManageData()
        } catch (e) {
            console.error('Ошибка переименования:', e)
        }
    }

    const handleChangeRole = async (userId: number, newRole: 'admin' | 'moderator' | 'member') => {
        if (!activeSessionId) return
        try {
            await changeMemberRoleApi(activeSessionId, userId, newRole)
            loadManageData()
        } catch (e) {
            console.error('Ошибка изменения роли:', e)
        }
    }

    const handleRemoveMember = async (userId: number) => {
        if (!activeSessionId) return
        try {
            await removeMemberApi(activeSessionId, userId)
            await loadSessions()
            loadManageData()
        } catch (e) {
            console.error('Ошибка исключения участника:', e)
        }
    }

    const unblockUser = async (userId: number) => {
        try {
            if (!activeSessionId) return
            await unblockUserApi(activeSessionId, userId)
            loadManageData()
        } catch (e) {
            console.error('Ошибка разблокировки:', e)
        }
    }

    const updateFilters = (updates: Partial<Filters>) => {
        setFilters((prev) => ({ ...prev, ...updates }))
        // Сбрасываем пагинацию при изменении фильтров
        setPagination((prev) => ({ ...prev, currentPage: 1 }))
    }

    const toggleLocation = (location: string) => {
        const newLocations = filters.selectedLocations.includes(location)
            ? filters.selectedLocations.filter((loc: string) => loc !== location)
            : [...filters.selectedLocations, location]

        updateFilters({ selectedLocations: newLocations })
    }

    // Функции для управления пагинацией
    const goToPage = (page: number) => {
        if (page >= 1 && page <= pagination.totalPages) {
            setPagination((prev) => ({ ...prev, currentPage: page }))
        }
    }

    const goToNextPage = () => {
        if (pagination.hasNext) {
            goToPage(pagination.currentPage + 1)
        }
    }

    const goToPreviousPage = () => {
        if (pagination.hasPrevious) {
            goToPage(pagination.currentPage - 1)
        }
    }

    const changePageSize = (newPageSize: number) => {
        setPagination((prev) => ({
            ...prev,
            pageSize: newPageSize,
            currentPage: 1, // Сбрасываем на первую страницу при изменении размера
        }))
    }

    const handleApproval = (siteId: string, event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()

        // Добавляем анимацию
        setAnimatingApprovals((prev) => new Set([...prev, siteId]))

        setTimeout(() => {
            setApprovedSites((prev) => {
                const newSet = new Set(prev)
                if (newSet.has(siteId)) {
                    newSet.delete(siteId)
                } else {
                    newSet.add(siteId)
                }
                return newSet
            })

            // Убираем анимацию через короткое время
            setTimeout(() => {
                setAnimatingApprovals((prev) => {
                    const newSet = new Set(prev)
                    newSet.delete(siteId)
                    return newSet
                })
            }, 300)
        }, 150)
    }

    const openImageModal = (imageUrl: string) => {
        setSelectedImage(imageUrl)
        setImageScale(1)
        setImagePosition({ x: 0, y: 0 })
        setShowControls(true)
    }

    const closeImageModal = () => {
        setSelectedImage(null)
        setImageScale(1)
        setImagePosition({ x: 0, y: 0 })
        setIsDragging(false)
        setShowControls(true)
    }

    const resetImagePosition = () => {
        setImagePosition({ x: 0, y: 0 })
        setImageScale(1)
        setShowControls(true)
    }

    const handleImageMouseDown = (event: React.MouseEvent) => {
        if (imageScale > 1) {
            event.preventDefault()
            setIsDragging(true)
            setDragStart({ x: event.clientX, y: event.clientY })
        }
    }

    if (!hasLoaded && loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="animate-fade-in text-center">
                    <div className="mb-4 animate-bounce text-6xl">🔥</div>
                    <p className="animate-pulse text-2xl font-bold text-gray-700">
                        Загрузка данных...
                    </p>
                    <div className="mx-auto mt-4 h-1 w-16 animate-pulse rounded-full bg-gradient-to-r from-red-500 to-orange-500"></div>
                </div>
            </div>
        )
    }

    const locations = Array.from(new Set(sites.map((site) => site.location)))

    return (
        <div className="min-h-screen">
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes scaleIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }

                @keyframes approvalPulse {
                    0% {
                        transform: scale(1);
                    }
                    50% {
                        transform: scale(1.2);
                        filter: brightness(1.2);
                    }
                    100% {
                        transform: scale(1);
                    }
                }

                @keyframes checkmarkDraw {
                    0% {
                        stroke-dashoffset: 20;
                        opacity: 0;
                    }
                    50% {
                        opacity: 1;
                    }
                    100% {
                        stroke-dashoffset: 0;
                        opacity: 1;
                    }
                }

                @keyframes sparkle {
                    0%,
                    100% {
                        transform: scale(0) rotate(0deg);
                        opacity: 0;
                    }
                    50% {
                        transform: scale(1) rotate(180deg);
                        opacity: 1;
                    }
                }

                .animate-fade-in {
                    animation: fadeIn 0.6s ease-out;
                }

                .animate-slide-up {
                    animation: slideUp 0.4s ease-out;
                }

                .animate-scale-in {
                    animation: scaleIn 0.3s ease-out;
                }

                .animate-approval-pulse {
                    animation: approvalPulse 0.3s ease-out;
                }

                .animate-checkmark-draw {
                    animation: checkmarkDraw 0.3s ease-out;
                }

                .animate-sparkle {
                    animation: sparkle 0.6s ease-out;
                }

                .stagger-1 {
                    animation-delay: 0.1s;
                }
                .stagger-2 {
                    animation-delay: 0.2s;
                }
                .stagger-3 {
                    animation-delay: 0.3s;
                }

                .draggable-cursor {
                    cursor: ${
                        imageScale > 1
                            ? isDragging
                                ? 'grabbing'
                                : 'grab'
                            : 'default'
                    };
                }

                .controls-fade {
                    transition:
                        opacity 0.3s ease-in-out,
                        transform 0.3s ease-in-out;
                    opacity: ${showControls ? '1' : '0'};
                    transform: ${
                        showControls ? 'translateY(0)' : 'translateY(-10px)'
                    };
                    pointer-events: ${showControls ? 'auto' : 'none'};
                }

                .approval-button {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .approval-button:hover {
                    transform: translateY(-1px);
                    filter: brightness(1.1);
                }

                .approval-button:active {
                    transform: scale(0.95);
                }

                .checkmark-path {
                    stroke-dasharray: 20;
                    stroke-dashoffset: 20;
                }

                .approved .checkmark-path {
                    animation: checkmarkDraw 0.3s ease-out forwards;
                }
            `}</style>

            <div className="animate-fade-in mt-[60px] flex justify-center px-4">
                <section className="w-full max-w-7xl">
                    <div className="animate-slide-up mb-8 text-center">
                        <h2 className="mb-2 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-3xl font-bold">
                            🔥 Мониторинг пожаров
                        </h2>
                        <p className="text-gray-600">
                            Показано{' '}
                            <span className="font-semibold text-red-600">
                                {sites.length}
                            </span>{' '}
                            из {pagination.totalCount} активных очагов
                            {approvedSites.size > 0 && (
                                <span className="ml-2">
                                    •{' '}
                                    <span className="font-semibold text-green-600">
                                        {approvedSites.size}
                                    </span>{' '}
                                    подтверждено
                                </span>
                            )}
                        </p>
                    </div>
                    {isAuthenticated && (
                        <div className="animate-scale-in mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="flex-1">
                                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                                        Текущая сессия
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <select
                                            value={activeSessionId ?? ''}
                                            onChange={(e) =>
                                                setActiveSessionId(
                                                    e.target.value
                                                        ? Number(e.target.value)
                                                        : null
                                                )
                                            }
                                            className="w-72 rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                                        >
                                            <option value="">Все сессии</option>
                                            {sessions.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name}
                                                </option>
                                            ))}
                                        </select>
                                        {activeSessionId && (
                                            <button
                                                onClick={openManageModal}
                                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                                            >
                                                Управление
                                            </button>
                                        )}
                                    </div>
                                    
                                </div>
                                <div className="flex-1">
                                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                                        Создать сессию
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            value={newSessionName}
                                            onChange={(e) =>
                                                setNewSessionName(
                                                    e.target.value
                                                )
                                            }
                                            placeholder="Название"
                                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                                        />
                                        <button
                                            onClick={handleCreateSession}
                                            className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
                                        >
                                            Создать
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                                        Присоединиться по коду
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            value={joinCode}
                                            onChange={(e) =>
                                                setJoinCode(e.target.value)
                                            }
                                            placeholder="Код приглашения"
                                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                                        />
                                        <button
                                            onClick={handleJoinByCode}
                                            className="rounded-lg bg-gray-800 px-4 py-2 font-medium text-white hover:bg-gray-900"
                                        >
                                            Отправить
                                        </button>
                                    </div>
                                    {joinMessage && (
                                        <p className="mt-2 text-sm text-gray-600">
                                            {joinMessage}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    

                    {/* Панель фильтров */}
                    <div className="animate-scale-in mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg transition-all duration-300 hover:shadow-xl">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                            {/* Фильтр по локации */}
                            <div className="animate-slide-up stagger-1">
                                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                                    📍 Локация
                                </h3>

                                <div className="max-h-32 space-y-2 overflow-hidden overflow-y-auto">
                                    {locations.map((location, index) => (
                                        <label
                                            key={location}
                                            className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-all duration-200 hover:scale-[1.02] hover:bg-gray-50"
                                            style={{
                                                animationDelay: `${index * 0.05}s`,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.selectedLocations.includes(
                                                    location
                                                )}
                                                onChange={() =>
                                                    toggleLocation(location)
                                                }
                                                className="h-4 w-4 rounded text-red-600 transition-all duration-200 focus:ring-red-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">
                                                {location}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Фильтр по confidence */}
                            <div className="animate-slide-up stagger-2 ">
                                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                                    🎯 Точность детекции
                                </h3>
                                <div className="flex flex-col gap-4">
                                    {/* Ползунок для минимальной точности детекции */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-gray-500">
                                            Мин. точность детекции:
                                        </span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={filters.confMin}
                                            onChange={(e) =>
                                                updateFilters({
                                                    confMin: Math.min(
                                                        Number(e.target.value),
                                                        filters.confMax
                                                    ),
                                                })
                                            }
                                            className="h-1 w-full cursor-pointer accent-red-500"
                                        />
                                    </div>
                                    {/* Два input в одной строке */}
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2">
                                            <span className="text-sm font-medium">
                                                От:
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={filters.confMin}
                                                onChange={(e) =>
                                                    updateFilters({
                                                        confMin: Math.max(
                                                            0,
                                                            Number(e.target.value)
                                                        ),
                                                    })
                                                }
                                                className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center transition-all duration-200 focus:scale-105 focus:border-red-500 focus:outline-none"
                                            />
                                            <span className="text-sm text-gray-600">
                                                %
                                            </span>
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <span className="text-sm font-medium">
                                                До:
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={filters.confMax}
                                                onChange={(e) =>
                                                    updateFilters({
                                                        confMax: Math.min(
                                                            100,
                                                            Number(e.target.value)
                                                        ),
                                                    })
                                                }
                                                className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center transition-all duration-200 focus:scale-105 focus:border-red-500 focus:outline-none"
                                            />
                                            <span className="text-sm text-gray-600">
                                                %
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Сортировка и пагинация */}
                            <div className="animate-slide-up stagger-3">
                                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                                    📊 Сортировка
                                </h3>
                                <div className="space-y-3">
                                    <select
                                        value={filters.sortField}
                                        onChange={(e) =>
                                            updateFilters({
                                                sortField: e.target
                                                    .value as SortField,
                                            })
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 transition-all duration-200 hover:scale-[1.02] focus:border-red-500 focus:outline-none"
                                    >
                                        <option value="time">
                                            ⏰ По времени
                                        </option>
                                        <option value="conf">
                                            🎯 По точности
                                        </option>
                                    </select>

                                    <select
                                        value={filters.sortOrder}
                                        onChange={(e) =>
                                            updateFilters({
                                                sortOrder: e.target
                                                    .value as SortOrder,
                                            })
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 transition-all duration-200 hover:scale-[1.02] focus:border-red-500 focus:outline-none"
                                    >
                                        <option value="desc">
                                            {filters.sortField === 'time'
                                                ? '📅 Сначала новые'
                                                : '📈 Сначала высокие'}
                                        </option>
                                        <option value="asc">
                                            {filters.sortField === 'time'
                                                ? '📅 Сначала старые'
                                                : '📉 Сначала низкие'}
                                        </option>
                                    </select>

                                    <div className="mt-4">
                                        <h4 className="mb-2 text-sm font-semibold text-gray-700">
                                            📄 Записей на странице
                                        </h4>
                                        <select
                                            value={pagination.pageSize}
                                            onChange={(e) =>
                                                changePageSize(
                                                    Number(e.target.value)
                                                )
                                            }
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 transition-all duration-200 hover:scale-[1.02] focus:border-red-500 focus:outline-none"
                                        >
                                            <option value={5}>5</option>
                                            <option value={10}>10</option>
                                            <option value={20}>20</option>
                                            <option value={50}>50</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Список пожаров */}
                    {sites.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-gray-400">Нет данных по текущим фильтрам</p>
                        </div>
                    ) : (
                        <div className="grid gap-6">
                            {sites.map((site, index) => (
                                <div
                                    key={site.id}
                                    className={`animate-slide-up overflow-hidden rounded-2xl border shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
                                        approvedSites.has(site.id)
                                            ? 'border-green-300 bg-gradient-to-br from-green-50 to-white'
                                            : 'border-gray-200 bg-white'
                                    }`}
                                    style={{
                                        animationDelay: `${index * 0.1}s`,
                                    }}
                                >
                                    <div className="relative flex flex-col lg:flex-row">
                                        {site.image && (
                                            <div className="flex-shrink-0 lg:w-80 xl:w-96">
                                                <img
                                                    src={`${import.meta.env.VITE_API_URL}${site.image}`}
                                                    alt="Изображение пожара"
                                                    className="h-64 w-full cursor-pointer object-cover transition-all duration-300 hover:scale-105 hover:opacity-90 lg:h-full"
                                                    onClick={() =>
                                                        openImageModal(
                                                            `${import.meta.env.VITE_API_URL}${site.image}`
                                                        )
                                                    }
                                                />
                                            </div>
                                        )}

                                        <div className="flex-1 p-6">
                                            <div className="mb-4 flex items-start justify-between">
                                                <h3 className="flex items-center gap-2 text-xl font-bold text-gray-800">
                                                    <span>
                                                        📍 {site.location}
                                                        {site.session_name && (
                                                            <span className="ml-2 text-sm font-normal text-gray-500">
                                                                ({site.session_name})
                                                            </span>
                                                        )}
                                                    </span>
                                                    {approvedSites.has(
                                                        site.id
                                                    ) && (
                                                        <div className="animate-sparkle ml-2 text-green-600">
                                                            ✨
                                                        </div>
                                                    )}
                                                </h3>
                                                <div
                                                    className={`rounded-full px-3 py-1 text-xl font-bold transition-all duration-200 hover:scale-105 ${
                                                        Math.round(site.conf) >=
                                                        80
                                                            ? 'bg-red-100 text-red-800'
                                                            : Math.round(
                                                                    site.conf
                                                                ) >= 60
                                                              ? 'bg-orange-100 text-orange-800'
                                                              : Math.round(
                                                                      site.conf
                                                                  ) >= 40
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-gray-100 text-gray-800'
                                                    }`}
                                                >
                                                    {Math.round(site.conf)}%
                                                </div>
                                            </div>

                                            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <div className="flex items-center gap-2 text-gray-600 transition-all duration-200 hover:text-gray-800">
                                                    <span className="text-lg">
                                                        ⏰
                                                    </span>
                                                    <div>
                                                        <p className="text-sm text-gray-500">
                                                            Время обнаружения
                                                        </p>
                                                            <p className="font-medium">
                                                            {new Date(site.time).toLocaleString('kz-KZ', { timeZone: 'UTC' })}
                                                            </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 text-gray-600 transition-all duration-200 hover:text-gray-800">
                                                    <span className="text-lg">
                                                        🌐
                                                    </span>
                                                    <div>
                                                        <p className="text-sm text-gray-500">
                                                            Координаты
                                                        </p>
                                                        <p className="font-mono font-medium">
                                                            {site.latitude.toFixed(
                                                                4
                                                            )}
                                                            ,{' '}
                                                            {site.longitude.toFixed(
                                                                4
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {site.description && (
                                                <div className="rounded-lg bg-gray-50 p-4 transition-all duration-200 hover:bg-gray-100">
                                                    <p className="mb-1 text-sm text-gray-500">
                                                        📝 Описание
                                                    </p>
                                                    <p className="text-gray-700">
                                                        {site.description}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Кнопка одобрения */}
                                        <div className="absolute right-4 bottom-4">
                                            <button
                                                onClick={(e) =>
                                                    handleApproval(site.id, e)
                                                }
                                                className={`approval-button group relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
                                                    approvedSites.has(site.id)
                                                        ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                                                        : 'bg-white text-gray-500 hover:text-green-600'
                                                } ${
                                                    animatingApprovals.has(
                                                        site.id
                                                    )
                                                        ? 'animate-approval-pulse'
                                                        : ''
                                                }`}
                                                title={
                                                    approvedSites.has(site.id)
                                                        ? 'Отменить подтверждение'
                                                        : 'Подтвердить как реальный пожар'
                                                }
                                            >
                                                {approvedSites.has(site.id) ? (
                                                    <div className="approved relative">
                                                        <svg
                                                            className="h-6 w-6"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                className="checkmark-path"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={3}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                    </div>
                                                ) : (
                                                    <svg
                                                        className="h-6 w-6 transition-transform duration-200 group-hover:scale-110"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                )}

                                                {/* Эффект ряби при клике */}
                                                <div className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-active:bg-white group-active:opacity-30"></div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Панель пагинации */}
                    {pagination.totalPages > 1 && (
                        <div className="animate-fade-in mt-8 flex flex-col items-center justify-center space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                                <span>Страница</span>
                                <span className="font-semibold text-red-600">
                                    {pagination.currentPage}
                                </span>
                                <span>из</span>
                                <span className="font-semibold text-red-600">
                                    {pagination.totalPages}
                                </span>
                                <span>
                                    • Всего записей: {pagination.totalCount}
                                </span>
                            </div>

                            <div className="flex items-center space-x-2">
                                {/* Кнопка "Предыдущая" */}
                                <button
                                    onClick={goToPreviousPage}
                                    disabled={!pagination.hasPrevious}
                                    className={`flex items-center space-x-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                                        pagination.hasPrevious
                                            ? 'bg-red-50 text-red-700 hover:scale-105 hover:bg-red-100'
                                            : 'cursor-not-allowed bg-gray-100 text-gray-400'
                                    }`}
                                >
                                    <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 19l-7-7 7-7"
                                        />
                                    </svg>
                                    <span>Предыдущая</span>
                                </button>

                                {/* Номера страниц */}
                                <div className="flex items-center space-x-1">
                                    {Array.from(
                                        {
                                            length: Math.min(
                                                5,
                                                pagination.totalPages
                                            ),
                                        },
                                        (_, i) => {
                                            let pageNum
                                            if (pagination.totalPages <= 5) {
                                                pageNum = i + 1
                                            } else if (
                                                pagination.currentPage <= 3
                                            ) {
                                                pageNum = i + 1
                                            } else if (
                                                pagination.currentPage >=
                                                pagination.totalPages - 2
                                            ) {
                                                pageNum =
                                                    pagination.totalPages -
                                                    4 +
                                                    i
                                            } else {
                                                pageNum =
                                                    pagination.currentPage -
                                                    2 +
                                                    i
                                            }

                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() =>
                                                        goToPage(pageNum)
                                                    }
                                                    className={`h-10 w-10 rounded-lg text-sm font-medium transition-all duration-200 ${
                                                        pageNum ===
                                                        pagination.currentPage
                                                            ? 'bg-red-600 text-white shadow-lg'
                                                            : 'bg-gray-100 text-gray-700 hover:scale-105 hover:bg-red-50 hover:text-red-700'
                                                    }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            )
                                        }
                                    )}
                                </div>

                                {/* Кнопка "Следующая" */}
                                <button
                                    onClick={goToNextPage}
                                    disabled={!pagination.hasNext}
                                    className={`flex items-center space-x-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                                        pagination.hasNext
                                            ? 'bg-red-50 text-red-700 hover:scale-105 hover:bg-red-100'
                                            : 'cursor-not-allowed bg-gray-100 text-gray-400'
                                    }`}
                                >
                                    <span>Следующая</span>
                                    <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 5l7 7-7 7"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Модальное окно для изображения */}
                    {selectedImage && (
                        <div
                            className="bg-opacity-90 animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black"
                            onMouseEnter={handleModalMouseEnter}
                            onMouseLeave={handleModalMouseLeave}
                            onClick={closeImageModal}
                        >
                            <div className="relative max-h-screen max-w-screen p-8">
                                {/* Панель управления */}
                                <div className="controls-fade absolute top-8 right-8 z-10 flex gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            resetImagePosition()
                                        }}
                                        className="bg-opacity-90 hover:bg-opacity-100 rounded-lg bg-gray-800 p-2 text-gray-100 backdrop-blur-sm transition-all duration-200 hover:scale-110 shadow-lg"
                                        title="Сбросить (клавиша R)"
                                    >
                                        <svg
                                            className="h-5 w-5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            closeImageModal()
                                        }}
                                        className="bg-opacity-90 hover:bg-opacity-100 rounded-lg bg-gray-800 p-2 text-gray-100 backdrop-blur-sm transition-all duration-200 hover:scale-110 shadow-lg"
                                        title="Закрыть (Escape)"
                                    >
                                        <svg
                                            className="h-5 w-5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>
                                </div>

                                {/* Индикатор масштаба */}
                                <div className="bg-opacity-90 controls-fade absolute top-8 left-8 z-10 rounded-lg bg-gray-800 px-3 py-1 text-gray-100 backdrop-blur-sm shadow-lg">
                                    {Math.round(imageScale * 100)}%
                                </div>

                                {/* Изображение */}
                                <img
                                    ref={imageRef}
                                    src={selectedImage}
                                    alt="Увеличенное изображение пожара"
                                    className="draggable-cursor animate-scale-in max-w-none transition-transform duration-200 ease-out"
                                    style={{
                                        transform: `scale(${imageScale}) translate(${imagePosition.x}px, ${imagePosition.y}px)`,
                                        maxHeight: '90vh',
                                        maxWidth: '90vw',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={handleImageMouseDown}
                                    draggable={false}
                                />

                                {/* Подсказка */}
                                <div className="bg-opacity-90 controls-fade absolute bottom-8 left-1/2 -translate-x-1/2 transform rounded-lg bg-gray-800 px-4 py-2 text-center text-gray-100 backdrop-blur-sm shadow-lg">
                                    <p className="text-sm">
                                        Колесико мыши для масштаба
                                        {imageScale > 1 && (
                                            <span>
                                                , перетащите для перемещения
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs opacity-75">
                                        <kbd className="bg-opacity-30 rounded bg-gray-600 px-1 text-gray-100">
                                            R
                                        </kbd>{' '}
                                        - сброс,{' '}
                                        <kbd className="bg-opacity-30 rounded bg-gray-600 px-1 text-gray-100">
                                            Escape
                                        </kbd>{' '}
                                        - закрыть
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Модалка управления сессией */}
                    {showManageModal && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                            onClick={() => setShowManageModal(false)}
                        >
                            <div
                                className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                                    <div className="flex-1">
                                        {editingSessionName ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={editingSessionNameValue}
                                                    onChange={(e) => setEditingSessionNameValue(e.target.value)}
                                                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRenameSession()
                                                        if (e.key === 'Escape') {
                                                            setEditingSessionName(false)
                                                            const currentSession = sessions.find(s => s.id === activeSessionId)
                                                            if (currentSession) setEditingSessionNameValue(currentSession.name)
                                                        }
                                                    }}
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={handleRenameSession}
                                                    className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                                                >
                                                    Сохранить
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingSessionName(false)
                                                        const currentSession = sessions.find(s => s.id === activeSessionId)
                                                        if (currentSession) setEditingSessionNameValue(currentSession.name)
                                                    }}
                                                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                                >
                                                    Отмена
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-semibold text-gray-800">
                                                    {sessions.find(s => s.id === activeSessionId)?.name || 'Управление сессией'}
                                                </h3>
                                                <button
                                                    onClick={() => setEditingSessionName(true)}
                                                    className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                                    title="Переименовать сессию"
                                                >
                                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => { setShowManageModal(false); setRefreshedJoinCode(null); setCodeCopied(false) }}
                                        className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                    >
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="border-b border-gray-100">
                                    <div className="flex flex-wrap gap-1 px-4">
                                        {(['code', 'requests', 'blocked', 'members', 'logs'] as const).map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() => setManageTab(tab)}
                                                className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
                                                    manageTab === tab
                                                        ? 'border-b-2 border-red-600 text-red-600'
                                                        : 'text-gray-600 hover:text-gray-800'
                                                }`}
                                            >
                                                {tab === 'code' && 'Код'}
                                                {tab === 'requests' && 'Заявки'}
                                                {tab === 'blocked' && 'Заблокированные'}
                                                {tab === 'members' && 'Участники'}
                                                {tab === 'logs' && 'Лог'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto p-4">
                                    {manageTab === 'code' ? (
                                        <div className="space-y-3 py-2">
                                            <p className="text-sm text-gray-600">
                                                Код сессии — приватная информация. Не показывайте его на чужом экране.
                                            </p>
                                            {showSessionCodes && activeSessionId ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                                        <span className="font-mono text-lg font-semibold text-gray-800">
                                                            {refreshedJoinCode ?? sessions.find((s) => s.id === activeSessionId)?.join_code ?? '—'}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const code = refreshedJoinCode ?? sessions.find((s) => s.id === activeSessionId)?.join_code ?? ''
                                                                    if (code && navigator.clipboard?.writeText) {
                                                                        navigator.clipboard.writeText(code)
                                                                        setCodeCopied(true)
                                                                        setTimeout(() => setCodeCopied(false), 2000)
                                                                    }
                                                                }}
                                                                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-200"
                                                                title="Копировать код"
                                                            >
                                                                {codeCopied ? 'Скопировано' : 'Копировать'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={codeRefreshLoading}
                                                                onClick={async () => {
                                                                    if (!activeSessionId) return
                                                                    setCodeRefreshLoading(true)
                                                                    try {
                                                                        const updated = await refreshJoinCodeApi(activeSessionId)
                                                                        setRefreshedJoinCode(updated.join_code)
                                                                        setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
                                                                        setShowSessionCodes(true)
                                                                    } catch (e) {
                                                                        console.error('Ошибка обновления кода:', e)
                                                                    } finally {
                                                                        setCodeRefreshLoading(false)
                                                                    }
                                                                }}
                                                                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                                                                title="Обновить код (старый станет недействительным)"
                                                            >
                                                                {codeRefreshLoading ? '…' : 'Обновить'}
                                                            </button>
                                                            <button
                                                                onClick={() => setShowSessionCodes(false)}
                                                                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-200"
                                                            >
                                                                Скрыть
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-gray-500">
                                                        По нажатию «Обновить» предыдущий код перестаёт действовать, выдаётся новый.
                                                    </p>
                                                </div>
                                            ) : codeConfirmPending ? (
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <button
                                                        disabled={codeConfirmCountdown > 0}
                                                        onClick={() => {
                                                            setShowSessionCodes(true)
                                                            setCodeConfirmPending(false)
                                                            setCodeConfirmCountdown(0)
                                                        }}
                                                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                                                            codeConfirmCountdown > 0
                                                                ? 'cursor-not-allowed border border-gray-300 bg-gray-100 text-gray-500'
                                                                : 'border border-red-600 bg-red-600 text-white hover:bg-red-700'
                                                        }`}
                                                    >
                                                        Вы уверены?
                                                        {codeConfirmCountdown > 0 && ` (${codeConfirmCountdown} сек)`}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setCodeConfirmPending(false)
                                                            setCodeConfirmCountdown(0)
                                                        }}
                                                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                                                    >
                                                        Отмена
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setCodeConfirmPending(true)
                                                        setCodeConfirmCountdown(3)
                                                    }}
                                                    className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                                                >
                                                    Показать код
                                                </button>
                                            )}
                                        </div>
                                    ) : manageTab === 'requests' ? (
                                        <div className="space-y-2 py-2">
                                            <p className="mb-2 text-sm font-semibold text-gray-800">
                                                Ожидающие заявки
                                            </p>
                                            {pendingRequests.length === 0 ? (
                                                <p className="py-4 text-center text-gray-500">Нет заявок</p>
                                            ) : (
                                                pendingRequests.map((r) => (
                                                            <div
                                                                key={r.id}
                                                                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                                                            >
                                                                <div className="text-sm text-gray-800">
                                                                    <div className="font-medium">
                                                                        {[r.requester_first_name, r.requester_last_name].filter(Boolean).join(' ') || r.requester_username}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500">
                                                                        {r.requester_email || r.requester_username}
                                                                    </div>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => approveRequest(r.id)}
                                                                        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                                                                    >
                                                                        Принять
                                                                    </button>
                                                                    <button
                                                                        onClick={() => denyRequest(r.id)}
                                                                        className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700"
                                                                    >
                                                                        Отклонить
                                                                    </button>
                                                                    <button
                                                                        onClick={() => blockRequester(r.requester)}
                                                                        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                                                                    >
                                                                        Заблокировать
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                        </div>
                                    ) : manageLoading ? (
                                        <p className="py-8 text-center text-gray-500">Загрузка...</p>
                                    ) : manageError ? (
                                        <p className="py-8 text-center text-red-600">{manageError}</p>
                                    ) : manageTab === 'blocked' ? (
                                        <div className="space-y-2">
                                            {manageBlocked.length === 0 ? (
                                                <p className="py-4 text-center text-gray-500">Нет заблокированных пользователей</p>
                                            ) : (
                                                manageBlocked.map((b) => (
                                                    <div
                                                        key={b.id}
                                                        className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                                                    >
                                                        <div className="text-sm">
                                                            <span className="font-medium text-gray-800">
                                                                {[b.requester_first_name, b.requester_last_name].filter(Boolean).join(' ') || b.requester_username}
                                                            </span>
                                                            <span className="ml-2 text-gray-500">
                                                                {b.requester_email || b.requester_username}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => unblockUser(b.requester)}
                                                            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                                                        >
                                                            Разблокировать
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    ) : manageTab === 'members' ? (
                                        <div className="space-y-2">
                                            {manageMembers.length === 0 ? (
                                                <p className="py-4 text-center text-gray-500">Нет участников</p>
                                            ) : (
                                                manageMembers.map((m) => {
                                                    const currentSession = sessions.find((s) => s.id === activeSessionId)
                                                    const isOwner = currentSession && currentSession.owner === m.user
                                                    return (
                                                        <div
                                                            key={m.id}
                                                            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                                                        >
                                                            <span className="font-medium text-gray-800">
                                                                {m.username}
                                                                {isOwner && <span className="ml-2 text-xs text-gray-500">(владелец)</span>}
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <select
                                                                    value={m.role}
                                                                    onChange={(e) => handleChangeRole(m.user, e.target.value as 'admin' | 'moderator' | 'member')}
                                                                    className={`rounded px-2 py-0.5 text-xs border ${
                                                                        m.role === 'admin'
                                                                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                                                                            : m.role === 'moderator'
                                                                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                                                                            : 'bg-gray-100 text-gray-600 border-gray-300'
                                                                    }`}
                                                                >
                                                                    <option value="member">Участник</option>
                                                                    <option value="moderator">Модератор</option>
                                                                    <option value="admin">Админ</option>
                                                                </select>
                                                                {!isOwner && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveMember(m.user)}
                                                                        className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-200"
                                                                    >
                                                                        Исключить
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {manageLogs.length === 0 ? (
                                                <p className="py-4 text-center text-gray-500">Лог пуст</p>
                                            ) : (
                                                manageLogs.map((log) => (
                                                    <div
                                                        key={log.id}
                                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                                    >
                                                        <span className="font-medium text-gray-800">{log.actor_username || '—'}</span>
                                                        {' '}
                                                        <span className="text-gray-600">
                                                            {log.action === 'role_changed'
                                                                ? `выдал роль «${log.role_display ?? log.role_granted ?? '—'}»`
                                                                : {
                                                                      approved: 'принял',
                                                                      denied: 'отклонил',
                                                                      blocked: 'заблокировал',
                                                                      unblocked: 'разблокировал',
                                                                      removed: 'удалил',
                                                                  }[log.action] ?? log.action_display}
                                                        </span>
                                                        {' '}
                                                        <span className="font-medium text-gray-800">{log.target_username || '—'}</span>
                                                        <span className="ml-2 text-xs text-gray-400">
                                                            {new Date(log.created_at).toLocaleString('ru-RU')}
                                                        </span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="border-t border-gray-200 px-4 py-2">
                                    <button
                                        onClick={() => { setShowManageModal(false); setRefreshedJoinCode(null); setCodeCopied(false) }}
                                        className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                                    >
                                        Закрыть
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}

export default FireList
