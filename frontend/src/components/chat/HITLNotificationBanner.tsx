interface HITLNotificationBannerProps {
  toolName: string
  onView: () => void
}

export function HITLNotificationBanner({ toolName, onView }: HITLNotificationBannerProps) {
  return (
    <div className="absolute bottom-[80px] left-8 right-8 z-10 flex items-center gap-3 px-4 py-2.5 bg-card border border-warning/30 border-l-4 border-l-warning/60 rounded-md shadow-lg animate-slide-up">
      <span className="text-xs text-muted-foreground">Approval needed: <span className="font-mono text-accent/85">{toolName}</span></span>
      <button onClick={onView} className="btn-ghost text-xs ml-auto">View</button>
    </div>
  )
}
