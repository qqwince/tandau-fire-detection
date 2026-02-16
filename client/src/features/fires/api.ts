import { $host } from '@/http'
import type { FireSite } from './types'

export interface PaginationParams {
    page?: number
    page_size?: number
    location?: string
    conf_min?: number
    conf_max?: number
    sort_field?: 'time' | 'conf'
    sort_order?: 'asc' | 'desc'
    session_id?: number
    /** Поиск по отчётам (ID, локация, описание) */
    search?: string
    /** Включить в список скрытые отчёты */
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

export const fetchFireSites = async (params: PaginationParams = {}) => {
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
    return data as PaginatedResponse<any>
}

/** Установить статус «подтверждён» у отчёта (сохраняется на бэкенде). */
export async function setFireApproved(fireId: string | number, approved: boolean): Promise<FireSite> {
    const { data } = await $host.patch(`/api/fires/${fireId}/approve/`, { approved })
    return data
}

/** Единицы возраста для очистки */
export type CleanupUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'

/** Скрыть отчёты старше N единиц (из своих сессий). Возвращает hidden_ids для отмены. */
export async function hideFiresByAge(olderThan: number, unit: CleanupUnit): Promise<{ hidden_count: number; hidden_ids: number[] }> {
    const { data } = await $host.post(
        `/api/fires/hide-by-age/?older_than=${olderThan}&unit=${unit}`,
        { older_than: olderThan, unit }
    )
    return data
}

/** Вернуть один отчёт из скрытых (точечно). */
export async function unhideFire(fireId: string | number): Promise<FireSite> {
    const { data } = await $host.patch(`/api/fires/${fireId}/unhide/`)
    return data
}

/** Вернуть из скрытых отчёты по списку id (отмена последнего скрытия). */
export async function unhideFires(fireIds: number[]): Promise<{ unhidden_count: number }> {
    if (fireIds.length === 0) return { unhidden_count: 0 }
    const { data } = await $host.post('/api/fires/unhide/', { fire_ids: fireIds })
    return data
}

/** Безвозвратно удалить отчёты старше N единиц (из своих сессий). */
export async function deleteFiresByAge(olderThan: number, unit: CleanupUnit): Promise<{ deleted_count: number }> {
    const { data } = await $host.post(
        `/api/fires/delete-by-age/?older_than=${olderThan}&unit=${unit}`,
        { older_than: olderThan, unit }
    )
    return data
}

/** Скачать выбранные отчёты в ZIP (по id). Список id — числовой или строковый. */
export async function downloadFiresZip(ids: (string | number)[]): Promise<void> {
    if (ids.length === 0) return
    const idList = ids.map((id) => String(id)).join(',')
    const { data } = await $host.get(`/api/fires/export/?ids=${encodeURIComponent(idList)}`, {
        responseType: 'blob',
    })
    const url = URL.createObjectURL(data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fire_reports.zip'
    a.click()
    URL.revokeObjectURL(url)
}


