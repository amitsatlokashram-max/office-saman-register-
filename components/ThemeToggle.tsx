'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const syncMode = () => setIsLight(root.dataset.theme === 'light');
    const observer = new MutationObserver(syncMode);

    syncMode();
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  function toggleMode() {
    const nextMode =
      document.documentElement.dataset.theme === 'light'
        ? 'dark'
        : 'light';

    document.documentElement.dataset.theme = nextMode;
    window.localStorage.setItem('office-theme-mode', nextMode);
    setIsLight(nextMode === 'light');
  }

  return (
    <button
      type="button"
      className={'theme-toggle ' + className}
      onClick={toggleMode}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
    >
      <Icon name={isLight ? 'moon' : 'sun'} />
    </button>
  );
}
