import { $host } from '@/shared/api'
import type { FireSite } from '../model/types'

export interface PaginationParams {
    page?: number
    page_size?: number
    location?: string
    conf_min?: number
    conf_max?: number
    sort_field?: 'time' | 'conf'
    sort_order?: 'asc' | 'desc'
    session_id?: number
    search?: string
    include_hidden?: boolean
}

export interface PaginatedResponse<T> {
    results: T[]
    count: number
    total_pages: number
    current_page: number
    has_next: boolean
    has_previous: boolean
    next_page: number | null
    previous_page: number | null
}

export const fetchFireSites = async (
    params: PaginationParams = {}
): Promise<PaginatedResponse<FireSite>> => {
    const queryParams = new URLSearchParams()
    if (params.page) queryParams.append('page', params.page.toString())
    if (params.page_size) queryParams.append('page_size', params.page_size.toString())
    if (params.location) queryParams.append('location', params.location)
    if (params.conf_min !== undefined) queryParams.append('conf_min', params.conf_min.toString())
    if (params.conf_max !== undefined) queryParams.append('conf_max', params.conf_max.toString())
    if (params.sort_field) queryParams.append('sort_field', params.sort_field)
    if (params.sort_order) queryParams.append('sort_order', params.sort_order)
    if (params.session_id !== undefined) queryParams.append('session_id', params.session_id.toString())
    if (params.search) queryParams.append('search', params.search.trim())
    if (params.include_hidden) queryParams.append('include_hidden', '1')

    const url = `/api/fires/${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const { data } = await $host.get(url)
    return data as PaginatedResponse<FireSite>
}
