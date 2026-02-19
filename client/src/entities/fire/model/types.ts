export interface FireSite {
    id: string
    location: string
    time: string
    description?: string
    latitude: number | null
    longitude: number | null
    image?: string
    conf: number
    session_name?: string
    approved?: boolean
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
    searchQuery: string
}

export interface ImagePosition {
    x: number
    y: number
}
