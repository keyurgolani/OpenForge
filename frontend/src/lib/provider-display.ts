const LOCAL_SUFFIX_PATTERN = /\s*\(local\)\s*$/i

export function sanitizeProviderDisplayName(name: string | null | undefined): string {
    if (!name) return ''
    return name.replace(LOCAL_SUFFIX_PATTERN, '').trim()
}

export function isLocalProvider(providerName: string | null | undefined): boolean {
    return (providerName ?? '').trim().toLowerCase() === 'ollama'
}
