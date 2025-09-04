import { $authHost, $host } from './index'

export const fetchGames = async (page, limit) => {
    const { data } = await $host.get('api/games', {
        params: {
            page,
            limit,
        },
    })
    return data
}
