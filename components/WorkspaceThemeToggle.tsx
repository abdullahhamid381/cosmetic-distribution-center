'use client';

import {useEffect, useState} from 'react';
import {Moon, Sun} from 'lucide-react';

const storageKey = 'hh-medics-workspace-theme';

export function WorkspaceThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const preference = localStorage.getItem(storageKey);
    const useDark = preference === 'dark';
    document.documentElement.dataset.workspaceTheme = useDark ? 'dark' : 'light';
    setDark(useDark);
  }, []);

  function toggle() {
    const useDark = !dark;
    document.documentElement.dataset.workspaceTheme = useDark ? 'dark' : 'light';
    localStorage.setItem(storageKey, useDark ? 'dark' : 'light');
    setDark(useDark);
  }

  return (
    <button className="workspace-theme-toggle" type="button" onClick={toggle}
      aria-label="Dark workspace theme" aria-pressed={dark} title={dark ? 'Use light theme' : 'Use dark theme'}>
      {dark ? <Sun size={17} aria-hidden="true"/> : <Moon size={17} aria-hidden="true"/>}
    </button>
  );
}
