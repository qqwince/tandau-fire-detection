import { useState, useCallback } from 'react'
import {
    hideFiresByAge,
    deleteFiresByAge,
    unhideFires,
    type CleanupUnit,
} from '../api/fireActions'

export function useCleanupFires(onRefresh: () => Promise<void>) {
    const [cleanupOlderThan, setCleanupOlderThan] = useState(7)
    const [cleanupUnit, setCleanupUnit] = useState<CleanupUnit>('days')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [cleanupLoading, setCleanupLoading] = useState(false)
    const [cleanupMessage, setCleanupMessage] = useState<string | null>(null)
    const [showHidden, setShowHidden] = useState(false)
    const [lastHiddenIds, setLastHiddenIds] = useState<number[]>([])

    const runHide = useCallback(async () => {
        setCleanupLoading(true)
        setCleanupMessage(null)
        try {
            const { hidden_count, hidden_ids } = await hideFiresByAge(
                cleanupOlderThan,
                cleanupUnit
            )
            setLastHiddenIds(hidden_ids ?? [])
            if (hidden_count > 0) await onRefresh()
            setCleanupMessage(
                hidden_count > 0
                    ? `Скрыто отчётов: ${hidden_count}`
                    : 'Нет отчётов старше указанного срока'
            )
            setTimeout(() => setCleanupMessage(null), 4000)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { error?: string } } }
            const msg =
                err?.response?.data?.error ??
                (e instanceof Error ? e.message : 'Ошибка')
            setCleanupMessage(`Ошибка: ${msg}`)
            setTimeout(() => setCleanupMessage(null), 5000)
            console.error(e)
        } finally {
            setCleanupLoading(false)
        }
    }, [cleanupOlderThan, cleanupUnit, onRefresh])

    const runDelete = useCallback(async () => {
        setCleanupLoading(true)
        setCleanupMessage(null)
        try {
            const { deleted_count } = await deleteFiresByAge(
                cleanupOlderThan,
                cleanupUnit
            )
            setShowDeleteConfirm(false)
            if (deleted_count > 0) await onRefresh()
            setCleanupMessage(
                deleted_count > 0
                    ? `Удалено отчётов: ${deleted_count}`
                    : 'Нет отчётов старше указанного срока'
            )
            setTimeout(() => setCleanupMessage(null), 4000)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { error?: string } } }
            const msg =
                err?.response?.data?.error ??
                (e instanceof Error ? e.message : 'Ошибка')
            setCleanupMessage(`Ошибка: ${msg}`)
            setTimeout(() => setCleanupMessage(null), 5000)
            console.error(e)
        } finally {
            setCleanupLoading(false)
        }
    }, [cleanupOlderThan, cleanupUnit, onRefresh])

    const runUnhideLast = useCallback(async () => {
        if (lastHiddenIds.length === 0) return
        setCleanupLoading(true)
        try {
            await unhideFires(lastHiddenIds)
            setLastHiddenIds([])
            await onRefresh()
        } catch (e) {
            console.error(e)
        } finally {
            setCleanupLoading(false)
        }
    }, [lastHiddenIds, onRefresh])

    return {
        cleanupOlderThan,
        setCleanupOlderThan,
        cleanupUnit,
        setCleanupUnit,
        showDeleteConfirm,
        setShowDeleteConfirm,
        cleanupLoading,
        cleanupMessage,
        showHidden,
        setShowHidden,
        lastHiddenIds,
        runHide,
        runDelete,
        runUnhideLast,
    }
}
