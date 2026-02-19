import { $host } from '@/shared/api'
import type { FireSite } from '@/entities/fire'

export async function setFireApproved(
    fireId: string | number,
    approved: boolean
): Promise<FireSite> {
    const { data } = await $host.patch<FireSite>(`/api/fires/${fireId}/approve/`, { approved })
    return data
}

export type CleanupUnit =
    | 'minutes'
    | 'hours'
    | 'days'
    | 'weeks'
    | 'months'
    | 'years'

export async function hideFiresByAge(
    olderThan: number,
    unit: CleanupUnit
): Promise<{ hidden_count: number; hidden_ids: number[] }> {
    const { data } = await $host.post(
        `/api/fires/hide-by-age/?older_than=${olderThan}&unit=${unit}`,
        { older_than: olderThan, unit }
    )
    return data
}

export async function unhideFire(fireId: string | number): Promise<FireSite> {
    const { data } = await $host.patch<FireSite>(`/api/fires/${fireId}/unhide/`)
    return data
}

export async function unhideFires(
    fireIds: number[]
): Promise<{ unhidden_count: number }> {
    if (fireIds.length === 0) return { unhidden_count: 0 }
    const { data } = await $host.post<{ unhidden_count: number }>(
        '/api/fires/unhide/',
        { fire_ids: fireIds }
    )
    return data
}

export async function deleteFiresByAge(
    olderThan: number,
    unit: CleanupUnit
): Promise<{ deleted_count: number }> {
    const { data } = await $host.post(
        `/api/fires/delete-by-age/?older_than=${olderThan}&unit=${unit}`,
        { older_than: olderThan, unit }
    )
    return data
}

export async function downloadFiresZip(
    ids: (string | number)[]
): Promise<void> {
    if (ids.length === 0) return
    const idList = ids.map(String).join(',')
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
