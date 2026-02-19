import type { CleanupUnit } from '@/features/fires'

const UNIT_LABELS: Record<CleanupUnit, string> = {
    minutes: 'минут',
    hours: 'часов',
    days: 'дней',
    weeks: 'недель',
    months: 'месяцев',
    years: 'лет',
}

interface CleanupPanelProps {
    olderThan: number
    onOlderThanChange: (v: number) => void
    unit: CleanupUnit
    onUnitChange: (u: CleanupUnit) => void
    onHide: () => void
    onDeleteClick: () => void
    loading: boolean
    showHidden: boolean
    onShowHiddenChange: (v: boolean) => void
    lastHiddenIds: number[]
    onUnhideLast: () => void
    message: string | null
}

export function CleanupPanel({
    olderThan,
    onOlderThanChange,
    unit,
    onUnitChange,
    onHide,
    onDeleteClick,
    loading,
    showHidden,
    onShowHiddenChange,
    lastHiddenIds,
    onUnhideLast,
    message,
}: CleanupPanelProps) {
    return (
        <div className="animate-scale-in mb-8 rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-lg">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
                🧹 Очистка отчётов по возрасту
            </h3>
            <p className="mb-4 text-sm text-gray-600">
                Скрыть или удалить отчёты старше указанного срока (только из
                ваших сессий).
            </p>
            <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-gray-500">
                        Старше
                    </span>
                    <input
                        type="number"
                        min={1}
                        value={olderThan}
                        onChange={(e) =>
                            onOlderThanChange(
                                Math.max(1, Number(e.target.value) || 1)
                            )
                        }
                        className="w-24 rounded-lg border border-gray-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-gray-500">
                        Единица
                    </span>
                    <select
                        value={unit}
                        onChange={(e) =>
                            onUnitChange(e.target.value as CleanupUnit)
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
                    >
                        {(Object.keys(UNIT_LABELS) as CleanupUnit[]).map(
                            (u) => (
                                <option key={u} value={u}>
                                    {UNIT_LABELS[u]}
                                </option>
                            )
                        )}
                    </select>
                </label>
                <button
                    type="button"
                    disabled={loading}
                    onClick={onHide}
                    className="rounded-lg border border-amber-400 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50"
                >
                    Скрыть
                </button>
                <button
                    type="button"
                    disabled={loading}
                    onClick={onDeleteClick}
                    className="rounded-lg border border-red-300 bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200 disabled:opacity-50"
                >
                    Удалить безвозвратно
                </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-amber-200 pt-4">
                <label className="flex cursor-pointer items-center gap-2">
                    <input
                        type="checkbox"
                        checked={showHidden}
                        onChange={(e) =>
                            onShowHiddenChange(e.target.checked)
                        }
                        className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                        Показать скрытые отчёты
                    </span>
                </label>
                {lastHiddenIds.length > 0 && (
                    <button
                        type="button"
                        disabled={loading}
                        onClick={onUnhideLast}
                        className="rounded-lg border border-green-300 bg-green-100 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-200 disabled:opacity-50"
                    >
                        Отменить скрытие ({lastHiddenIds.length})
                    </button>
                )}
                {message && (
                    <p
                        className={`text-sm ${
                            message.startsWith('Ошибка')
                                ? 'text-red-600'
                                : 'text-gray-700'
                        }`}
                    >
                        {message}
                    </p>
                )}
            </div>
        </div>
    )
}

interface DeleteConfirmModalProps {
    open: boolean
    onClose: () => void
    onConfirm: () => void
    olderThan: number
    unit: CleanupUnit
    loading: boolean
}

export function DeleteConfirmModal({
    open,
    onClose,
    onConfirm,
    olderThan,
    unit,
    loading,
}: DeleteConfirmModalProps) {
    if (!open) return null
    const unitLabel = UNIT_LABELS[unit]
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
                <h4 className="mb-2 text-lg font-semibold text-gray-900">
                    Вы уверены?
                </h4>
                <p className="mb-4 text-sm text-gray-600">
                    Все отчёты старше {olderThan} {unitLabel} будут удалены
                    безвозвратно. Это действие нельзя отменить.
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                        Отмена
                    </button>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={onConfirm}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                        Удалить
                    </button>
                </div>
            </div>
        </div>
    )
}
