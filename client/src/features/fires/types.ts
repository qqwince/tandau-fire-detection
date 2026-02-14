export interface FireSite {
    id: string
    location: string
    time: string
    description?: string
    latitude: number
    longitude: number
    image?: string
    conf: number
    session_name?: string
    /** Подтверждён как реальный пожар (хранится на бэкенде) */
    approved?: boolean
    /** Скрыт из списка (по возрасту) */
    hidden?: boolean
}

export type SortField = 'time' | 'conf'
export type SortOrder = 'asc' | 'desc'

export interface Filters {
    selectedLocations: string[]
    sortField: SortField
    sortOrder: SortOrder
    confMin: number
    confMax: number
    /** Поиск по отчётам (ID, локация, описание) */
    searchQuery: string
}

export interface ImagePosition {
    x: number
    y: number
}


