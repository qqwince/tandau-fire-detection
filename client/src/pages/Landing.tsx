import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import natureVideo from '@/assets/natureVideo.mp4'

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
    const completeWord = 'FIREBase'

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

    return (
        <section className="relative flex h-screen w-full items-center justify-center overflow-hidden">
            {/* Фон-видео */}
            <video
                src={natureVideo}
                autoPlay
                loop
                muted
                playsInline
                className="absolute top-0 left-0 h-full w-full object-cover"
            />

            {/* Полупрозрачный оверлей */}
            <div className="absolute inset-0 bg-black/50" />

            {/* Контент */}
            <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 p-6 text-white">
                <motion.h1
                    className="text-center text-6xl font-extrabold tracking-wide md:text-7xl"
                    initial={{ opacity: 0, y: -40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    {word}
                </motion.h1>

                <p className="text-center text-lg leading-relaxed md:text-xl">
                    Мы — инновационная система, использующая искусственный
                    интеллект для раннего распознавания и тушения пожаров. Наши
                    алгоритмы анализируют данные в реальном времени, мгновенно
                    обнаруживают очаги возгораний и автоматически запускают
                    процессы ликвидации, чтобы минимизировать ущерб и сохранить
                    жизни людей, природу и имущество.
                </p>

                {/* Сменяющиеся слова */}
                <AnimatePresence mode="wait">
                    <motion.h2
                        key={phrases[index]}
                        className="text-3xl font-semibold text-yellow-300"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -30 }}
                        transition={{ duration: 0.6 }}
                    >
                        {phrases[index]}
                    </motion.h2>
                </AnimatePresence>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="mt-6 rounded-2xl bg-gradient-to-r from-red-500 to-orange-600 px-10 py-4 text-2xl font-bold shadow-lg shadow-black/40 transition"
                >
                    Начать с нами!
                </motion.button>
            </div>
        </section>
    )
}

export default Landing
