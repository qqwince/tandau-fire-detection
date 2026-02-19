import { useState, useCallback } from 'react'
import { useAuth } from '@/features/auth'
import {
    useFireList,
    useFiresStream,
    useApproveFire,
    useCleanupFires,
    downloadFiresZip,
} from '@/features/fires'
import { useSessions, useSessionManage } from '@/features/sessions'
import { FireFiltersPanel } from '@/widgets/fire-filters'
import {
    FireListPanel,
    FireListHeader,
} from '@/widgets/fire-list'
import { SessionsPanel, SessionManageModal } from '@/widgets/sessions-panel'
import { CleanupPanel, DeleteConfirmModal } from '@/widgets/cleanup-panel'
import { ImageModal } from '@/widgets/image-modal'

export function FireListPage() {
    const { isAuthenticated } = useAuth()
    const [showManageModal, setShowManageModal] = useState(false)
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const [showHidden, setShowHidden] = useState(false)

    const sessions = useSessions(isAuthenticated)
    const sessionIdsKey = sessions.sessions
        .map((s) => s.id)
        .sort()
        .join(',')

    const fireList = useFireList(
        sessions.activeSessionId,
        showHidden,
        sessionIdsKey
    )

    const refreshSites = useCallback(async () => {
        await fireList.loadSites()
    }, [fireList.loadSites])

    const cleanup = useCleanupFires(refreshSites)

    useFiresStream(
        fireList.filters,
        sessions.activeSessionId,
        fireList.pagination.pageSize,
        fireList.setSites,
        fireList.setPagination,
        fireList.loadSites
    )

    const { animatingApprovals, handleApproval } = useApproveFire(
        fireList.approvedSites,
        fireList.setApprovedSites
    )

    const manage = useSessionManage(
        sessions.activeSessionId,
        sessions.sessions,
        showManageModal,
        sessions.loadSessions
    )

    const handleOpenManage = useCallback(() => {
        setShowManageModal(true)
        manage.openManageModal()
    }, [manage.openManageModal])

    const handleCloseManage = useCallback(() => {
        setShowManageModal(false)
        manage.setRefreshedJoinCode(null)
        manage.setCodeCopied(false)
    }, [manage.setRefreshedJoinCode, manage.setCodeCopied])

    const handleRefreshCode = useCallback(async () => {
        const updated = await manage.handleRefreshJoinCode()
        if (updated) {
            sessions.setSessions((prev) =>
                prev.map((s) => (s.id === updated.id ? updated : s))
            )
        }
    }, [manage.handleRefreshJoinCode, sessions.setSessions])

    if (!fireList.hasLoaded && fireList.loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center animate-fade-in">
                    <div className="mb-4 text-6xl animate-bounce">🔥</div>
                    <p className="text-2xl font-bold text-gray-700 animate-pulse">
                        Загрузка данных...
                    </p>
                    <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-red-500 to-orange-500 animate-pulse" />
                </div>
            </div>
        )
    }

    const locations = Array.from(
        new Set(fireList.sites.map((s) => s.location))
    )

    return (
        <div className="min-h-screen">
            <div className="mt-[60px] flex justify-center px-4 animate-fade-in">
                <section className="w-full max-w-7xl">
                    <FireListHeader
                        sitesCount={fireList.sites.length}
                        totalCount={fireList.pagination.totalCount}
                        approvedCount={fireList.approvedSites.size}
                        approvedIds={Array.from(fireList.approvedSites)}
                        onDownloadZip={downloadFiresZip}
                    />

                    {isAuthenticated && (
                        <SessionsPanel
                            sessions={sessions.sessions}
                            activeSessionId={sessions.activeSessionId}
                            onActiveSessionChange={sessions.setActiveSessionId}
                            onOpenManage={handleOpenManage}
                            newSessionName={sessions.newSessionName}
                            onNewSessionNameChange={sessions.setNewSessionName}
                            onCreateSession={sessions.handleCreateSession}
                            joinCode={sessions.joinCode}
                            onJoinCodeChange={sessions.setJoinCode}
                            onJoinByCode={sessions.handleJoinByCode}
                            joinMessage={sessions.joinMessage}
                        />
                    )}

                    <FireFiltersPanel
                        filters={fireList.filters}
                        pageSize={fireList.pagination.pageSize}
                        locations={locations}
                        onFiltersChange={fireList.updateFilters}
                        onToggleLocation={fireList.toggleLocation}
                        onPageSizeChange={fireList.changePageSize}
                    />

                    {isAuthenticated && (
                        <>
                            <CleanupPanel
                                olderThan={cleanup.cleanupOlderThan}
                                onOlderThanChange={cleanup.setCleanupOlderThan}
                                unit={cleanup.cleanupUnit}
                                onUnitChange={cleanup.setCleanupUnit}
                                onHide={cleanup.runHide}
                                onDeleteClick={() =>
                                    cleanup.setShowDeleteConfirm(true)
                                }
                                loading={cleanup.cleanupLoading}
                                showHidden={showHidden}
                                onShowHiddenChange={setShowHidden}
                                lastHiddenIds={cleanup.lastHiddenIds}
                                onUnhideLast={cleanup.runUnhideLast}
                                message={cleanup.cleanupMessage}
                            />
                            <DeleteConfirmModal
                                open={cleanup.showDeleteConfirm}
                                onClose={() =>
                                    cleanup.setShowDeleteConfirm(false)
                                }
                                onConfirm={cleanup.runDelete}
                                olderThan={cleanup.cleanupOlderThan}
                                unit={cleanup.cleanupUnit}
                                loading={cleanup.cleanupLoading}
                            />
                        </>
                    )}

                    <FireListPanel
                        sites={fireList.sites}
                        pagination={fireList.pagination}
                        approvedSites={fireList.approvedSites}
                        animatingApprovals={animatingApprovals}
                        onApprove={handleApproval}
                        onOpenImage={setSelectedImage}
                        onRefresh={refreshSites}
                        goToPage={fireList.goToPage}
                        goToNextPage={fireList.goToNextPage}
                        goToPreviousPage={fireList.goToPreviousPage}
                    />
                </section>
            </div>

            <ImageModal
                imageUrl={selectedImage}
                onClose={() => setSelectedImage(null)}
            />

            <SessionManageModal
                open={showManageModal}
                onClose={handleCloseManage}
                activeSessionId={sessions.activeSessionId}
                tab={manage.manageTab}
                onTabChange={manage.setManageTab}
                sessionName={
                    sessions.sessions.find(
                        (s) => s.id === sessions.activeSessionId
                    )?.name ?? ''
                }
                editingName={manage.editingSessionName}
                editingNameValue={manage.editingSessionNameValue}
                onEditingNameValueChange={manage.setEditingSessionNameValue}
                onStartEditName={() => manage.setEditingSessionName(true)}
                onCancelEditName={() => {
                    manage.setEditingSessionName(false)
                    const cur = sessions.sessions.find(
                        (s) => s.id === sessions.activeSessionId
                    )
                    if (cur) manage.setEditingSessionNameValue(cur.name)
                }}
                onSaveName={manage.handleRenameSession}
                showSessionCodes={manage.showSessionCodes}
                codeConfirmPending={manage.codeConfirmPending}
                codeConfirmCountdown={manage.codeConfirmCountdown}
                onShowCodeClick={() => {
                    manage.setCodeConfirmPending(true)
                    manage.setCodeConfirmCountdown(3)
                }}
                onConfirmShowCode={() => {
                    manage.setShowSessionCodes(true)
                    manage.setCodeConfirmPending(false)
                    manage.setCodeConfirmCountdown(0)
                }}
                onCancelShowCode={() => {
                    manage.setCodeConfirmPending(false)
                    manage.setCodeConfirmCountdown(0)
                }}
                joinCodeDisplay={
                    manage.refreshedJoinCode ??
                    sessions.sessions.find(
                        (s) => s.id === sessions.activeSessionId
                    )?.join_code ??
                    '—'
                }
                codeCopied={manage.codeCopied}
                onCopyCode={() => {
                    const code =
                        manage.refreshedJoinCode ??
                        sessions.sessions.find(
                            (s) => s.id === sessions.activeSessionId
                        )?.join_code ??
                        ''
                    if (code && navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(code)
                        manage.setCodeCopied(true)
                        setTimeout(() => manage.setCodeCopied(false), 2000)
                    }
                }}
                codeRefreshLoading={manage.codeRefreshLoading}
                onRefreshCode={handleRefreshCode}
                onHideCode={() => manage.setShowSessionCodes(false)}
                pendingRequests={manage.pendingRequests}
                onApproveRequest={manage.approveRequest}
                onDenyRequest={manage.denyRequest}
                onBlockRequester={manage.blockRequester}
                manageLoading={manage.manageLoading}
                manageError={manage.manageError}
                manageBlocked={manage.manageBlocked}
                onUnblockUser={manage.unblockUser}
                manageMembers={manage.manageMembers}
                currentSession={sessions.sessions.find(
                    (s) => s.id === sessions.activeSessionId
                )}
                onChangeRole={manage.handleChangeRole}
                onRemoveMember={manage.handleRemoveMember}
                manageLogs={manage.manageLogs}
            />
        </div>
    )
}
