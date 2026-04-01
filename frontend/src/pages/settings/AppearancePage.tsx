import { cn } from '@/lib/utils';
import { COLOR_SCHEMES, type ColorSchemeId } from '@/lib/color-schemes';
import { useColorScheme } from '@/components/color-scheme-provider';

// ─── Mini UI mockup preview (single mode) ─────────────────────────────────

interface ModePreviewProps {
  label: string;
  primary: string;
  secondary: string;
  isDark: boolean;
}

function ModePreview({ label, primary, secondary, isDark }: ModePreviewProps) {
  const pageBg = isDark ? '#1a1a2e' : '#f8f9fa';
  const cardBg = isDark ? '#16213e' : '#ffffff';
  const sidebarBg = isDark ? '#12112a' : '#f1f3f5';
  const titleBarBg = isDark ? '#0f0e24' : '#e9ecef';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const textPrimary = isDark ? '#e8e8f0' : '#1a1a2e';
  const textMuted = isDark ? 'rgba(200,200,220,0.5)' : 'rgba(30,30,60,0.4)';
  const dotColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)';

  return (
    <div className="flex-1 min-w-0 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground text-center">{label}</p>
      <div
        className="rounded-xl overflow-hidden shadow-md select-none border"
        style={{ background: pageBg, borderColor }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-b"
          style={{ background: titleBarBg, borderColor }}
        >
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-400/70" />
            <div className="w-2 h-2 rounded-full bg-yellow-400/70" />
            <div className="w-2 h-2 rounded-full bg-green-400/70" />
          </div>
          <span className="text-[10px] font-semibold ml-1" style={{ color: textMuted }}>
            OpenForge
          </span>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex h-40">
          {/* Mock sidebar */}
          <div
            className="w-24 flex-shrink-0 border-r p-1.5 space-y-0.5"
            style={{ background: sidebarBg, borderColor }}
          >
            {['Dashboard', 'Automations', 'Agents', 'Settings'].map((item, i) => (
              <div
                key={item}
                className="flex items-center gap-1.5 px-1.5 py-1 rounded-md"
                style={
                  i === 0
                    ? { background: primary + '28', color: primary }
                    : undefined
                }
              >
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: i === 0 ? primary : dotColor,
                  }}
                />
                <span
                  className="text-[9px] font-medium truncate"
                  style={{ color: i === 0 ? primary : textMuted }}
                >
                  {item}
                </span>
              </div>
            ))}
          </div>

          {/* Mock content */}
          <div className="flex-1 min-w-0 p-2.5 space-y-2">
            {/* Heading bar */}
            <div
              className="h-4 rounded w-2/3"
              style={{
                background: primary + '30',
                borderLeft: `2.5px solid ${primary}`,
              }}
            />

            {/* Two cards */}
            <div className="flex gap-1.5">
              {[0, 1].map((card) => (
                <div
                  key={card}
                  className="flex-1 rounded-lg p-1.5 space-y-1 border"
                  style={{ background: cardBg, borderColor }}
                >
                  <div
                    className="h-1.5 rounded w-3/4"
                    style={{ background: textMuted }}
                  />
                  <div
                    className="h-1 rounded w-full"
                    style={{ background: textMuted, opacity: 0.5 }}
                  />
                  <div
                    className="h-1 rounded w-5/6"
                    style={{ background: textMuted, opacity: 0.5 }}
                  />
                </div>
              ))}
            </div>

            {/* Buttons row */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <div
                className="h-4 px-2 rounded-md flex items-center"
                style={{ background: primary }}
              >
                <span className="text-[8px] font-semibold" style={{ color: '#fff' }}>
                  Primary
                </span>
              </div>
              <div
                className="h-4 px-2 rounded-md flex items-center"
                style={{ background: secondary }}
              >
                <span className="text-[8px] font-semibold" style={{ color: '#fff' }}>
                  Secondary
                </span>
              </div>
              <div
                className="h-4 px-2 rounded-md flex items-center border"
                style={{ borderColor, color: textPrimary }}
              >
                <span className="text-[8px] font-medium">Default</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Right panel preview ───────────────────────────────────────────────────

function SchemePreview({ schemeId }: { schemeId: ColorSchemeId }) {
  const schemeData = COLOR_SCHEMES.find((s) => s.id === schemeId);
  if (!schemeData) return null;

  const lightPrimary = `hsl(${schemeData.primaryHsl})`;
  const lightSecondary = `hsl(${schemeData.secondaryHsl})`;
  const darkPrimary = `hsl(${schemeData.primaryDarkHsl})`;
  const darkSecondary = `hsl(${schemeData.secondaryDarkHsl})`;

  return (
    <div className="space-y-4">
      {/* Scheme name and description */}
      <div>
        <h2 className="text-base font-semibold text-foreground">{schemeData.name}</h2>
        <p className="text-sm text-muted-foreground">{schemeData.description}</p>
      </div>

      {/* Side-by-side mode previews */}
      <div className="flex gap-4">
        <ModePreview
          label="Light"
          primary={lightPrimary}
          secondary={lightSecondary}
          isDark={false}
        />
        <ModePreview
          label="Dark"
          primary={darkPrimary}
          secondary={darkSecondary}
          isDark={true}
        />
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export function AppearancePage() {
  const { scheme, setScheme } = useColorScheme();

  return (
    <div className="flex h-full">
      {/* Left sidebar — color schemes only */}
      <div className="w-56 flex-shrink-0 border-r border-border/25 overflow-y-auto p-4">
        <div className="space-y-0.5">
          {COLOR_SCHEMES.map((s) => {
            const active = scheme === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScheme(s.id as ColorSchemeId)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0 border border-white/10"
                  style={{
                    background: `linear-gradient(135deg, hsl(${s.primaryDarkHsl}), hsl(${s.secondaryDarkHsl}))`,
                  }}
                />
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        <SchemePreview schemeId={scheme} />
      </div>
    </div>
  );
}

export default AppearancePage;
