import React from 'react'
import { FireSite } from '../types'

interface Props {
    site: FireSite
    onOpenImage: (url: string) => void
    approved: boolean
    animating: boolean
    onToggleApprove: (id: string, e: React.MouseEvent) => void
}

export const FireCard: React.FC<Props> = ({ site, onOpenImage, approved, animating, onToggleApprove }) => {
    return (
        <div
            className={`animate-slide-up overflow-hidden rounded-2xl border shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
                approved ? 'border-green-300 bg-gradient-to-br from-green-50 to-white' : 'border-gray-200 bg-white'
            }`}
        >
            <div className="relative flex flex-col lg:flex-row">
                {site.image && (
                    <div className="flex-shrink-0 lg:w-80 xl:w-96">
                        <img
                            src={`${import.meta.env.VITE_API_URL}${site.image}`}
                            alt="Изображение пожара"
                            className="h-64 w-full cursor-pointer object-cover transition-all duration-300 hover:scale-105 hover:opacity-90 lg:h-full"
                            onClick={() => onOpenImage(`${import.meta.env.VITE_API_URL}${site.image}`)}
                        />
                    </div>
                )}

                <div className="flex-1 p-6">
                    <div className="mb-4 flex items-start justify-between">
                        <h3 className="flex items-center gap-2 text-xl font-bold text-gray-800">
                            📍 {site.location}
                            {approved && <div className="animate-sparkle ml-2 text-green-600">✨</div>}
                        </h3>
                        <div
                            className={`rounded-full px-3 py-1 text-xl font-bold transition-all duration-200 hover:scale-105 ${
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
                        <div className="flex items-center gap-2 text-gray-600 transition-all duration-200 hover:text-gray-800">
                            <span className="text-lg">⏰</span>
                            <div>
                                <p className="text-sm text-gray-500">Время обнаружения</p>
                                <p className="font-medium">
                                    {new Date(site.time).toLocaleString('ru-RU')}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-gray-600 transition-all duration-200 hover:text-gray-800">
                            <span className="text-lg">🌐</span>
                            <div>
                                <p className="text-sm text-gray-500">Координаты</p>
                                <p className="font-mono font-medium">
                                    {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {site.description && (
                        <div className="rounded-lg bg-gray-50 p-4 transition-all duration-200 hover:bg-gray-100">
                            <p className="mb-1 text-sm text-gray-500">📝 Описание</p>
                            <p className="text-gray-700">{site.description}</p>
                        </div>
                    )}
                </div>

                <div className="absolute right-4 bottom-4">
                    <button
                        onClick={(e) => onToggleApprove(site.id, e)}
                        className={`approval-button group relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
                            approved ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' : 'bg-white text-gray-500 hover:text-green-600'
                        } ${animating ? 'animate-approval-pulse' : ''}`}
                        title={approved ? 'Отменить подтверждение' : 'Подтвердить как реальный пожар'}
                    >
                        {approved ? (
                            <div className="approved relative">
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path className="checkmark-path" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        ) : (
                            <svg className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        <div className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-active:bg-white group-active:opacity-30"></div>
                    </button>
                </div>
            </div>
        </div>
    )
}


