import { useState } from 'react'

const Login = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLogin, setIsLogin] = useState(true)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        console.log('Email:', email, 'Password:', password)
    }

    return (
        <div className="flex items-center justify-center">
            <div className="mt-[100px] flex h-[400px] w-[20vw] flex-col justify-center rounded-2xl border-2 p-8 shadow-lg">
                <h2 className="mb-8 text-center text-3xl font-bold">
                    {isLogin ? 'Вход' : 'Регистрация'}
                </h2>
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <div className="flex flex-col">
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            required
                        />
                        <span className="text-[#ff6d6d]">Error message!</span>
                    </div>
                    <div className="flex flex-col">
                        <input
                            type="password"
                            placeholder="Пароль"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            required
                        />
                        <span className="text-[#ff6d6d]">Error message!</span>
                    </div>
                    {isLogin ? (
                        <button
                            type="submit"
                            className="rounded-lg bg-blue-600 py-2 text-white transition hover:bg-blue-700"
                        >
                            Войти
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="rounded-lg bg-blue-600 py-2 text-white transition hover:bg-blue-700"
                        >
                            Зарегистрироваться
                        </button>
                    )}
                </form>
                {isLogin ? (
                    <p className="mt-6 text-center text-gray-500">
                        Нет аккаунта?{' '}
                        <a
                            onClick={(prev) => setIsLogin(false)}
                            className="text-blue-600 hover:underline"
                        >
                            Зарегистрироваться
                        </a>
                    </p>
                ) : (
                    <p className="mt-6 text-center text-gray-500">
                        Есть аккаунт?{' '}
                        <a
                            onClick={(prev) => setIsLogin(true)}
                            className="text-blue-600 hover:underline"
                        >
                            Войти
                        </a>
                    </p>
                )}
            </div>
        </div>
    )
}

export default Login
