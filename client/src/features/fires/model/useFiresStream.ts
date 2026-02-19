import { useEffect } from 'react'
import type { FireSite, Filters } from '@/entities/fire'

declare global {
    interface Window {
        __fires_sse_active?: boolean
    }
}

export function useFiresStream(
    filters: Filters,
    activeSessionId: number | null,
    pageSize: number,
    setSites: React.Dispatch<React.SetStateAction<FireSite[]>>,
    setPagination: React.Dispatch<
        React.SetStateAction<{
            currentPage: number
            totalPages: number
            totalCount: number
            pageSize: number
            hasNext: boolean
            hasPrevious: boolean
        }>
    >,
    loadSites: () => Promise<void>
) {
    useEffect(() => {
        const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
        if (!base) return

        let es: EventSource | null = null
        window.__fires_sse_active = false

        const connectSSE = () => {
            try {
                const streamUrl = `${base.replace(/\/+$/, '')}/api/fires/stream/`
                es = new EventSource(streamUrl)
                es.onopen = () => {
                    window.__fires_sse_active = true
                }
                es.onmessage = (ev) => {
                    try {
                        const msg = JSON.parse(ev.data) as {
                            type?: string
                            id?: number
                            location?: string
                            time?: string
                            latitude?: number
                            longitude?: number
                            image?: string
                            conf?: number
                            session?: number
                        }
                        if (msg?.type === 'fire_created') {
                            const newItem: FireSite = {
                                id: String(msg.id),
                                location: msg.location ?? '',
                                time: msg.time ?? '',
                                description: `Автоматическое обнаружение на ${msg.location ?? ''}`,
                                latitude: Number(msg.latitude ?? 0),
                                longitude: Number(msg.longitude ?? 0),
                                image: msg.image ?? '',
                                conf: Number(msg.conf ?? 0),
                            }

                            const locationOk =
                                filters.selectedLocations.length === 0 ||
                                filters.selectedLocations.includes(newItem.location)
                            const confOk =
                                Math.round(newItem.conf) >= filters.confMin &&
                                Math.round(newItem.conf) <= filters.confMax
                            const sessionOk =
                                !activeSessionId ||
                                Number(msg.session) === activeSessionId

                            if (locationOk && confOk && sessionOk) {
                                setSites((prev) => {
                                    const exists = prev.some((s) => s.id === newItem.id)
                                    if (exists) return prev
                                    return [newItem, ...prev].slice(0, pageSize)
                                })
                                setPagination((prev) => ({
                                    ...prev,
                                    totalCount: prev.totalCount + 1,
                                }))
                            }
                        }
                    } catch {
                        // ignore parse errors
                    }
                }
                es.onerror = () => {
                    window.__fires_sse_active = false
                }
            } catch {
                // noop, rely on polling
            }
        }

        connectSSE()
        return () => {
            try {
                es?.close()
            } catch {
                // noop
            }
        }
    }, [
        filters.selectedLocations,
        filters.confMin,
        filters.confMax,
        activeSessionId,
        pageSize,
    ])

    useEffect(() => {
        const interval = setInterval(() => {
            if (!window.__fires_sse_active) {
                loadSites()
            }
        }, 15000)
        return () => clearInterval(interval)
    }, [loadSites])
}
