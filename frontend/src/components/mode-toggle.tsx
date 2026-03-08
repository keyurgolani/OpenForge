import { Moon, Sun, Settings } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ModeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()

  // Make sure we only render after mounting on the client
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="w-16 h-8 rounded-full bg-muted/50 border border-border/50"></div>
  }

  const isDark = resolvedTheme === "dark"

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("system")
    } else if (theme === "system") {
      setTheme("dark")
    } else {
      setTheme("light")
    }
  }

  // A tri-state toggle for Light / Dark / System could be built here,
  // but a simple slider that defaults to system when needed works too.
  // We'll build a gear-box styled toggle switch: 
  // It has a track and a thumb that slides.

  return (
    <button
      onClick={toggleTheme}
      className={`relative inline-flex h-8 w-[4.4rem] items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 border shadow-inner overflow-hidden ${
        theme === 'system'
          ? "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700"
          : isDark 
            ? "bg-slate-900 border-slate-800" 
            : "bg-sky-100 border-sky-200"
      }`}
      aria-label="Toggle theme mode"
    >
      <span className="sr-only">Toggle theme (Current: {theme})</span>
      
      {/* Track Background Elements (Stars / Clouds / Gears) */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Dark mode stars */}
        <div className={`absolute inset-0 transition-opacity duration-300 ${isDark && theme !== 'system' ? 'opacity-100' : 'opacity-0'}`}>
           <span className="absolute top-[8px] left-[10px] w-[1.5px] h-[1.5px] bg-white rounded-full"></span>
           <span className="absolute top-[18px] left-[20px] w-[1px] h-[1px] bg-white rounded-full"></span>
           <span className="absolute top-[12px] left-[32px] w-[2px] h-[2px] bg-indigo-200 rounded-full shadow-[0_0_2px_#fff]"></span>
        </div>
        
        {/* System mode gears */}
        <div className={`absolute inset-0 flex items-center justify-around px-2 transition-opacity duration-300 ${theme === 'system' ? 'opacity-100' : 'opacity-0'}`}>
           <Settings className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 animate-[spin_4s_linear_infinite]" />
           <Settings className="w-4 h-4 text-slate-300 dark:text-slate-600 animate-[spin_3s_linear_infinite_reverse]" />
        </div>
      </div>

      {/* The slider thumb */}
      <span
        className={`z-10 flex h-[1.35rem] w-[1.35rem] items-center justify-center rounded-full shadow-md transition-transform duration-300 ease-in-out border ${
          theme === 'system'
            ? "translate-x-[1.45rem] bg-white border-slate-200 dark:bg-slate-700 dark:border-slate-500"
            : isDark 
              ? "translate-x-[2.75rem] bg-indigo-100 border-indigo-200 shadow-[inset_-1px_-1px_3px_rgba(0,0,0,0.2)]" 
              : "translate-x-1 bg-white border-yellow-200 shadow-[inset_-1px_-1px_3px_rgba(0,0,0,0.05)]"
        }`}
      >
        {theme === 'system' ? (
           <Settings className="h-3 w-3 text-slate-600 dark:text-slate-300" />
        ) : isDark ? (
           <Moon className="h-3 w-3 text-indigo-600" />
        ) : (
           <Sun className="h-3 w-3 text-amber-500" />
        )}
      </span>
    </button>
  )
}
