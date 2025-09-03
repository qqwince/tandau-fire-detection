import fireIcon from "@/assets/fireIcon.svg"
const Header = () => {
  return (
    <nav className="flex justify-around mt-6 items-center">
      <img src={fireIcon} alt="Иконка" className="h-12 hover:cursor-pointer" />
      <ul className="flex mx-12 gap-8">
        <li><a className="hover:cursor-pointer text-gray-600 font-semibold">Главная</a></li>
        <li><a className="hover:cursor-pointer text-gray-600 font-semibold">О нас</a></li>
        <li><a className="hover:cursor-pointer text-gray-600 font-semibold">Контакты</a></li>
        <li><a className="hover:cursor-pointer text-gray-600 font-semibold">Список пожаров</a></li>
      </ul>
      <h3 className="hover:cursor-pointer">Выйти</h3>
    </nav>
  );
};

export default Header;