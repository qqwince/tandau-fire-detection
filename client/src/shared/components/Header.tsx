import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const Header = () => {
    const { user, isAuthenticated, logout } = useAuth()

    return (
        <nav className="flex items-center justify-around py-8 shadow-xl/20">
            <Link
                to="/"
                className="font-semibold text-gray-600 hover:text-gray-500"
            >
                Главная
            </Link>
            <ul className="mx-12 flex gap-8">
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
            
            {isAuthenticated ? (
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-600">
                        Привет, <span className="font-semibold text-red-600">{user?.first_name || user?.username}</span>!
                    </div>
                    <button
                        onClick={logout}
                        className="rounded-lg bg-red-600 px-4 py-2 text-white font-medium transition-all duration-200 hover:bg-red-700 hover:scale-105"
                    >
                        Выйти
                    </button>
                </div>
            ) : (
                <Link 
                    to="/login" 
                    className="rounded-lg bg-red-600 px-4 py-2 text-white font-medium transition-all duration-200 hover:bg-red-700 hover:scale-105"
                >
                    Войти
                </Link>
            )}
        </nav>
    )
}

export default Header
