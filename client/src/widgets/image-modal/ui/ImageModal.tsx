import { useEffect, useRef, useState, useCallback } from 'react'
import type { ImagePosition } from '@/entities/fire'

interface ImageModalProps {
    imageUrl: string | null
    onClose: () => void
}

export function ImageModal({ imageUrl, onClose }: ImageModalProps) {
    const [scale, setScale] = useState(1)
    const [position, setPosition] = useState<ImagePosition>({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<ImagePosition>({ x: 0, y: 0 })
    const [showControls, setShowControls] = useState(true)
    const imageRef = useRef<HTMLImageElement>(null)

    const resetPosition = useCallback(() => {
        setPosition({ x: 0, y: 0 })
        setScale(1)
        setShowControls(true)
    }, [])

    const handleClose = useCallback(() => {
        setPosition({ x: 0, y: 0 })
        setScale(1)
        setIsDragging(false)
        setShowControls(true)
        onClose()
    }, [onClose])

    useEffect(() => {
        if (!imageUrl) return
        setScale(1)
        setPosition({ x: 0, y: 0 })
    }, [imageUrl])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (imageUrl) {
                if (e.key === 'Escape') handleClose()
                if (e.key === 'r' || e.key === 'R') resetPosition()
            }
        }
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging && imageUrl) {
                const deltaX = e.clientX - dragStart.x
                const deltaY = e.clientY - dragStart.y
                setPosition((prev) => ({
                    x: prev.x + deltaX * 0.45,
                    y: prev.y + deltaY * 0.45,
                }))
                setDragStart({ x: e.clientX, y: e.clientY })
            }
        }
        const handleMouseUp = () => setIsDragging(false)
        const handleWheel = (e: WheelEvent) => {
            if (imageUrl) {
                e.preventDefault()
                const delta = e.deltaY > 0 ? -0.1 : 0.1
                setScale((prev) => {
                    const newScale = Math.max(
                        0.5,
                        Math.min(3, prev + delta)
                    )
                    setShowControls(newScale <= 1.25)
                    return newScale
                })
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        window.addEventListener('wheel', handleWheel, { passive: false })
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('wheel', handleWheel)
        }
    }, [imageUrl, isDragging, dragStart, handleClose, resetPosition])

    if (!imageUrl) return null

    const cursorClass =
        scale > 1
            ? isDragging
                ? 'cursor-grabbing'
                : 'cursor-grab'
            : 'cursor-default'

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-fade-in"
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => {
                if (scale > 1.25) {
                    setTimeout(() => setShowControls(false), 1000)
                }
            }}
            onClick={handleClose}
        >
            <div className="relative max-h-screen max-w-screen p-8">
                <div
                    className={`absolute top-8 right-8 z-10 flex gap-2 transition-opacity duration-300 ${
                        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                >
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            resetPosition()
                        }}
                        className="rounded-lg bg-gray-800/90 p-2 text-gray-100 shadow-lg hover:bg-gray-800"
                        title="Сбросить (R)"
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
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            handleClose()
                        }}
                        className="rounded-lg bg-gray-800/90 p-2 text-gray-100 shadow-lg hover:bg-gray-800"
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
                <div
                    className={`absolute top-8 left-8 z-10 rounded-lg bg-gray-800/90 px-3 py-1 text-gray-100 shadow-lg transition-opacity duration-300 ${
                        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                >
                    {Math.round(scale * 100)}%
                </div>
                <img
                    ref={imageRef}
                    src={imageUrl}
                    alt="Увеличенное изображение пожара"
                    className={`${cursorClass} max-w-none transition-transform duration-200 ease-out animate-scale-in`}
                    style={{
                        transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                        maxHeight: '90vh',
                        maxWidth: '90vw',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                        if (scale > 1) {
                            e.preventDefault()
                            setIsDragging(true)
                            setDragStart({
                                x: e.clientX,
                                y: e.clientY,
                            })
                        }
                    }}
                    draggable={false}
                />
                <div
                    className={`absolute bottom-8 left-1/2 -translate-x-1/2 rounded-lg bg-gray-800/90 px-4 py-2 text-center text-sm text-gray-100 shadow-lg transition-opacity duration-300 ${
                        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                >
                    <p>
                        Колесико мыши для масштаба
                        {scale > 1 && ', перетащите для перемещения'}
                    </p>
                    <p className="text-xs opacity-75">
                        <kbd className="rounded bg-gray-600/30 px-1">R</kbd> —
                        сброс,{' '}
                        <kbd className="rounded bg-gray-600/30 px-1">
                            Escape
                        </kbd>{' '}
                        — закрыть
                    </p>
                </div>
            </div>
        </div>
    )
}
