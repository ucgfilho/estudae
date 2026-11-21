import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from './Button';

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');

  function toggle() {
    const theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1e3a8a' : '#101D3A');
    try { localStorage.setItem('estudae-theme', theme); } catch { /* Disponível nesta sessão. */ }
    setDark(!dark);
  }

  return <IconButton label="Modo escuro" aria-pressed={dark} onClick={toggle}
    icon={dark ? <Sun className="size-4" /> : <Moon className="size-4" />} />;
}
