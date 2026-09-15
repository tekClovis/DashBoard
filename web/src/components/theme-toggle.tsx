import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { applyTheme, getInitialTheme, type Theme } from '@/lib/theme.js';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggle}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
