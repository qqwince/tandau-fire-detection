import type { FireSite } from '@/entities/fire'
import { unhideFire } from '@/features/fires'
import type { PaginationState } from '@/features/fires'

const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

interface FireListPanelProps {
    sites: FireSite[]
    pagination: PaginationState
    approvedSites: Set<string>
    animatingApprovals: Set<string>
    onApprove: (siteId: string, e: React.MouseEvent) => void
    onOpenImage: (url: string) => void
    onRefresh: () => Promise<void>
    goToPage: (page: number) => void
    goToNextPage: () => void
    goToPreviousPage: () => void
}

export function FireListPanel({
    sites,
    pagination,
    approvedSites,
    animatingApprovals,
    onApprove,
    onOpenImage,
    onRefresh,
    goToPage,
    goToNextPage,
    goToPreviousPage,
}: FireListPanelProps) {
    if (sites.length === 0) {
        return (
            <div className="py-16 text-center">
                <p className="text-gray-400">Нет данных по текущим фильтрам</p>
            </div>
        )
    }

    return (
        <>
            <div className="grid gap-6">
                {sites.map((site, index) => (
                    <div
                        key={site.id}
                        className={`animate-slide-up overflow-hidden rounded-2xl border shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
                            approvedSites.has(site.id)
                                ? 'border-green-300 bg-gradient-to-br from-green-50 to-white'
                                : 'border-gray-200 bg-white'
                        }`}
                        style={{ animationDelay: `${index * 0.1}s` }}
                    >
                        <div className="relative flex flex-col lg:flex-row">
                            {site.image && (
                                <div className="flex-shrink-0 lg:w-80 xl:w-96">
                                    <img
                                        src={`${baseUrl}${site.image}`}
                                        alt="Изображение пожара"
                                        className="h-64 w-full cursor-pointer object-cover transition-all duration-300 hover:scale-105 hover:opacity-90 lg:h-full"
                                        onClick={() =>
                                            onOpenImage(`${baseUrl}${site.image}`)
                                        }
                                    />
                                </div>
                            )}

                            <div className="flex-1 p-6">
                                <div className="mb-4 flex items-start justify-between">
                                    <div>
                                        <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                                            Отчёт №{String(site.id)}
                                            {site.hidden && (
                                                <span className="rounded bg-gray-300 px-1.5 py-0.5 text-gray-600 normal-case">
                                                    Скрыт
                                                </span>
                                            )}
                                        </p>
                                        <h3 className="flex items-center gap-2 text-xl font-bold text-gray-800">
                                            📍 {site.location}
                                            {site.session_name && (
                                                <span className="text-sm font-normal text-gray-500">
                                                    ({site.session_name})
                                                </span>
                                            )}
                                            {approvedSites.has(site.id) && (
                                                <span className="animate-sparkle text-green-600">
                                                    ✨
                                                </span>
                                            )}
                                        </h3>
                                    </div>
                                    <div
                                        className={`rounded-full px-3 py-1 text-xl font-bold ${
                                            Math.round(site.conf) >= 80
                                                ? 'bg-red-100 text-red-800'
                                                : Math.round(site.conf) >= 60
                                                  ? 'bg-orange-100 text-orange-800'
                                                  : Math.round(site.conf) >= 40
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : 'bg-gray-100 text-gray-800'
                                        }`}
                                    >
                                        {Math.round(site.conf)}%
                                    </div>
                                </div>

                                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <span className="text-lg">⏰</span>
                                        <div>
                                            <p className="text-sm text-gray-500">
                                                Время обнаружения
                                            </p>
                                            <p className="font-medium">
                                                {new Date(
                                                    site.time
                                                ).toLocaleString('kz-KZ', {
                                                    timeZone: 'UTC',
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <span className="text-lg">🌐</span>
                                        <div>
                                            <p className="text-sm text-gray-500">
                                                Координаты
                                            </p>
                                            <p className="font-mono font-medium">
                                                {site.latitude.toFixed(4)},{' '}
                                                {site.longitude.toFixed(4)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {site.description && (
                                    <div className="rounded-lg bg-gray-50 p-4">
                                        <p className="mb-1 text-sm text-gray-500">
                                            📝 Описание
                                        </p>
                                        <p className="text-gray-700">
                                            {site.description}
                                        </p>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={(e) => onApprove(site.id, e)}
                                    className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all duration-200 ${
                                        approvedSites.has(site.id)
                                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-green-700'
                                    } ${animatingApprovals.has(site.id) ? 'animate-approval-pulse' : ''}`}
                                    title={
                                        approvedSites.has(site.id)
                                            ? 'Снять подтверждение'
                                            : 'Подтвердить как реальный пожар'
                                    }
                                >
                                    {approvedSites.has(site.id) ? (
                                        <>
                                            <svg
                                                className="h-5 w-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2.5}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                            Подтверждено
                                        </>
                                    ) : (
                                        <>
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
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                            Подтвердить отчёт
                                        </>
                                    )}
                                </button>
                                {site.hidden && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await unhideFire(site.id)
                                                await onRefresh()
                                            } catch (e) {
                                                console.error(e)
                                            }
                                        }}
                                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-green-300 bg-green-50 py-2.5 text-sm font-medium text-green-800 hover:bg-green-100"
                                    >
                                        Вернуть в список
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {pagination.totalPages > 1 && (
                <div className="animate-fade-in mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Страница</span>
                        <span className="font-semibold text-red-600">
                            {pagination.currentPage}
                        </span>
                        <span>из</span>
                        <span className="font-semibold text-red-600">
                            {pagination.totalPages}
                        </span>
                        <span>• Всего записей: {pagination.totalCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={goToPreviousPage}
                            disabled={!pagination.hasPrevious}
                            className={`flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium ${
                                pagination.hasPrevious
                                    ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                    : 'cursor-not-allowed bg-gray-100 text-gray-400'
                            }`}
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
                                    d="M15 19l-7-7 7-7"
                                />
                            </svg>
                            <span>Предыдущая</span>
                        </button>
                        <div className="flex items-center gap-1">
                            {Array.from(
                                {
                                    length: Math.min(5, pagination.totalPages),
                                },
                                (_, i) => {
                                    let pageNum: number
                                    if (pagination.totalPages <= 5) {
                                        pageNum = i + 1
                                    } else if (pagination.currentPage <= 3) {
                                        pageNum = i + 1
                                    } else if (
                                        pagination.currentPage >=
                                        pagination.totalPages - 2
                                    ) {
                                        pageNum =
                                            pagination.totalPages - 4 + i
                                    } else {
                                        pageNum =
                                            pagination.currentPage - 2 + i
                                    }
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => goToPage(pageNum)}
                                            className={`h-10 w-10 rounded-lg text-sm font-medium ${
                                                pageNum ===
                                                pagination.currentPage
                                                    ? 'bg-red-600 text-white shadow-lg'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    )
                                }
                            )}
                        </div>
                        <button
                            onClick={goToNextPage}
                            disabled={!pagination.hasNext}
                            className={`flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium ${
                                pagination.hasNext
                                    ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                    : 'cursor-not-allowed bg-gray-100 text-gray-400'
                            }`}
                        >
                            <span>Следующая</span>
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
                                    d="M9 5l7 7-7 7"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}

export function FireListHeader({
    sitesCount,
    totalCount,
    approvedCount,
    approvedIds,
    onDownloadZip,
}: {
    sitesCount: number
    totalCount: number
    approvedCount: number
    approvedIds: (string | number)[]
    onDownloadZip: (ids: (string | number)[]) => void
}) {
    return (
        <div className="animate-slide-up mb-8 text-center">
            <h2 className="mb-2 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-3xl font-bold">
                🔥 Мониторинг пожаров
            </h2>
            <p className="text-gray-600">
                Показано{' '}
                <span className="font-semibold text-red-600">{sitesCount}</span>{' '}
                из {totalCount} активных очагов
                {approvedCount > 0 && (
                    <span className="ml-2">
                        •{' '}
                        <span className="font-semibold text-green-600">
                            {approvedCount}
                        </span>{' '}
                        подтверждено
                        <button
                            type="button"
                            onClick={() => onDownloadZip(approvedIds)}
                            className="ml-3 rounded-lg bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
                        >
                            Скачать выбранные (ZIP)
                        </button>
                    </span>
                )}
            </p>
        </div>
    )
}
