import type { Filters, SortField, SortOrder } from '@/entities/fire'

interface FireFiltersPanelProps {
    filters: Filters
    pageSize: number
    locations: string[]
    onFiltersChange: (updates: Partial<Filters>) => void
    onToggleLocation: (location: string) => void
    onPageSizeChange: (size: number) => void
}

export function FireFiltersPanel({
    filters,
    pageSize,
    locations,
    onFiltersChange,
    onToggleLocation,
    onPageSizeChange,
}: FireFiltersPanelProps) {
    return (
        <div className="animate-scale-in mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg transition-all duration-300 hover:shadow-xl">
            <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-800">
                    🔍 Поиск по отчётам
                </h3>
                <input
                    type="text"
                    value={filters.searchQuery}
                    onChange={(e) =>
                        onFiltersChange({ searchQuery: e.target.value })
                    }
                    placeholder="ID, локация или описание..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                />
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="animate-slide-up stagger-1">
                    <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                        📍 Локация
                    </h3>
                    <div className="max-h-32 space-y-2 overflow-y-auto">
                        {locations.map((location, index) => (
                            <label
                                key={location}
                                className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-all duration-200 hover:scale-[1.02] hover:bg-gray-50"
                                style={{ animationDelay: `${index * 0.05}s` }}
                            >
                                <input
                                    type="checkbox"
                                    checked={filters.selectedLocations.includes(
                                        location
                                    )}
                                    onChange={() => onToggleLocation(location)}
                                    className="h-4 w-4 rounded text-red-600 focus:ring-red-500"
                                />
                                <span className="text-sm font-medium text-gray-700">
                                    {location}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="animate-slide-up stagger-2">
                    <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                        🎯 Точность детекции
                    </h3>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-500">
                                Мин. точность детекции:
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={filters.confMin}
                                onChange={(e) =>
                                    onFiltersChange({
                                        confMin: Math.min(
                                            Number(e.target.value),
                                            filters.confMax
                                        ),
                                    })
                                }
                                className="h-1 w-full cursor-pointer accent-red-500"
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2">
                                <span className="text-sm font-medium">От:</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={filters.confMin}
                                    onChange={(e) =>
                                        onFiltersChange({
                                            confMin: Math.max(
                                                0,
                                                Number(e.target.value)
                                            ),
                                        })
                                    }
                                    className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center focus:border-red-500 focus:outline-none"
                                />
                                <span className="text-sm text-gray-600">%</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <span className="text-sm font-medium">До:</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={filters.confMax}
                                    onChange={(e) =>
                                        onFiltersChange({
                                            confMax: Math.min(
                                                100,
                                                Number(e.target.value)
                                            ),
                                        })
                                    }
                                    className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center focus:border-red-500 focus:outline-none"
                                />
                                <span className="text-sm text-gray-600">%</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="animate-slide-up stagger-3">
                    <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                        📊 Сортировка
                    </h3>
                    <div className="space-y-3">
                        <select
                            value={filters.sortField}
                            onChange={(e) =>
                                onFiltersChange({
                                    sortField: e.target.value as SortField,
                                })
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                        >
                            <option value="time">⏰ По времени</option>
                            <option value="conf">🎯 По точности</option>
                        </select>
                        <select
                            value={filters.sortOrder}
                            onChange={(e) =>
                                onFiltersChange({
                                    sortOrder: e.target.value as SortOrder,
                                })
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                        >
                            <option value="desc">
                                {filters.sortField === 'time'
                                    ? '📅 Сначала новые'
                                    : '📈 Сначала высокие'}
                            </option>
                            <option value="asc">
                                {filters.sortField === 'time'
                                    ? '📅 Сначала старые'
                                    : '📉 Сначала низкие'}
                            </option>
                        </select>
                        <div className="mt-4">
                            <h4 className="mb-2 text-sm font-semibold text-gray-700">
                                📄 Записей на странице
                            </h4>
                            <select
                                value={pageSize}
                                onChange={(e) =>
                                    onPageSizeChange(Number(e.target.value))
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none"
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
