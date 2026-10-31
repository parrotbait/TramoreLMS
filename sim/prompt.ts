// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Asks questions on the terminal. Reads through readline's async iterator,
// which buffers lines, so answers piped in from a file are not dropped.

import { createInterface } from 'node:readline'
import type { Interface } from 'node:readline'

export class LinePrompt {
    private readonly readline: Interface
    private readonly lines: AsyncIterator<string>

    constructor() {
        this.readline = createInterface({ input: process.stdin, terminal: process.stdin.isTTY })
        this.lines = this.readline[Symbol.asyncIterator]()
    }

    async question(text: string): Promise<string> {
        process.stdout.write(text)
        const next = await this.lines.next()
        if (next.done === true) {
            throw new Error('Input ended before the season finished.')
        }

        if (!process.stdin.isTTY) {
            process.stdout.write(`${next.value}\n`)
        }

        return next.value
    }

    close() {
        this.readline.close()
    }
}
