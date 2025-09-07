import axios from 'axios'

export const $host = axios.create({
    baseURL: import.meta.env.VITE_API_URL, // подтягивает из .env
})

// Перехватчик запроса: всегда добавляем актуальный токен из localStorage
$host.interceptors.request.use((config) => {
    const tokenFromStorage = localStorage.getItem('access_token')
    if (tokenFromStorage) {
        // Если заголовок ещё не установлен или нужно обновить — ставим из хранилища
        config.headers = config.headers ?? {}
        ;(config.headers as any).Authorization = `Bearer ${tokenFromStorage}`
    }
    return config
})

// Перехватчик для автоматического обновления токенов
$host.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true

            const refreshToken = localStorage.getItem('refresh_token')
            if (refreshToken) {
                try {
                    const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/refresh/`, {
                        refresh: refreshToken
                    })
                    
                    const newAccessToken = response.data.access
                    localStorage.setItem('access_token', newAccessToken)

                    // Обновляем заголовок по умолчанию для всех будущих запросов
                    $host.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`

                    // Повторяем оригинальный запрос с новым токеном
                    originalRequest.headers = originalRequest.headers ?? {}
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
                    return $host(originalRequest)
                } catch (refreshError) {
                    // Если обновление токена не удалось, перенаправляем на страницу входа
                    localStorage.removeItem('access_token')
                    localStorage.removeItem('refresh_token')
                    window.location.href = '/login'
                    return Promise.reject(refreshError)
                }
            }
        }

        return Promise.reject(error)
    }
)

// Устанавливаем токен при инициализации
const token = localStorage.getItem('access_token')
if (token) {
    $host.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

// Делаем $host доступным глобально для AuthContext
;(window as any).$host = $host
