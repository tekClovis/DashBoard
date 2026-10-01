import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { useTheme } from '@/lib/theme.js';

export function ThemeToggle() {
  const [theme, toggle] = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun strokeWidth={1.75} /> : <Moon strokeWidth={1.75} />}
    </Button>
  );
}
