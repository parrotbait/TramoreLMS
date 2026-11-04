// Created by Claude driven by Eddie Long on 2026-11-04.
//
// CSV for the treasurer. Quotes every cell, and stops a spreadsheet treating
// a cell like “=HYPERLINK(…)” as a formula (CSV injection).

const FORMULA_START = /^[=+\-@\t\r]/

export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
    return `${rows.map((row) => {
        return row.map(cell).join(',')
    }).join('\r\n')}\r\n`
}

function cell(value: string | number | null): string {
    if (value === null) {
        return '""'
    }

    const text = typeof value === 'number' ? String(value) : value
    const safe = typeof value === 'string' && FORMULA_START.test(text) ? `'${text}` : text

    return `"${safe.replace(/"/g, '""')}"`
}
