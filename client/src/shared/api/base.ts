import axios from 'axios'

export const $host = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
})

$host.interceptors.request.use((config) => {
    const tokenFromStorage = localStorage.getItem('access_token')
    if (tokenFromStorage) {
        config.headers = config.headers ?? {}
        ;(config.headers as Record<string, string>).Authorization = `Bearer ${tokenFromStorage}`
    }
    return config
})

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
                        refresh: refreshToken,
                    })

                    const newAccessToken = response.data.access
                    localStorage.setItem('access_token', newAccessToken)

                    $host.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`

                    originalRequest.headers = originalRequest.headers ?? {}
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
                    return $host(originalRequest)
                } catch {
                    localStorage.removeItem('access_token')
                    localStorage.removeItem('refresh_token')
                    window.location.href = '/login'
                    return Promise.reject(error)
                }
            }
        }

        return Promise.reject(error)
    }
)

const token = localStorage.getItem('access_token')
if (token) {
    $host.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

;(window as unknown as { $host: typeof $host }).$host = $host
