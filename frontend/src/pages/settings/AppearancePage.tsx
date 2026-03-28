import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLOR_SCHEMES, type ColorSchemeId } from '@/lib/color-schemes';
import { useColorScheme } from '@/components/color-scheme-provider';

const MODE_OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
] as const;

export function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const { scheme, setScheme } = useColorScheme();

  return (
    <div className="p-6 space-y-8">
      {/* Mode Section */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-1">Mode</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Choose light, dark, or match your system preference.
        </p>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {MODE_OPTIONS.map((mode) => {
            const Icon = mode.icon;
            const active = theme === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setTheme(mode.id)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors',
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border/25 bg-card hover:border-border hover:bg-muted/30 text-muted-foreground'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{mode.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Color Scheme Section */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-1">Color Scheme</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Choose a visual theme for the entire application.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {COLOR_SCHEMES.map((s) => {
            const active = scheme === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScheme(s.id as ColorSchemeId)}
                className={cn(
                  'relative rounded-xl border-2 overflow-hidden text-left transition-all',
                  active
                    ? 'border-accent ring-1 ring-accent/30'
                    : 'border-border/25 hover:border-border'
                )}
              >
                {/* Gradient header */}
                <div
                  className="h-10"
                  style={{
                    background: `linear-gradient(135deg, hsl(${s.primaryHsl}), hsl(${s.secondaryHsl}))`,
                  }}
                />

                {/* Swatch previews */}
                <div className="p-3 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </div>
                    {active && (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-accent-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Light / Dark swatches */}
                  <div className="flex gap-2">
                    <div className="flex gap-1">
                      <div
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ background: `hsl(${s.primaryHsl})` }}
                        title="Primary (light)"
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ background: `hsl(${s.secondaryHsl})` }}
                        title="Secondary (light)"
                      />
                    </div>
                    <div className="w-px bg-border/60" />
                    <div className="flex gap-1">
                      <div
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ background: `hsl(${s.primaryDarkHsl})` }}
                        title="Primary (dark)"
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ background: `hsl(${s.secondaryDarkHsl})` }}
                        title="Secondary (dark)"
                      />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default AppearancePage;
