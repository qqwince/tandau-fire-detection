import { useEffect, useState, useRef } from 'react'
import { fetchFireSites, type PaginationParams, type PaginatedResponse } from '../http/fireSites.ts'

interface FireSite {
    id: string
    location: string
    time: string
    description?: string
    latitude: number
    longitude: number
    image?: string
    conf: number
}

type SortField = 'time' | 'conf'
type SortOrder = 'asc' | 'desc'

interface Filters {
    selectedLocations: string[]
    sortField: SortField
    sortOrder: SortOrder
    confMin: number
    confMax: number
}

interface ImagePosition {
    x: number
    y: number
}

const FireList = () => {
    const [sites, setSites] = useState<FireSite[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const [imageScale, setImageScale] = useState(1)
    const [imagePosition, setImagePosition] = useState<ImagePosition>({
        x: 0,
        y: 0,
    })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<ImagePosition>({ x: 0, y: 0 })
    const [showControls, setShowControls] = useState(true)
    const [approvedSites, setApprovedSites] = useState<Set<string>>(new Set())
    const [animatingApprovals, setAnimatingApprovals] = useState<Set<string>>(
        new Set()
    )
    const imageRef = useRef<HTMLImageElement>(null)
    const [filters, setFilters] = useState<Filters>({
        selectedLocations: [],
        sortField: 'time',
        sortOrder: 'desc',
        confMin: 30,
        confMax: 100,
    })
    
    // Состояние пагинации
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        pageSize: 10,
        hasNext: false,
        hasPrevious: false,
    })

    useEffect(() => {
        loadSites()
    }, [filters, pagination.currentPage, pagination.pageSize])

    // Keyboard and mouse event handlers for image modal
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (selectedImage) {
                switch (event.key) {
                    case 'Escape':
                        closeImageModal()
                        break
                    case '+':
                    case '=':
                        event.preventDefault()
                        handleZoomIn()
                        break
                    case '-':
                        event.preventDefault()
                        handleZoomOut()
                        break
                    case 'r':
                    case 'R':
                        resetImagePosition()
                        break
                }
            }
        }

        const handleMouseMove = (event: MouseEvent) => {
            if (isDragging && selectedImage) {
                const deltaX = event.clientX - dragStart.x
                const deltaY = event.clientY - dragStart.y
                setImagePosition((prev) => ({
                    x: prev.x + deltaX,
                    y: prev.y + deltaY,
                }))
                setDragStart({ x: event.clientX, y: event.clientY })
            }
        }

        const handleMouseUp = () => {
            setIsDragging(false)
        }

        // Auto-hide controls when zooming
        let hideControlsTimer: ReturnType<typeof setTimeout>
        if (selectedImage && imageScale > 1.25) {
            hideControlsTimer = setTimeout(() => {
                setShowControls(false)
            }, 2000)
        } else {
            setShowControls(true)
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            if (hideControlsTimer) clearTimeout(hideControlsTimer)
        }
    }, [selectedImage, isDragging, dragStart, imageScale])

    // Mouse enter/leave to show/hide controls
    const handleModalMouseEnter = () => {
        setShowControls(true)
    }

    const handleModalMouseLeave = () => {
        if (imageScale > 1.25) {
            setTimeout(() => setShowControls(false), 1000)
        }
    }

    const loadSites = async () => {
        try {
            setLoading(true)
            
            const params: PaginationParams = {
                page: pagination.currentPage,
                page_size: pagination.pageSize,
                sort_field: filters.sortField,
                sort_order: filters.sortOrder,
                conf_min: filters.confMin,
                conf_max: filters.confMax,
            }
            
            // Добавляем фильтр по локации если выбраны конкретные локации
            if (filters.selectedLocations.length > 0) {
                // Для множественного выбора локаций используем первую выбранную
                // В будущем можно расширить API для поддержки массива локаций
                params.location = filters.selectedLocations[0]
            }
            
            const data: PaginatedResponse<FireSite> = await fetchFireSites(params)
            
            setSites(data.results || [])
            setPagination(prev => ({
                ...prev,
                totalPages: data.total_pages,
                totalCount: data.count,
                hasNext: data.has_next,
                hasPrevious: data.has_previous,
            }))
        } catch (error) {
            console.error('Ошибка при загрузке:', error)
            setSites([])
        } finally {
            setLoading(false)
        }
    }

    const updateFilters = (updates: Partial<Filters>) => {
        setFilters((prev) => ({ ...prev, ...updates }))
        // Сбрасываем пагинацию при изменении фильтров
        setPagination(prev => ({ ...prev, currentPage: 1 }))
    }

    const toggleLocation = (location: string) => {
        const newLocations = filters.selectedLocations.includes(location)
            ? filters.selectedLocations.filter((loc) => loc !== location)
            : [...filters.selectedLocations, location]

        updateFilters({ selectedLocations: newLocations })
    }

    // Функции для управления пагинацией
    const goToPage = (page: number) => {
        if (page >= 1 && page <= pagination.totalPages) {
            setPagination(prev => ({ ...prev, currentPage: page }))
        }
    }

    const goToNextPage = () => {
        if (pagination.hasNext) {
            goToPage(pagination.currentPage + 1)
        }
    }

    const goToPreviousPage = () => {
        if (pagination.hasPrevious) {
            goToPage(pagination.currentPage - 1)
        }
    }

    const changePageSize = (newPageSize: number) => {
        setPagination(prev => ({ 
            ...prev, 
            pageSize: newPageSize,
            currentPage: 1 // Сбрасываем на первую страницу при изменении размера
        }))
    }

    const handleApproval = (siteId: string, event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()

        // Добавляем анимацию
        setAnimatingApprovals((prev) => new Set([...prev, siteId]))

        setTimeout(() => {
            setApprovedSites((prev) => {
                const newSet = new Set(prev)
                if (newSet.has(siteId)) {
                    newSet.delete(siteId)
                } else {
                    newSet.add(siteId)
                }
                return newSet
            })

            // Убираем анимацию через короткое время
            setTimeout(() => {
                setAnimatingApprovals((prev) => {
                    const newSet = new Set(prev)
                    newSet.delete(siteId)
                    return newSet
                })
            }, 300)
        }, 150)
    }

    const openImageModal = (imageUrl: string) => {
        setSelectedImage(imageUrl)
        setImageScale(1)
        setImagePosition({ x: 0, y: 0 })
        setShowControls(true)
    }

    const closeImageModal = () => {
        setSelectedImage(null)
        setImageScale(1)
        setImagePosition({ x: 0, y: 0 })
        setIsDragging(false)
        setShowControls(true)
    }

    const handleZoomIn = () => {
        setImageScale((prev) => {
            const newScale = Math.min(prev + 0.25, 3)
            if (newScale > 1.25) {
                setTimeout(() => setShowControls(false), 2000)
            }
            return newScale
        })
    }

    const handleZoomOut = () => {
        setImageScale((prev) => {
            const newScale = Math.max(prev - 0.25, 0.5)
            if (newScale <= 1.25) {
                setShowControls(true)
                // Reset position when zooming out significantly
                if (newScale === 1) {
                    setImagePosition({ x: 0, y: 0 })
                }
            }
            return newScale
        })
    }

    const resetImagePosition = () => {
        setImagePosition({ x: 0, y: 0 })
        setImageScale(1)
        setShowControls(true)
    }

    const handleImageMouseDown = (event: React.MouseEvent) => {
        if (imageScale > 1) {
            event.preventDefault()
            setIsDragging(true)
            setDragStart({ x: event.clientX, y: event.clientY })
        }
    }


    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
                <div className="animate-fade-in text-center">
                    <div className="mb-4 animate-bounce text-6xl">🔥</div>
                    <p className="animate-pulse text-2xl font-bold text-gray-700">
                        Загрузка данных...
                    </p>
                    <div className="mx-auto mt-4 h-1 w-16 animate-pulse rounded-full bg-gradient-to-r from-red-500 to-orange-500"></div>
                </div>
            </div>
        )
    }

    const locations = Array.from(new Set(sites.map((site) => site.location)))

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes scaleIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }

                @keyframes approvalPulse {
                    0% {
                        transform: scale(1);
                    }
                    50% {
                        transform: scale(1.2);
                        filter: brightness(1.2);
                    }
                    100% {
                        transform: scale(1);
                    }
                }

                @keyframes checkmarkDraw {
                    0% {
                        stroke-dashoffset: 20;
                        opacity: 0;
                    }
                    50% {
                        opacity: 1;
                    }
                    100% {
                        stroke-dashoffset: 0;
                        opacity: 1;
                    }
                }

                @keyframes sparkle {
                    0%,
                    100% {
                        transform: scale(0) rotate(0deg);
                        opacity: 0;
                    }
                    50% {
                        transform: scale(1) rotate(180deg);
                        opacity: 1;
                    }
                }

                .animate-fade-in {
                    animation: fadeIn 0.6s ease-out;
                }

                .animate-slide-up {
                    animation: slideUp 0.4s ease-out;
                }

                .animate-scale-in {
                    animation: scaleIn 0.3s ease-out;
                }

                .animate-approval-pulse {
                    animation: approvalPulse 0.3s ease-out;
                }

                .animate-checkmark-draw {
                    animation: checkmarkDraw 0.3s ease-out;
                }

                .animate-sparkle {
                    animation: sparkle 0.6s ease-out;
                }

                .stagger-1 {
                    animation-delay: 0.1s;
                }
                .stagger-2 {
                    animation-delay: 0.2s;
                }
                .stagger-3 {
                    animation-delay: 0.3s;
                }

                .draggable-cursor {
                    cursor: ${imageScale > 1
                        ? isDragging
                            ? 'grabbing'
                            : 'grab'
                        : 'default'};
                }

                .controls-fade {
                    transition:
                        opacity 0.3s ease-in-out,
                        transform 0.3s ease-in-out;
                    opacity: ${showControls ? '1' : '0'};
                    transform: ${showControls
                        ? 'translateY(0)'
                        : 'translateY(-10px)'};
                    pointer-events: ${showControls ? 'auto' : 'none'};
                }

                .approval-button {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .approval-button:hover {
                    transform: translateY(-1px);
                    filter: brightness(1.1);
                }

                .approval-button:active {
                    transform: scale(0.95);
                }

                .checkmark-path {
                    stroke-dasharray: 20;
                    stroke-dashoffset: 20;
                }

                .approved .checkmark-path {
                    animation: checkmarkDraw 0.3s ease-out forwards;
                }
            `}</style>

            <div className="animate-fade-in mt-[60px] flex justify-center px-4">
                <section className="w-full max-w-7xl">
                    <div className="animate-slide-up mb-8 text-center">
                        <h2 className="mb-2 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-3xl font-bold text-transparent">
                            🔥 Мониторинг пожаров
                        </h2>
                        <p className="text-gray-600">
                            Показано{' '}
                            <span className="font-semibold text-red-600">
                                {sites.length}
                            </span>{' '}
                            из {pagination.totalCount} активных очагов
                            {approvedSites.size > 0 && (
                                <span className="ml-2">
                                    •{' '}
                                    <span className="font-semibold text-green-600">
                                        {approvedSites.size}
                                    </span>{' '}
                                    подтверждено
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Панель фильтров */}
                    <div className="animate-scale-in mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg transition-all duration-300 hover:shadow-xl">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                            {/* Фильтр по локации */}
                            <div className="animate-slide-up stagger-1">
                                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                                    📍 Локация
                                </h3>
                                <div className="max-h-32 space-y-2 overflow-hidden overflow-y-auto">
                                    {locations.map((location, index) => (
                                        <label
                                            key={location}
                                            className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-all duration-200 hover:scale-[1.02] hover:bg-gray-50"
                                            style={{
                                                animationDelay: `${index * 0.05}s`,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.selectedLocations.includes(
                                                    location
                                                )}
                                                onChange={() =>
                                                    toggleLocation(location)
                                                }
                                                className="h-4 w-4 rounded text-red-600 transition-all duration-200 focus:ring-red-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">
                                                {location}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Фильтр по confidence */}
                            <div className="animate-slide-up stagger-2">
                                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                                    🎯 Точность детекции
                                </h3>
                                <div className="flex flex-wrap items-center gap-4">
                                    <label className="flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                            От:
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={filters.confMin}
                                            onChange={(e) =>
                                                updateFilters({
                                                    confMin: Math.max(
                                                        0,
                                                        Number(e.target.value)
                                                    ),
                                                })
                                            }
                                            className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center transition-all duration-200 focus:scale-105 focus:border-red-500 focus:outline-none"
                                        />
                                        <span className="text-sm text-gray-600">
                                            %
                                        </span>
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                            До:
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={filters.confMax}
                                            onChange={(e) =>
                                                updateFilters({
                                                    confMax: Math.min(
                                                        100,
                                                        Number(e.target.value)
                                                    ),
                                                })
                                            }
                                            className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center transition-all duration-200 focus:scale-105 focus:border-red-500 focus:outline-none"
                                        />
                                        <span className="text-sm text-gray-600">
                                            %
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Сортировка и пагинация */}
                            <div className="animate-slide-up stagger-3">
                                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800">
                                    📊 Сортировка
                                </h3>
                                <div className="space-y-3">
                                    <select
                                        value={filters.sortField}
                                        onChange={(e) =>
                                            updateFilters({
                                                sortField: e.target
                                                    .value as SortField,
                                            })
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 transition-all duration-200 hover:scale-[1.02] focus:border-red-500 focus:outline-none"
                                    >
                                        <option value="time">
                                            ⏰ По времени
                                        </option>
                                        <option value="conf">
                                            🎯 По точности
                                        </option>
                                    </select>

                                    <select
                                        value={filters.sortOrder}
                                        onChange={(e) =>
                                            updateFilters({
                                                sortOrder: e.target
                                                    .value as SortOrder,
                                            })
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 transition-all duration-200 hover:scale-[1.02] focus:border-red-500 focus:outline-none"
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
                                            value={pagination.pageSize}
                                            onChange={(e) => changePageSize(Number(e.target.value))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 transition-all duration-200 hover:scale-[1.02] focus:border-red-500 focus:outline-none"
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

                    {/* Список пожаров */}
                    {sites.length === 0 ? (
                        <div className="animate-fade-in py-16 text-center">
                            <div className="mb-4 animate-bounce text-6xl">
                                🔍
                            </div>
                            <p className="mb-2 text-xl text-gray-500">
                                Пожары не найдены
                            </p>
                            <p className="text-gray-400">
                                Попробуйте изменить параметры фильтров
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-6">
                            {sites.map((site, index) => (
                                <div
                                    key={site.id}
                                    className={`animate-slide-up overflow-hidden rounded-2xl border shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
                                        approvedSites.has(site.id)
                                            ? 'border-green-300 bg-gradient-to-br from-green-50 to-white'
                                            : 'border-gray-200 bg-white'
                                    }`}
                                    style={{
                                        animationDelay: `${index * 0.1}s`,
                                    }}
                                >
                                    <div className="relative flex flex-col lg:flex-row">
                                        {site.image && (
                                            <div className="flex-shrink-0 lg:w-80 xl:w-96">
                                                <img
                                                    src={`${import.meta.env.VITE_API_URL}${site.image}`}
                                                    alt="Изображение пожара"
                                                    className="h-64 w-full cursor-pointer object-cover transition-all duration-300 hover:scale-105 hover:opacity-90 lg:h-full"
                                                    onClick={() =>
                                                        openImageModal(
                                                            `${import.meta.env.VITE_API_URL}${site.image}`
                                                        )
                                                    }
                                                />
                                            </div>
                                        )}

                                        <div className="flex-1 p-6">
                                            <div className="mb-4 flex items-start justify-between">
                                                <h3 className="flex items-center gap-2 text-xl font-bold text-gray-800">
                                                    📍 {site.location}
                                                    {approvedSites.has(
                                                        site.id
                                                    ) && (
                                                        <div className="animate-sparkle ml-2 text-green-600">
                                                            ✨
                                                        </div>
                                                    )}
                                                </h3>
                                                <div
                                                    className={`rounded-full px-3 py-1 text-xl font-bold transition-all duration-200 hover:scale-105 ${
                                                        Math.round(site.conf) >=
                                                        80
                                                            ? 'bg-red-100 text-red-800'
                                                            : Math.round(
                                                                    site.conf
                                                                ) >= 60
                                                              ? 'bg-orange-100 text-orange-800'
                                                              : Math.round(
                                                                      site.conf
                                                                  ) >= 40
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-gray-100 text-gray-800'
                                                    }`}
                                                >
                                                    {Math.round(site.conf)}%
                                                </div>
                                            </div>

                                            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <div className="flex items-center gap-2 text-gray-600 transition-all duration-200 hover:text-gray-800">
                                                    <span className="text-lg">
                                                        ⏰
                                                    </span>
                                                    <div>
                                                        <p className="text-sm text-gray-500">
                                                            Время обнаружения
                                                        </p>
                                                        <p className="font-medium">
                                                            {new Date(
                                                                site.time
                                                            ).toLocaleString(
                                                                'ru-RU'
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 text-gray-600 transition-all duration-200 hover:text-gray-800">
                                                    <span className="text-lg">
                                                        🌐
                                                    </span>
                                                    <div>
                                                        <p className="text-sm text-gray-500">
                                                            Координаты
                                                        </p>
                                                        <p className="font-mono font-medium">
                                                            {site.latitude.toFixed(
                                                                4
                                                            )}
                                                            ,{' '}
                                                            {site.longitude.toFixed(
                                                                4
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {site.description && (
                                                <div className="rounded-lg bg-gray-50 p-4 transition-all duration-200 hover:bg-gray-100">
                                                    <p className="mb-1 text-sm text-gray-500">
                                                        📝 Описание
                                                    </p>
                                                    <p className="text-gray-700">
                                                        {site.description}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Кнопка одобрения */}
                                        <div className="absolute right-4 bottom-4">
                                            <button
                                                onClick={(e) =>
                                                    handleApproval(site.id, e)
                                                }
                                                className={`approval-button group relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
                                                    approvedSites.has(site.id)
                                                        ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                                                        : 'bg-white text-gray-500 hover:text-green-600'
                                                } ${
                                                    animatingApprovals.has(
                                                        site.id
                                                    )
                                                        ? 'animate-approval-pulse'
                                                        : ''
                                                }`}
                                                title={
                                                    approvedSites.has(site.id)
                                                        ? 'Отменить подтверждение'
                                                        : 'Подтвердить как реальный пожар'
                                                }
                                            >
                                                {approvedSites.has(site.id) ? (
                                                    <div className="approved relative">
                                                        <svg
                                                            className="h-6 w-6"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                className="checkmark-path"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={3}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                    </div>
                                                ) : (
                                                    <svg
                                                        className="h-6 w-6 transition-transform duration-200 group-hover:scale-110"
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
                                                )}

                                                {/* Эффект ряби при клике */}
                                                <div className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-active:bg-white group-active:opacity-30"></div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Панель пагинации */}
                    {pagination.totalPages > 1 && (
                        <div className="animate-fade-in mt-8 flex flex-col items-center justify-center space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                                <span>Страница</span>
                                <span className="font-semibold text-red-600">{pagination.currentPage}</span>
                                <span>из</span>
                                <span className="font-semibold text-red-600">{pagination.totalPages}</span>
                                <span>• Всего записей: {pagination.totalCount}</span>
                            </div>
                            
                            <div className="flex items-center space-x-2">
                                {/* Кнопка "Предыдущая" */}
                                <button
                                    onClick={goToPreviousPage}
                                    disabled={!pagination.hasPrevious}
                                    className={`flex items-center space-x-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                                        pagination.hasPrevious
                                            ? 'bg-red-50 text-red-700 hover:bg-red-100 hover:scale-105'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span>Предыдущая</span>
                                </button>

                                {/* Номера страниц */}
                                <div className="flex items-center space-x-1">
                                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (pagination.totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (pagination.currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (pagination.currentPage >= pagination.totalPages - 2) {
                                            pageNum = pagination.totalPages - 4 + i;
                                        } else {
                                            pageNum = pagination.currentPage - 2 + i;
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => goToPage(pageNum)}
                                                className={`w-10 h-10 rounded-lg text-sm font-medium transition-all duration-200 ${
                                                    pageNum === pagination.currentPage
                                                        ? 'bg-red-600 text-white shadow-lg'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700 hover:scale-105'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Кнопка "Следующая" */}
                                <button
                                    onClick={goToNextPage}
                                    disabled={!pagination.hasNext}
                                    className={`flex items-center space-x-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                                        pagination.hasNext
                                            ? 'bg-red-50 text-red-700 hover:bg-red-100 hover:scale-105'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <span>Следующая</span>
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Модальное окно для изображения */}
                    {selectedImage && (
                        <div
                            className="bg-opacity-90 animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black"
                            onMouseEnter={handleModalMouseEnter}
                            onMouseLeave={handleModalMouseLeave}
                            onClick={closeImageModal}
                        >
                            <div className="relative max-h-screen max-w-screen p-4">
                                {/* Панель управления */}
                                <div className="controls-fade absolute top-4 right-4 z-10 flex gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleZoomOut()
                                        }}
                                        className="bg-opacity-20 hover:bg-opacity-40 rounded-lg bg-black p-2 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                                        title="Уменьшить (клавиша -)"
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
                                                d="M20 12H4"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleZoomIn()
                                        }}
                                        className="bg-opacity-20 hover:bg-opacity-40 rounded-lg bg-black p-2 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                                        title="Увеличить (клавиша +)"
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
                                                d="M12 4v16m8-8H4"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            resetImagePosition()
                                        }}
                                        className="bg-opacity-20 hover:bg-opacity-40 rounded-lg bg-black p-2 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                                        title="Сбросить (клавиша R)"
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
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                            />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            closeImageModal()
                                        }}
                                        className="bg-opacity-20 hover:bg-opacity-40 rounded-lg bg-black p-2 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110"
                                        title="Закрыть (Escape)"
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

                                {/* Индикатор масштаба */}
                                <div className="bg-opacity-20 controls-fade absolute top-4 left-4 z-10 rounded-lg bg-black px-3 py-1 text-white backdrop-blur-sm">
                                    {Math.round(imageScale * 100)}%
                                </div>

                                {/* Изображение */}
                                <img
                                    ref={imageRef}
                                    src={selectedImage}
                                    alt="Увеличенное изображение пожара"
                                    className="draggable-cursor animate-scale-in max-w-none transition-transform duration-200 ease-out"
                                    style={{
                                        transform: `scale(${imageScale}) translate(${imagePosition.x}px, ${imagePosition.y}px)`,
                                        maxHeight: '90vh',
                                        maxWidth: '90vw',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={handleImageMouseDown}
                                    draggable={false}
                                />

                                {/* Подсказка */}
                                <div className="bg-opacity-20 controls-fade absolute bottom-4 left-1/2 -translate-x-1/2 transform rounded-lg bg-black px-4 py-2 text-center text-white backdrop-blur-sm">
                                    <p className="text-sm">
                                        <kbd className="bg-opacity-30 rounded bg-white px-1">
                                            +
                                        </kbd>{' '}
                                        и{' '}
                                        <kbd className="bg-opacity-30 rounded bg-white px-1">
                                            -
                                        </kbd>{' '}
                                        для масштаба
                                        {imageScale > 1 && (
                                            <span>
                                                , перетащите для перемещения
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs opacity-75">
                                        <kbd className="bg-opacity-30 rounded bg-white px-1">
                                            R
                                        </kbd>{' '}
                                        - сброс,{' '}
                                        <kbd className="bg-opacity-30 rounded bg-white px-1">
                                            Escape
                                        </kbd>{' '}
                                        - закрыть
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}

export default FireList
