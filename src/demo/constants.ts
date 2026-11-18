// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Small facts about the demo that the payment code also needs. They live in
// their own file so the payment code does not pull in the demo's season data.

/** Bot players have addresses at this domain. It can never receive mail. */
export const BOT_DOMAIN = '@demo.invalid'

/** The most people who can join a demo by its link, the presenter included. Bots do not count. */
export const MAX_DEMO_GUESTS = 30
