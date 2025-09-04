import { $host } from './index.ts'
export const fetchFireSites = async () => {
    console.log('BASE URL:', $host.defaults.baseURL) // должно быть http://127.0.0.1:8000/
    const { data } = await $host.get('/api/fires/')
    return data
}
