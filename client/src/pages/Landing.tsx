import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import outputVideo from '@/assets/output.mp4'
import { Link } from 'react-router-dom'

function Landing() {
    const phrases = [
        'Предотвращаем',
        'Обнаруживаем',
        'Тушим',
        'Защищаем',
        'Охраняем',
        'Сохраняем',
        'Предупреждаем',
        'Спасаем',
        'Помогаем',
    ]

    const [index, setIndex] = useState(0)
    const [show, setShow] = useState(true)
    const [word, setWord] = useState('')
    const completeWord = 'Fire Detection System'

    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((prev) => (prev + 1) % phrases.length)
        }, 2500)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        if (show) {
            const titleInterval = setInterval(() => {
                setWord((prev) => {
                    if (prev.length < completeWord.length) {
                        return prev + completeWord[prev.length]
                    }
                    clearInterval(titleInterval)
                    return prev
                })
            }, 200)
            return () => clearInterval(titleInterval)
        }
    }, [show])

    const benefits = [
        {
            icon: '⚡',
            title: 'Мгновенное обнаружение',
            description: 'Алгоритмы YOLO анализируют видеопоток в реальном времени и обнаруживают очаги возгорания за секунды',
        },
        {
            icon: '🎯',
            title: 'Высокая точность',
            description: 'Точность детекции показывает отличные результаты благодаря обученным нейронным сетям на тысячах примеров',
        },
        {
            icon: '📱',
            title: 'Мгновенные уведомления',
            description: 'Автоматическая отправка уведомлений в Telegram при обнаружении пожара для оперативного реагирования',
        },
        {
            icon: '🤝',
            title: 'Командная работа',
            description: 'Система сессий позволяет командам работать совместно, управлять доступом и отслеживать все действия',
        },
        {
            icon: '📊',
            title: 'Детальная аналитика',
            description: 'Полная история обнаружений с фильтрацией по локациям, времени и уровню уверенности',
        },
        {
            icon: '🔒',
            title: 'Безопасность',
            description: 'Многоуровневая система ролей и полный аудит-лог всех действий пользователей',
        },
    ]

    const steps = [
        {
            number: '01',
            title: 'Подключение камер',
            description: 'Подключите ваши камеры к системе. Поддерживаются IP-камеры, RTSP-потоки и локальные видеофайлы',
        },
        {
            number: '02',
            title: 'Автоматический анализ',
            description: 'Система непрерывно анализирует видеопоток с помощью обученных моделей YOLO',
        },
        {
            number: '03',
            title: 'Мгновенное оповещение',
            description: 'При обнаружении пожара вы получаете уведомление в Telegram и данные сохраняются в системе',
        },
        {
            number: '04',
            title: 'Управление и контроль',
            description: 'Просматривайте все обнаружения, фильтруйте по параметрам и управляйте доступом команды',
        },
    ]

    return (
        <div className="min-h-screen bg-[#fafafa]">
            {/* Hero Section */}
            <section className="relative flex min-h-[90vh] w-full items-center justify-center overflow-hidden">
                <video
                    src={outputVideo}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(239,68,68,0.15),transparent)]" />

                <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-8 px-6 py-20 text-white">
                    <motion.h1
                        className="text-center text-5xl font-extrabold tracking-tight drop-shadow-2xl md:text-7xl lg:text-8xl"
                        initial={{ opacity: 0, y: -30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        style={{ textShadow: '0 4px 30px rgba(0,0,0,0.3)' }}
                    >
                        {word}
                    </motion.h1>

                    <p className="max-w-2xl text-center text-lg leading-relaxed text-white/95 md:text-xl">
                        Инновационная система на базе ИИ для раннего распознавания и тушения пожаров.
                        Анализ в реальном времени, мгновенное обнаружение очагов и автоматизация ликвидации.
                    </p>

                    <div className="flex flex-col items-center gap-2">
                        <span className="text-3xl font-medium uppercase tracking-widest text-white/70">Мы</span>
                        <AnimatePresence mode="wait">
                            <motion.span
                                key={phrases[index]}
                                className="min-h-[3rem] text-3xl font-bold md:text-4xl"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.4 }}
                            >
                                {phrases[index]}
                            </motion.span>
                        </AnimatePresence>
                    </div>

                    <Link to="/fires">
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.98 }}
                            className="mt-4 rounded-2xl bg-white px-10 py-4 text-lg font-bold text-red-600 shadow-2xl shadow-black/25 transition hover:bg-gray-100 hover:shadow-red-500/20"
                        >
                            Начать с нами →
                        </motion.button>
                    </Link>
                </div>
            </section>

            {/* Mission Section */}
            <section id="mission" className="relative overflow-hidden bg-white py-24">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#fef2f2_1px,transparent_1px),linear-gradient(to_bottom,#fef2f2_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-40" />
                <div className="relative mx-auto max-w-7xl px-4">
                    <div className="grid gap-16 md:grid-cols-2 md:items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -40 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <span className="mb-4 inline-block text-sm font-semibold uppercase tracking-wider text-red-600">Миссия</span>
                            <h2 className="mb-8 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
                                Защита того, что важно
                            </h2>
                            <p className="mb-6 text-lg leading-relaxed text-gray-600">
                                Мы объединяем машинное обучение с практическими решениями для защиты жизни, природы и имущества от пожаров.
                            </p>
                            <p className="mb-6 text-lg leading-relaxed text-gray-600">
                                Цель — максимально быстрое обнаружение очагов возгорания и инструменты для управления ситуацией в реальном времени.
                            </p>
                            <p className="text-lg leading-relaxed text-gray-600">
                                Система масштабируется: от небольших объектов до крупных территорий с множеством точек мониторинга.
                            </p>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, x: 40 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            className="flex justify-center"
                        >
                            <div className="relative">
                                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-r from-red-400/30 to-orange-400/30 blur-2xl" />
                                <div className="relative rounded-3xl border border-red-100 bg-gradient-to-br from-red-50 to-orange-50 p-12 text-center shadow-xl">
                                    <div className="mb-6 text-8xl">🔥</div>
                                    <h3 className="text-2xl font-bold text-gray-900 md:text-3xl">
                                        Защита от пожаров
                                    </h3>
                                    <p className="mt-2 text-gray-600">
                                        Каждую секунду, каждый день
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="bg-[#fafafa] py-24">
                <div className="mx-auto max-w-7xl px-4">
                    <motion.div
                        className="mb-16 text-center"
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="text-sm font-semibold uppercase tracking-wider text-red-600">Преимущества</span>
                        <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
                             Преимущества системы
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
                            Всё необходимое для надёжного мониторинга пожаров
                        </p>
                    </motion.div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {benefits.map((benefit, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.08 }}
                                className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[var(--shadow-soft)] transition-all duration-300 hover:border-red-200 hover:shadow-[var(--shadow-card)] hover:shadow-red-500/5"
                            >
                                <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-red-500 to-orange-500 opacity-0 transition-opacity group-hover:opacity-100" />
                                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-3xl transition-colors group-hover:bg-red-50">
                                    {benefit.icon}
                                </div>
                                <h3 className="mb-3 text-xl font-bold text-gray-900">
                                    {benefit.title}
                                </h3>
                                <p className="text-gray-600 leading-relaxed">
                                    {benefit.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="bg-white py-24">
                <div className="mx-auto max-w-7xl px-4">
                    <motion.div
                        className="mb-16 text-center"
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="text-sm font-semibold uppercase tracking-wider text-red-600">Процесс</span>
                        <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
                            Как это работает
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
                            От подключения камер до полного контроля
                        </p>
                    </motion.div>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                        {steps.map((step, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="relative"
                            >
                                <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-8 shadow-[var(--shadow-soft)] transition-all hover:border-red-100 hover:shadow-[var(--shadow-card)]">
                                    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-lg font-bold text-white shadow-lg shadow-red-500/30">
                                        {step.number}
                                    </div>
                                    <h3 className="mb-3 text-xl font-bold text-gray-900">
                                        {step.title}
                                    </h3>
                                    <p className="text-gray-600 leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>
                                {index < steps.length - 1 && (
                                    <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-1/2 text-2xl text-red-300 lg:block">→</div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-slate-600 via-slate-500 to-slate-600 py-24">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wOCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                <div className="relative mx-auto max-w-7xl px-4">
                    <motion.div
                        className="grid grid-cols-2 gap-12 md:grid-cols-4"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        {[
                            { value: 'Высокая', label: 'Точность детекции' },
                            { value: '< 2 сек', label: 'Время обнаружения' },
                            { value: '24/7', label: 'Непрерывный мониторинг' },
                            { value: '∞', label: 'Неограниченное количество камер' },
                        ].map((stat, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.08 }}
                                className="text-center"
                            >
                                <div className="mb-2 text-5xl font-extrabold tracking-tight text-white drop-shadow-lg md:text-6xl">
                                    {stat.value}
                                </div>
                                <div className="text-base font-medium text-white/90 md:text-lg">
                                    {stat.label}
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* Technology Section */}
            <section className="bg-[#fafafa] py-24">
                <div className="mx-auto max-w-7xl px-4">
                    <motion.div
                        className="mb-16 text-center"
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="text-sm font-semibold uppercase tracking-wider text-slate-600">Стек</span>
                        <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
                            Технологии
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
                            Современные инструменты для максимальной производительности
                        </p>
                    </motion.div>
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {[
                            { name: 'YOLO', description: 'Нейронные сети для детекции объектов', color: 'from-slate-500 to-slate-600', shadow: 'shadow-slate-500/25' },
                            { name: 'React', description: 'Современный фронтенд-фреймворк', color: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-500/25' },
                            { name: 'Django', description: 'Мощный backend на Python', color: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25' },
                            { name: 'TypeScript', description: 'Типобезопасная разработка', color: 'from-blue-400 to-blue-500', shadow: 'shadow-blue-400/25' },
                            { name: 'WebSocket / SSE', description: 'Обновления в реальном времени', color: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25' },
                        ].map((tech, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.08 }}
                                className={`rounded-2xl bg-gradient-to-br ${tech.color} p-6 text-center shadow-xl ${tech.shadow} transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl`}
                            >
                                <div className="text-xl font-bold text-white md:text-2xl">
                                    {tech.name}
                                </div>
                                <div className="mt-2 text-sm text-white/90">
                                    {tech.description}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-slate-600 via-slate-500 to-slate-600 py-24">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_120%,rgba(71,85,105,0.2),transparent)]" />
                <div className="relative mx-auto max-w-3xl px-4 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <h2 className="text-4xl font-bold tracking-tight text-white drop-shadow-lg md:text-5xl">
                            Готовы начать мониторинг?
                        </h2>
                        <p className="mt-5 text-lg text-white/90 md:text-xl">
                            Присоединяйтесь к системе уже сегодня и защитите то, что важно
                        </p>
                        <Link to="/fires" className="mt-10 inline-block">
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.98 }}
                                className="rounded-2xl bg-white px-10 py-4 text-lg font-bold text-slate-700 shadow-2xl shadow-black/20 transition hover:bg-gray-50"
                            >
                                Перейти к мониторингу →
                            </motion.button>
                        </Link>
                        <p className="mt-10 text-white/80">
                            Вопросы?{' '}
                            <a
                                href="https://t.me/qqwince"
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-blue-200 underline decoration-2 underline-offset-2 hover:text-blue-100"
                            >
                                Telegram @qqwince
                            </a>
                        </p>
                    </motion.div>
                </div>
            </section>
        </div>
    )
}

export default Landing
