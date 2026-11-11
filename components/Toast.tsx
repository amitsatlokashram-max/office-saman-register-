'use client';

import { useCallback, useEffect, useRef } from 'react';

/** A brief status message that stays above open dialogs. */
export function useToast() {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (el && typeof el.showPopover !== 'function') el.hidden = true;
    return () => window.clearTimeout(timer.current);
  }, []);

  const show = useCallback((msg: string) => {
    const el = ref.current;
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('toast-success', msg.startsWith('✓'));
    const canPop = typeof el.showPopover === 'function';
    if (canPop) {
      try {
        if (el.matches(':popover-open')) el.hidePopover();
        el.showPopover();
      } catch {
        /* ignore */
      }
    } else el.hidden = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (canPop) {
        try {
          el.hidePopover();
        } catch {
          /* ignore */
        }
      } else el.hidden = true;
    }, 3400);
  }, []);

  const node = <div className="toast" ref={ref} popover="manual" role="status" aria-live="polite" id="toast" />;
  return { show, node };
}
