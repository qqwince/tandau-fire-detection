# Feature-Sliced Design (FSD)

Фронтенд клиента структурирован по методологии [Feature-Sliced Design](https://feature-sliced.design/).

## Слои (сверху вниз)

- **app** — инициализация приложения: роутер, провайдеры, глобальные стили.
- **pages** — страницы приложения (landing, login, fire-list).
- **widgets** — самостоятельные блоки интерфейса (например, Header).
- **features** — сценарии и действия пользователя: auth (вход/регистрация), fires (подтверждение, скрытие, экспорт).
- **entities** — доменные сущности: user, fire, session (типы и API).
- **shared** — переиспользуемый код: API-клиент (axios), конфиг.

## Правила импортов

- Импорты только **вниз** по слоям: `pages` → `widgets` → `features` → `entities` → `shared`.
- Внутри одного слоя слайсы не импортируют друг друга.
- Публичный API слайса — через `index.ts`.

## Структура каталогов

```
src/
├── app/                 # Точка входа, роутер, стили
├── pages/               # Страницы (landing, login, fire-list)
│   └── <slice>/ui/      # UI страницы
├── widgets/             # Виджеты (header)
│   └── header/ui/
├── features/            # Фичи (auth, fires)
│   ├── auth/            # api, model (AuthContext)
│   └── fires/           # api (действия), ui (FireCard)
├── entities/            # Сущности (user, fire, session)
│   └── <slice>/model/   # типы
│   └── <slice>/api/     # запросы к API
└── shared/             # API base (axios), конфиг
    └── api/
```

Алиас `@/` указывает на `src/` (настроен в `tsconfig.app.json` и `vite.config.ts`).
