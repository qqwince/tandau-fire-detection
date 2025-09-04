import { Link } from 'react-router-dom'
const Header = () => {
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
                        to="/firesites"
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
            {/*<a className="text-red-500  hover:text-red-400">*/}
            {/*    Выйти*/}
            {/*</a>*/}
            <Link to="/login" className="hover:text-gray-500">
                Войти
            </Link>
        </nav>
    )
}

export default Header
