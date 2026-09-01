import { useEffect, useState } from 'react';

export function useHeaderMenu() {
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  useEffect(() => {
    if (!headerMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (!target?.closest('.headerMenu')) setHeaderMenuOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setHeaderMenuOpen(false);
    }
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [headerMenuOpen]);
  return { headerMenuOpen, setHeaderMenuOpen };
}
