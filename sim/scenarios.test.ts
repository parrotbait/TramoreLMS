// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Runs every scenario file as a regression test. Add a YAML file to
// sim/scenarios/ and it is picked up here automatically.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parseScenario, runScenario } from './scenario'

const scenariosDirectory = fileURLToPath(new URL('./scenarios', import.meta.url))
const files = readdirSync(scenariosDirectory)
    .filter((file) => {
        return file.endsWith('.yaml')
    })
    .sort()

describe('Scenario files', () => {
    it('finds the scenario files', () => {
        expect(files.length).toBeGreaterThan(0)
    })

    for (const file of files) {
        it(file, async () => {
            const scenario = parseScenario(readFileSync(join(scenariosDirectory, file), 'utf8'), file)
            const run = await runScenario(scenario)

            expect(run.failures, run.report).toEqual([])
        })
    }
})
