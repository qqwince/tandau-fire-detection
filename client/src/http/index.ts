import axios from 'axios'

export const $host = axios.create({
    baseURL: import.meta.env.VITE_API_URL, // подтягивает из .env
})
