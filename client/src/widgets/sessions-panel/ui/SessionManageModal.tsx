import type { Session, JoinRequest, SessionMember, AuditLogEntry } from '@/entities/session'
import type { ManageTab } from '@/features/sessions'

const ACTION_LABELS: Record<string, string> = {
    approved: 'принял',
    denied: 'отклонил',
    blocked: 'заблокировал',
    unblocked: 'разблокировал',
    removed: 'удалил',
}

interface SessionManageModalProps {
    open: boolean
    onClose: () => void
    activeSessionId: number | null
    tab: ManageTab
    onTabChange: (tab: ManageTab) => void
    sessionName: string
    editingName: boolean
    editingNameValue: string
    onEditingNameValueChange: (v: string) => void
    onStartEditName: () => void
    onCancelEditName: () => void
    onSaveName: () => void
    showSessionCodes: boolean
    codeConfirmPending: boolean
    codeConfirmCountdown: number
    onShowCodeClick: () => void
    onConfirmShowCode: () => void
    onCancelShowCode: () => void
    joinCodeDisplay: string
    codeCopied: boolean
    onCopyCode: () => void
    codeRefreshLoading: boolean
    onRefreshCode: () => void
    onHideCode: () => void
    pendingRequests: JoinRequest[]
    onApproveRequest: (id: number) => void
    onDenyRequest: (id: number) => void
    onBlockRequester: (userId: number) => void
    manageLoading: boolean
    manageError: string | null
    manageBlocked: JoinRequest[]
    onUnblockUser: (userId: number) => void
    manageMembers: SessionMember[]
    currentSession: Session | undefined
    onChangeRole: (userId: number, role: 'admin' | 'moderator' | 'member') => void
    onRemoveMember: (userId: number) => void
    manageLogs: AuditLogEntry[]
}

