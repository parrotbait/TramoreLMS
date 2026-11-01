// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The real feeds, for the cron endpoint and the tick script.

import { fetchFootballData } from '@/feeds/football-data'
import { fetchFpl } from '@/feeds/fpl'

import type { FeedSource } from './tick'

export function liveFeeds(footballDataToken: string): FeedSource {
    return {
        primary: (season) => {
            return fetchFootballData(footballDataToken, season)
        },
        secondary: async (teamNames) => {
            return (await fetchFpl(teamNames)).matches
        },
    }
}
