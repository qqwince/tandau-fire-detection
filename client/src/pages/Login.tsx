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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')

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
            if (err.response?.data) {
                if (typeof err.response.data === 'string') {
                    setError(err.response.data)
                } else if (err.response.data.detail) {
                    setError(err.response.data.detail)
                } else if (err.response.data.non_field_errors) {
                    setError(err.response.data.non_field_errors[0])
                } else {
                    setError('Произошла ошибка при аутентификации')
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

                    <form onSubmit={handleSubmit} className="space-y-6">
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
                                minLength={8}
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
                                    minLength={8}
                                />
                            </div>
                        )}

                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                                <p className="text-sm text-red-600">{error}</p>
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
