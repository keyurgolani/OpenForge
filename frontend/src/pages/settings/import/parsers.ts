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

    // Resolve the item list from various Karakeep export shapes:
    //   - root-level array
    //   - { bookmarks: [...] }
    //   - { items: [...] }
    //   - { data: [...] }             (Karakeep v2 flat)
    //   - { data: { bookmarks: [...] } }
    //   - { data: { items: [...] } }
    let items: unknown[]
    if (Array.isArray(data)) {
        items = data
    } else if (Array.isArray(data.bookmarks)) {
        items = data.bookmarks
    } else if (Array.isArray(data.items)) {
        items = data.items
    } else if (Array.isArray(data.data)) {
        items = data.data
    } else if (data.data && typeof data.data === 'object') {
        items = Array.isArray(data.data.bookmarks)
            ? data.data.bookmarks
            : Array.isArray(data.data.items)
                ? data.data.items
                : []
    } else {
        items = []
    }

    // Extract the URL from several possible locations within each item
    const extractUrl = (item: any): string | undefined => {
        if (typeof item.url === 'string' && item.url) return item.url
        if (typeof item.link === 'string' && item.link) return item.link
        if (item.content && typeof item.content === 'object') {
            if (typeof item.content.url === 'string' && item.content.url) return item.content.url
            if (typeof item.content.link === 'string' && item.content.link) return item.content.link
        }
        return undefined
    }

    // Extract tags handling both string arrays and object arrays (e.g. {name: "tag"})
    const extractTags = (item: any): string[] => {
        const rawTags = item.tags ?? item.labels ?? item.content?.tags
        if (!Array.isArray(rawTags)) return []
        return rawTags.map((t: any) => (typeof t === 'string' ? t : t?.name ?? String(t)))
    }

    // Coerce a raw created_at value (may be number, string, or Date) to ISO string
    const normalizeDate = (val: unknown): string | undefined => {
        if (val == null) return undefined
        if (typeof val === 'string' && val) return val
        if (typeof val === 'number' && val > 0) {
            const ms = val > 1e12 ? val : val * 1000
            try { return new Date(ms).toISOString() } catch { return undefined }
        }
        return String(val) || undefined
    }

    // Coerce to string or undefined
    const toStr = (val: unknown): string | undefined => {
        if (val == null) return undefined
        const s = String(val)
        return s || undefined
    }

    return items
        .filter((item: any) => item && typeof item === 'object' && extractUrl(item))
        .map((item: any) => {
            const url = extractUrl(item)!
            return {
                url,
                title: String(item.title ?? item.name ?? item.content?.title ?? url),
                tags: extractTags(item),
                description: toStr(item.description ?? item.summary ?? item.content?.description),
                created_at: normalizeDate(item.created_at ?? item.createdAt ?? item.date ?? item.content?.created_at),
                note: toStr(item.note ?? item.notes ?? item.content?.note),
            }
        })
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
