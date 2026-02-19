import type { Session } from '@/entities/session'

interface SessionsPanelProps {
    sessions: Session[]
    activeSessionId: number | null
    onActiveSessionChange: (id: number | null) => void
    onOpenManage: () => void
    newSessionName: string
    onNewSessionNameChange: (value: string) => void
    onCreateSession: () => void
    joinCode: string
    onJoinCodeChange: (value: string) => void
    onJoinByCode: () => void
    joinMessage: string | null
}

export function SessionsPanel({
    sessions,
    activeSessionId,
    onActiveSessionChange,
    onOpenManage,
    newSessionName,
    onNewSessionNameChange,
    onCreateSession,
    joinCode,
    onJoinCodeChange,
    onJoinByCode,
    joinMessage,
}: SessionsPanelProps) {
    return (
        <div className="animate-scale-in mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Текущая сессия
                    </label>
                    <div className="flex items-center gap-3">
                        <select
                            value={activeSessionId ?? ''}
                            onChange={(e) =>
                                onActiveSessionChange(
                                    e.target.value
                                        ? Number(e.target.value)
                                        : null
                                )
                            }
                            className="w-72 rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                        >
                            <option value="">Все сессии</option>
                            {sessions.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                        {activeSessionId && (
                            <button
                                type="button"
                                onClick={onOpenManage}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                Управление
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Создать сессию
                    </label>
                    <div className="flex gap-2">
                        <input
                            value={newSessionName}
                            onChange={(e) =>
                                onNewSessionNameChange(e.target.value)
                            }
                            placeholder="Название"
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={onCreateSession}
                            className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
                        >
                            Создать
                        </button>
                    </div>
                </div>
                <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Присоединиться по коду
                    </label>
                    <div className="flex gap-2">
                        <input
                            value={joinCode}
                            onChange={(e) => onJoinCodeChange(e.target.value)}
                            placeholder="Код приглашения"
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={onJoinByCode}
                            className="rounded-lg bg-gray-800 px-4 py-2 font-medium text-white hover:bg-gray-900"
                        >
                            Отправить
                        </button>
                    </div>
                    {joinMessage && (
                        <p className="mt-2 text-sm text-gray-600">
                            {joinMessage}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
