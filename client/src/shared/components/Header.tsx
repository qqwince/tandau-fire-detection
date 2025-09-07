import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const Header = () => {
    const { user, isAuthenticated, logout } = useAuth()

    return (
        <nav className="py-8 shadow-xl/20">
            <div className="relative mx-auto flex w-full max-w-7xl items-center px-4 md:px-6 lg:px-8">
            {/* Left: Logo/Home */}
            <div className="flex min-w-[140px] flex-1 items-center">
                <Link
                    to="/"
                    className="font-semibold text-gray-600 hover:text-gray-500"
                >
                    Главная
                </Link>
            </div>

            {/* Center: Nav links (always centered) */}
            <ul className="pointer-events-auto absolute left-1/2 z-10 flex -translate-x-1/2 transform gap-8">
                <li>
                    <a
                        href="mailto:qqwincest@gmail.com"
                        className="font-semibold text-gray-600 hover:text-gray-500"
                    >
                        Контакты
                    </a>
                </li>
                <li>
                    <Link
                        to="/fires"
                        className="font-semibold text-gray-600 hover:text-gray-500"
                    >
                        Список пожаров
                    </Link>
                </li>
                <li>
                    <Link
                        to="/"
                        className="font-semibold text-gray-600 hover:text-gray-500"
                    >
                        О нас
                    </Link>
                </li>
            </ul>

            {/* Right: Auth controls */}
            <div className="flex min-w-[240px] flex-1 items-center justify-end">
                {isAuthenticated ? (
                    <div className="flex items-center gap-2">
                        <div className="text-sm text-gray-600">
                            Привет,{' '}
                            <span className="font-semibold text-red-600">
                                {user?.first_name || user?.username}
                            </span>
                            !
                        </div>
                        <button
                            onClick={logout}
                            className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-red-700"
                        >
                            Выйти
                        </button>
                    </div>
                ) : (
                    <Link
                        to="/login"
                        className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-red-700"
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
