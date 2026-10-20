import { useEffect, useState } from 'preact/hooks';

export type Theme = 'light' | 'dark' | null;

function stored(): Theme {
  try {
    const v = localStorage.getItem('theme');
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemDark() {
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies the saved theme (or the system one) and exposes a toggle. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
  }, [theme]);

  const isDark = theme ? theme === 'dark' : systemDark();
  const toggle = () => {
    const next: Theme = isDark ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private window: toggle still works for this session */
    }
  };
  return { isDark, toggle };
}
