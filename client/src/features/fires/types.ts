export interface FireSite {
    id: string
    location: string
    time: string
    description?: string
    latitude: number
    longitude: number
    image?: string
    conf: number
}

export type SortField = 'time' | 'conf'
export type SortOrder = 'asc' | 'desc'

export interface Filters {
    selectedLocations: string[]
    sortField: SortField
    sortOrder: SortOrder
    confMin: number
    confMax: number
}

export interface ImagePosition {
    x: number
    y: number
}


