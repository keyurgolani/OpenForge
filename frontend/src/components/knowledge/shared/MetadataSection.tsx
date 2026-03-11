interface MetadataItem {
    label: string
    value: string | number | null
}

interface MetadataSectionProps {
    items: MetadataItem[]
}

export default function MetadataSection({ items }: MetadataSectionProps) {
    const visibleItems = items.filter((item) => item.value != null)

    if (visibleItems.length === 0) return null

    return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {visibleItems.map((item) => (
                <div key={item.label} className="min-w-0">
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {item.label}
                    </dt>
                    <dd className="mt-0.5 text-sm text-foreground truncate">
                        {item.value}
                    </dd>
                </div>
            ))}
        </div>
    )
}
