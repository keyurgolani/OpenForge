import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { type ColorSchemeId, VALID_SCHEME_IDS, DEFAULT_SCHEME } from '@/lib/color-schemes';

const STORAGE_KEY = 'color-scheme';

interface ColorSchemeContextValue {
  scheme: ColorSchemeId;
  setScheme: (id: ColorSchemeId) => void;
}

const ColorSchemeContext = createContext<ColorSchemeContextValue | undefined>(undefined);

function getStoredScheme(): ColorSchemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && VALID_SCHEME_IDS.includes(stored)) {
    return stored as ColorSchemeId;
  }
  if (stored) {
    localStorage.removeItem(STORAGE_KEY);
  }
  return DEFAULT_SCHEME;
}

function applyScheme(id: ColorSchemeId) {
  if (id === DEFAULT_SCHEME) {
    delete document.documentElement.dataset.scheme;
  } else {
    document.documentElement.dataset.scheme = id;
  }
}

export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorSchemeId>(getStoredScheme);

  useEffect(() => {
    applyScheme(scheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once on mount
  }, []);

  const setScheme = useCallback((id: ColorSchemeId) => {
    if (!VALID_SCHEME_IDS.includes(id)) return;
    setSchemeState(id);
    applyScheme(id);
    if (id === DEFAULT_SCHEME) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  return (
    <ColorSchemeContext.Provider value={{ scheme, setScheme }}>
      {children}
    </ColorSchemeContext.Provider>
  );
}

export function useColorScheme() {
  const ctx = useContext(ColorSchemeContext);
  if (!ctx) throw new Error('useColorScheme must be used within ColorSchemeProvider');
  return ctx;
}
