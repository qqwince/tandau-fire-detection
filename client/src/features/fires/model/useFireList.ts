import { useEffect, useState, useCallback } from 'react'
import {
    fetchFireSites,
    type PaginationParams,
    type PaginatedResponse,
} from '@/entities/fire'
import type { FireSite, Filters } from '@/entities/fire'

export interface PaginationState {
    currentPage: number
    totalPages: number
    totalCount: number
    pageSize: number
    hasNext: boolean
    hasPrevious: boolean
}

const defaultFilters: Filters = {
    selectedLocations: [],
    sortField: 'time',
    sortOrder: 'desc',
    confMin: 30,
    confMax: 100,
    searchQuery: '',
}

export function useFireList(
    activeSessionId: number | null,
    showHidden: boolean,
    sessionIdsKey?: string
) {
    const [sites, setSites] = useState<FireSite[]>([])
    const [loading, setLoading] = useState(true)
    const [hasLoaded, setHasLoaded] = useState(false)
    const [filters, setFilters] = useState<Filters>(defaultFilters)
    const [pagination, setPagination] = useState<PaginationState>({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        pageSize: 10,
        hasNext: false,
        hasPrevious: false,
    })
    const [approvedSites, setApprovedSites] = useState<Set<string>>(new Set())

    const loadSites = useCallback(
        async (showInitialSpinner = false) => {
            try {
                if (showInitialSpinner && !hasLoaded) setLoading(true)

                const params: PaginationParams = {
                    page: pagination.currentPage,
                    page_size: pagination.pageSize,
                    sort_field: filters.sortField,
                    sort_order: filters.sortOrder,
                    conf_min: filters.confMin,
                    conf_max: filters.confMax,
                }
                if (activeSessionId) params.session_id = activeSessionId
                if (filters.selectedLocations.length > 0)
                    params.location = filters.selectedLocations[0]
                if (filters.searchQuery.trim()) params.search = filters.searchQuery.trim()
                if (showHidden) params.include_hidden = true

                const data: PaginatedResponse<FireSite> = await fetchFireSites(params)
                const newList = data.results ?? []

                setSites((prev) => {
                    if (!prev.length) return newList
                    const byId = new Map(prev.map((s) => [s.id, s]))
                    const merged: FireSite[] = []
                    for (const item of newList) {
                        merged.push(byId.get(item.id) ?? item)
                    }
                    return merged
                })
                setApprovedSites(
                    new Set(newList.filter((s) => s.approved).map((s) => String(s.id)))
                )
                setPagination((prev) => ({
                    ...prev,
                    totalPages: data.total_pages,
                    totalCount: data.count,
                    hasNext: data.has_next,
                    hasPrevious: data.has_previous,
                }))
            } catch (err) {
                console.error('Ошибка при загрузке:', err)
            } finally {
                setLoading(false)
                setHasLoaded(true)
            }
        },
        [
            filters,
            pagination.currentPage,
            pagination.pageSize,
            activeSessionId,
            showHidden,
            hasLoaded,
        ]
    )

    useEffect(() => {
        loadSites(true)
    }, [
        filters,
        pagination.currentPage,
        pagination.pageSize,
        activeSessionId,
        showHidden,
        sessionIdsKey ?? '',
    ])

    const updateFilters = useCallback((updates: Partial<Filters>) => {
        setFilters((prev) => ({ ...prev, ...updates }))
        setPagination((prev) => ({ ...prev, currentPage: 1 }))
    }, [])

    const toggleLocation = useCallback((location: string) => {
        setFilters((prev) => {
            const includes = prev.selectedLocations.includes(location)
            const newLocations = includes
                ? prev.selectedLocations.filter((loc) => loc !== location)
                : [...prev.selectedLocations, location]
            return { ...prev, selectedLocations: newLocations }
        })
        setPagination((prev) => ({ ...prev, currentPage: 1 }))
    }, [])

    const goToPage = useCallback((page: number) => {
        setPagination((prev) => {
            if (page < 1 || page > prev.totalPages) return prev
            return { ...prev, currentPage: page }
        })
    }, [])

    const goToNextPage = useCallback(() => {
        setPagination((prev) =>
            prev.hasNext ? { ...prev, currentPage: prev.currentPage + 1 } : prev
        )
    }, [])

    const goToPreviousPage = useCallback(() => {
        setPagination((prev) =>
            prev.hasPrevious ? { ...prev, currentPage: prev.currentPage - 1 } : prev
        )
    }, [])

    const changePageSize = useCallback((newPageSize: number) => {
        setPagination((prev) => ({
            ...prev,
            pageSize: newPageSize,
            currentPage: 1,
        }))
    }, [])

    return {
        sites,
        setSites,
        pagination,
        setPagination,
        loading,
        hasLoaded,
        loadSites,
        filters,
        updateFilters,
        toggleLocation,
        goToPage,
        goToNextPage,
        goToPreviousPage,
        changePageSize,
        approvedSites,
        setApprovedSites,
    }
}
