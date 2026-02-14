import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const Header = () => {
    const { user, isAuthenticated, logout } = useAuth()

    return (
        <nav className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/80 py-4 backdrop-blur-xl md:py-5">
            <div className="relative mx-auto flex w-full max-w-7xl items-center px-4 md:px-6 lg:px-8">
                <div className="flex min-w-[140px] flex-1 items-center">
                    <Link
                        to="/"
                        className="flex items-center gap-2 font-semibold text-gray-700 transition-colors hover:text-red-600"
                    >

                        <span className="hidden sm:inline">Главная</span>
                    </Link>
                </div>

                <ul className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 transform gap-6 md:gap-10">
                    <li>
                        <a
                            href="mailto:qqwincest@gmail.com"
                            className="relative font-medium text-gray-600 transition-colors hover:text-red-600 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-red-500 after:transition-all after:content-[''] hover:after:w-full"
                        >
                            Контакты
                        </a>
                    </li>
                    <li>
                        <Link
                            to="/fires"
                            className="relative font-medium text-gray-600 transition-colors hover:text-red-600 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-red-500 after:transition-all after:content-[''] hover:after:w-full"
                        >
                            Список пожаров
                        </Link>
                    </li>
                </ul>

                <div className="flex min-w-[200px] flex-1 items-center justify-end gap-3">
                    {isAuthenticated ? (
                        <>
                            <span className="hidden text-sm text-gray-600 sm:inline">
                                Привет, <span className="font-semibold text-gray-900">{user?.first_name || user?.username}</span>
                            </span>
                            <button
                                onClick={logout}
                                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                            >
                                Выйти
                            </button>
                        </>
                    ) : (
                        <Link
                            to="/login"
                            className="rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:from-red-600 hover:to-red-700 hover:shadow-red-500/40"
                        >
                            Войти
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    )
}

export default Header
