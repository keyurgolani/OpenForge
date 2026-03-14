/* ── Types ──────────────────────────────────────────────────────────────── */

export interface ParsedBookmark {
    url: string
    title: string
    tags: string[]
    description?: string
    created_at?: string
    note?: string
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function unixToISO(ts: string | null | undefined): string | undefined {
    if (!ts) return undefined
    const n = Number(ts)
    if (Number.isNaN(n) || n <= 0) return undefined
    // Chrome uses seconds; handle both seconds and milliseconds
    const ms = n > 1e12 ? n : n * 1000
    try {
        return new Date(ms).toISOString()
    } catch {
        return undefined
    }
}

function parseCSVLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"'
                    i++
                } else {
                    inQuotes = false
                }
            } else {
                current += ch
            }
        } else {
            if (ch === '"') {
                inQuotes = true
            } else if (ch === ',') {
                fields.push(current.trim())
                current = ''
            } else {
                current += ch
            }
        }
    }
    fields.push(current.trim())
    return fields
}

/* ── Parsers ────────────────────────────────────────────────────────────── */

export function parseChromeHTML(html: string): ParsedBookmark[] {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const bookmarks: ParsedBookmark[] = []

    const anchors = doc.querySelectorAll('DT > A, dt > a')
    anchors.forEach(a => {
        const href = a.getAttribute('HREF') ?? a.getAttribute('href') ?? ''
        if (!href || (!href.startsWith('http://') && !href.startsWith('https://'))) return

        const title = (a.textContent ?? '').trim() || href

        // Walk up the DOM to collect folder names as tags
        const tags: string[] = []
        let el: Element | null = a.parentElement
        while (el) {
            if (el.tagName === 'DL' || el.tagName === 'dl') {
                const prev = el.previousElementSibling
                if (prev && (prev.tagName === 'H3' || prev.tagName === 'h3')) {
                    const folderName = (prev.textContent ?? '').trim()
                    if (folderName && folderName !== 'Bookmarks Bar' && folderName !== 'Bookmarks bar' && folderName !== 'Other bookmarks' && folderName !== 'Bookmarks') {
                        tags.push(folderName)
                    }
                }
            }
            el = el.parentElement
        }

        bookmarks.push({
            url: href,
            title,
            tags: tags.reverse(),
            created_at: unixToISO(a.getAttribute('ADD_DATE') ?? a.getAttribute('add_date')),
        })
    })

    return bookmarks
}

export function parseKarakeepJSON(raw: string): ParsedBookmark[] {
    const data = JSON.parse(raw)
    const items: unknown[] = Array.isArray(data) ? data : (data.bookmarks ?? data.items ?? [])

    return items
        .filter((item: any) => item && typeof item === 'object' && item.url)
        .map((item: any) => ({
            url: String(item.url),
            title: String(item.title ?? item.name ?? item.url),
            tags: Array.isArray(item.tags)
                ? item.tags.map((t: any) => (typeof t === 'string' ? t : t?.name ?? String(t)))
                : [],
            description: item.description ? String(item.description) : undefined,
            created_at: item.created_at ?? item.createdAt ?? item.date ?? undefined,
            note: item.note ?? item.notes ?? undefined,
        }))
}

export function parseRaindropCSV(csv: string): ParsedBookmark[] {
    const lines = csv.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []

    const headerFields = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''))

    const colIdx = (names: string[]) => {
        for (const name of names) {
            const idx = headerFields.indexOf(name)
            if (idx >= 0) return idx
        }
        return -1
    }

    const urlCol = colIdx(['url', 'link'])
    const titleCol = colIdx(['title', 'name'])
    const folderCol = colIdx(['folder', 'collection'])
    const tagsCol = colIdx(['tags', 'tag'])
    const createdCol = colIdx(['created', 'created_at', 'date'])
    const noteCol = colIdx(['note', 'notes', 'description', 'excerpt'])

    if (urlCol < 0) return []

    const bookmarks: ParsedBookmark[] = []
    for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i])
        const url = fields[urlCol] ?? ''
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) continue

        const tags: string[] = []
        if (folderCol >= 0 && fields[folderCol]) {
            tags.push(fields[folderCol])
        }
        if (tagsCol >= 0 && fields[tagsCol]) {
            fields[tagsCol].split(',').forEach(t => {
                const trimmed = t.trim()
                if (trimmed) tags.push(trimmed)
            })
        }

        bookmarks.push({
            url,
            title: (titleCol >= 0 ? fields[titleCol] : '') || url,
            tags,
            description: noteCol >= 0 ? fields[noteCol] || undefined : undefined,
            created_at: createdCol >= 0 ? fields[createdCol] || undefined : undefined,
        })
    }

    return bookmarks
}

export function parsePocketHTML(html: string): ParsedBookmark[] {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const bookmarks: ParsedBookmark[] = []

    const anchors = doc.querySelectorAll('a, A')
    anchors.forEach(a => {
        const href = a.getAttribute('href') ?? a.getAttribute('HREF') ?? ''
        if (!href || (!href.startsWith('http://') && !href.startsWith('https://'))) return

        const title = (a.textContent ?? '').trim() || href

        const rawTags = a.getAttribute('tags') ?? a.getAttribute('TAGS') ?? ''
        const tags = rawTags
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)

        bookmarks.push({
            url: href,
            title,
            tags,
            created_at: unixToISO(a.getAttribute('time_added') ?? a.getAttribute('TIME_ADDED')),
        })
    })

    return bookmarks
}
