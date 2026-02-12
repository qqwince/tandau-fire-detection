import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

const Login = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [isLogin, setIsLogin] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    const { login, register } = useAuth()
    const navigate = useNavigate()

    const validateForm = () => {
        // базовая проверка email
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailPattern.test(email)) {
            setError('Некорректный формат email')
            return false
        }

        // общая проверка пароля
        if (password.length < 8) {
            setError('Пароль должен содержать минимум 8 символов')
            return false
        }
        if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            setError('Пароль должен содержать буквы и хотя бы одну цифру')
            return false
        }

        if (!isLogin) {
            if (password !== confirmPassword) {
                setError('Пароли не совпадают')
                return false
            }
        }

        return true
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        // Клиентская валидация до запроса на сервер
        if (!validateForm()) {
            return
        }

        setIsLoading(true)

        try {
            if (isLogin) {
                await login({ username: email, password })
            } else {
                if (password !== confirmPassword) {
                    setError('Пароли не совпадают')
                    setIsLoading(false)
                    return
                }
                await register({
                    username: email,
                    email,
                    password,
                    password_confirm: confirmPassword,
                    first_name: firstName,
                    last_name: lastName,
                })
            }
            navigate('/fires')
        } catch (err: any) {
            const data = err.response?.data
            if (data) {
                if (typeof data === 'string') {
                    setError(data)
                } else if (data.detail) {
                    setError(data.detail)
                } else {
                    const messages: string[] = []
                    const collect = (field: string, label?: string) => {
                        if (data[field]) {
                            const raw = Array.isArray(data[field])
                                ? data[field][0]
                                : data[field]
                            messages.push(label ? `${label}: ${raw}` : String(raw))
                        }
                    }
                    collect('email', 'Email')
                    collect('username', 'Логин')
                    collect('password', 'Пароль')
                    collect('password_confirm', 'Подтверждение пароля')
                    if (data.non_field_errors) {
                        collect('non_field_errors')
                    }
                    setError(
                        messages.length
                            ? messages.join('\n')
                            : 'Произошла ошибка при аутентификации'
                    )
                }
            } else {
                setError('Произошла ошибка при аутентификации')
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="mt-[150px] flex items-center justify-center bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50">
            <div className="w-full max-w-md">
                <div className="rounded-2xl border-2 border-gray-200 bg-white p-8 shadow-lg">
                    <div className="mb-8 text-center">
                        <h2 className="mb-2 bg-clip-text text-3xl font-bold">
                            🔥 {isLogin ? 'Вход' : 'Регистрация'}
                        </h2>
                        <p className="text-gray-600">
                            {isLogin
                                ? 'Добро пожаловать обратно!'
                                : 'Создайте новый аккаунт'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} noValidate className="space-y-6">
                        {!isLogin && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <input
                                            type="text"
                                            placeholder="Имя"
                                            value={firstName}
                                            onChange={(e) =>
                                                setFirstName(e.target.value)
                                            }
                                            className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <input
                                            type="text"
                                            placeholder="Фамилия"
                                            value={lastName}
                                            onChange={(e) =>
                                                setLastName(e.target.value)
                                            }
                                            className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div>
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none"
                                required
                            />
                        </div>

                        <div>
                            <input
                                type="password"
                                placeholder="Пароль"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none"
                                required
                            />
                        </div>

                        {!isLogin && (
                            <div>
                                <input
                                    type="password"
                                    placeholder="Подтвердите пароль"
                                    value={confirmPassword}
                                    onChange={(e) =>
                                        setConfirmPassword(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-all duration-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none"
                                    required
                                />
                            </div>
                        )}

                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                                <p className="whitespace-pre-line text-sm text-red-600">
                                    {error}
                                </p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full rounded-lg bg-gradient-to-r from-red-600 to-orange-600 py-2 font-medium text-white transition-all duration-200 hover:scale-105 hover:from-red-700 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center">
                                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                    {isLogin ? 'Вход...' : 'Регистрация...'}
                                </div>
                            ) : isLogin ? (
                                'Войти'
                            ) : (
                                'Зарегистрироваться'
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-gray-500">
                            {isLogin ? 'Нет аккаунта?' : 'Есть аккаунт?'}{' '}
                            <button
                                onClick={() => {
                                    setIsLogin(!isLogin)
                                    setError('')
                                }}
                                className="font-medium text-red-600 transition-colors duration-200 hover:underline"
                            >
                                {isLogin ? 'Зарегистрироваться' : 'Войти'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Login