export function SessionManageModal({
    open,
    onClose,
    activeSessionId,
    tab,
    onTabChange,
    sessionName,
    editingName,
    editingNameValue,
    onEditingNameValueChange,
    onStartEditName,
    onCancelEditName,
    onSaveName,
    showSessionCodes,
    codeConfirmPending,
    codeConfirmCountdown,
    onShowCodeClick,
    onConfirmShowCode,
    onCancelShowCode,
    joinCodeDisplay,
    codeCopied,
    onCopyCode,
    codeRefreshLoading,
    onRefreshCode,
    onHideCode,
    pendingRequests,
    onApproveRequest,
    onDenyRequest,
    onBlockRequester,
    manageLoading,
    manageError,
    manageBlocked,
    onUnblockUser,
    manageMembers,
    currentSession,
    onChangeRole,
    onRemoveMember,
    manageLogs,
}: SessionManageModalProps) {
    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
        >
            <div
                className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <div className="flex-1">
                        {editingName ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={editingNameValue}
                                    onChange={(e) =>
                                        onEditingNameValueChange(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') onSaveName()
                                        if (e.key === 'Escape') onCancelEditName()
                                    }}
                                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={onSaveName}
                                    className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                                >
                                    Сохранить
                                </button>
                                <button
                                    type="button"
                                    onClick={onCancelEditName}
                                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                    Отмена
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-gray-800">
                                    {sessionName || 'Управление сессией'}
                                </h3>
                                <button
                                    type="button"
                                    onClick={onStartEditName}
                                    className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                    title="Переименовать сессию"
                                >
                                    <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                        <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
                <div className="border-b border-gray-100">
                    <div className="flex flex-wrap gap-1 px-4">
                        {(
                            [
                                'code',
                                'requests',
                                'blocked',
                                'members',
                                'logs',
                            ] as const
                        ).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => onTabChange(t)}
                                className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
                                    tab === t
                                        ? 'border-b-2 border-red-600 text-red-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                {t === 'code' && 'Код'}
                                {t === 'requests' && 'Заявки'}
                                {t === 'blocked' && 'Заблокированные'}
                                {t === 'members' && 'Участники'}
                                {t === 'logs' && 'Лог'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-4">
                    {tab === 'code' ? (
                        <div className="space-y-3 py-2">
                            <p className="text-sm text-gray-600">
                                Код сессии — приватная информация. Не показывайте
                                его на чужом экране.
                            </p>
                            {showSessionCodes && activeSessionId ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                                        <span className="font-mono text-lg font-semibold text-gray-800">
                                            {joinCodeDisplay}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={onCopyCode}
                                                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-200"
                                            >
                                                {codeCopied
                                                    ? 'Скопировано'
                                                    : 'Копировать'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={codeRefreshLoading}
                                                onClick={onRefreshCode}
                                                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                                            >
                                                {codeRefreshLoading
                                                    ? '…'
                                                    : 'Обновить'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={onHideCode}
                                                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-200"
                                            >
                                                Скрыть
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        По нажатию «Обновить» предыдущий код
                                        перестаёт действовать, выдаётся новый.
                                    </p>
                                </div>
                            ) : codeConfirmPending ? (
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        disabled={codeConfirmCountdown > 0}
                                        onClick={onConfirmShowCode}
                                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                                            codeConfirmCountdown > 0
                                                ? 'cursor-not-allowed border border-gray-300 bg-gray-100 text-gray-500'
                                                : 'border border-red-600 bg-red-600 text-white hover:bg-red-700'
                                        }`}
                                    >
                                        Вы уверены?
                                        {codeConfirmCountdown > 0 &&
                                            ` (${codeConfirmCountdown} сек)`}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onCancelShowCode}
                                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                                    >
                                        Отмена
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onShowCodeClick}
                                    className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                                >
                                    Показать код
                                </button>
                            )}
                        </div>
                    ) : tab === 'requests' ? (
                        <div className="space-y-2 py-2">
                            <p className="mb-2 text-sm font-semibold text-gray-800">
                                Ожидающие заявки
                            </p>
                            {pendingRequests.length === 0 ? (
                                <p className="py-4 text-center text-gray-500">
                                    Нет заявок
                                </p>
                            ) : (
                                pendingRequests.map((r) => (
                                    <div
                                        key={r.id}
                                        className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                                    >
                                        <div className="text-sm text-gray-800">
                                            <div className="font-medium">
                                                {[r.requester_first_name, r.requester_last_name]
                                                    .filter(Boolean)
                                                    .join(' ') || r.requester_username}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {r.requester_email ||
                                                    r.requester_username}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onApproveRequest(r.id)
                                                }
                                                className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                                            >
                                                Принять
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDenyRequest(r.id)}
                                                className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700"
                                            >
                                                Отклонить
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onBlockRequester(r.requester)
                                                }
                                                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                                            >
                                                Заблокировать
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : manageLoading ? (
                        <p className="py-8 text-center text-gray-500">
                            Загрузка...
                        </p>
                    ) : manageError ? (
                        <p className="py-8 text-center text-red-600">
                            {manageError}
                        </p>
                    ) : tab === 'blocked' ? (
                        <div className="space-y-2">
                            {manageBlocked.length === 0 ? (
                                <p className="py-4 text-center text-gray-500">
                                    Нет заблокированных пользователей
                                </p>
                            ) : (
                                manageBlocked.map((b) => (
                                    <div
                                        key={b.id}
                                        className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                                    >
                                        <div className="text-sm">
                                            <span className="font-medium text-gray-800">
                                                {[b.requester_first_name, b.requester_last_name]
                                                    .filter(Boolean)
                                                    .join(' ') || b.requester_username}
                                            </span>
                                            <span className="ml-2 text-gray-500">
                                                {b.requester_email ||
                                                    b.requester_username}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onUnblockUser(b.requester)
                                            }
                                            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                                        >
                                            Разблокировать
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : tab === 'members' ? (
                        <div className="space-y-2">
                            {manageMembers.length === 0 ? (
                                <p className="py-4 text-center text-gray-500">
                                    Нет участников
                                </p>
                            ) : (
                                manageMembers.map((m) => {
                                    const isOwner =
                                        currentSession &&
                                        currentSession.owner === m.user
                                    return (
                                        <div
                                            key={m.id}
                                            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                                        >
                                            <span className="font-medium text-gray-800">
                                                {m.username}
                                                {isOwner && (
                                                    <span className="ml-2 text-xs text-gray-500">
                                                        (владелец)
                                                    </span>
                                                )}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={m.role}
                                                    onChange={(e) =>
                                                        onChangeRole(
                                                            m.user,
                                                            e.target
                                                                .value as
                                                                | 'admin'
                                                                | 'moderator'
                                                                | 'member'
                                                        )
                                                    }
                                                    className={`rounded border px-2 py-0.5 text-xs ${
                                                        m.role === 'admin'
                                                            ? 'border-amber-300 bg-amber-100 text-amber-800'
                                                            : m.role === 'moderator'
                                                              ? 'border-blue-300 bg-blue-100 text-blue-800'
                                                              : 'border-gray-300 bg-gray-100 text-gray-600'
                                                    }`}
                                                >
                                                    <option value="member">
                                                        Участник
                                                    </option>
                                                    <option value="moderator">
                                                        Модератор
                                                    </option>
                                                    <option value="admin">
                                                        Админ
                                                    </option>
                                                </select>
                                                {!isOwner && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onRemoveMember(m.user)
                                                        }
                                                        className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-200"
                                                    >
                                                        Исключить
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {manageLogs.length === 0 ? (
                                <p className="py-4 text-center text-gray-500">
                                    Лог пуст
                                </p>
                            ) : (
                                manageLogs.map((log) => (
                                    <div
                                        key={log.id}
                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    >
                                        <span className="font-medium text-gray-800">
                                            {log.actor_username || '—'}
                                        </span>{' '}
                                        <span className="text-gray-600">
                                            {log.action === 'role_changed'
                                                ? `выдал роль «${log.role_display ?? log.role_granted ?? '—'}»`
                                                : ACTION_LABELS[log.action] ??
                                                  log.action_display}
                                        </span>{' '}
                                        <span className="font-medium text-gray-800">
                                            {log.target_username || '—'}
                                        </span>
                                        <span className="ml-2 text-xs text-gray-400">
                                            {new Date(
                                                log.created_at
                                            ).toLocaleString('ru-RU')}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="border-t border-gray-200 px-4 py-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    )
}
