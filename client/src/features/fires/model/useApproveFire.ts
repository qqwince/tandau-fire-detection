import { useState, useCallback } from 'react'
import { setFireApproved } from '../api/fireActions'

export function useApproveFire(
    approvedSites: Set<string>,
    setApprovedSites: React.Dispatch<React.SetStateAction<Set<string>>>
) {
    const [animatingApprovals, setAnimatingApprovals] = useState<Set<string>>(
        new Set()
    )

    const handleApproval = useCallback(
        async (siteId: string, event: React.MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            const nextApproved = !approvedSites.has(siteId)
            setAnimatingApprovals((prev) => new Set([...prev, siteId]))
            setApprovedSites((prev) => {
                const next = new Set(prev)
                if (nextApproved) next.add(siteId)
                else next.delete(siteId)
                return next
            })
            try {
                await setFireApproved(siteId, nextApproved)
            } catch (e) {
                console.error('Ошибка сохранения подтверждения:', e)
                setApprovedSites((prev) => {
                    const rollback = new Set(prev)
                    if (nextApproved) rollback.delete(siteId)
                    else rollback.add(siteId)
                    return rollback
                })
            } finally {
                setTimeout(() => {
                    setAnimatingApprovals((prev) => {
                        const next = new Set(prev)
                        next.delete(siteId)
                        return next
                    })
                }, 300)
            }
        },
        [approvedSites, setApprovedSites]
    )

    return { animatingApprovals, handleApproval }
}
