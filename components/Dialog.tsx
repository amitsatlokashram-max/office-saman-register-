'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  className: string;
  labelledBy?: string;
  label?: string;
  /** Bahar (dhundhle hisse) pe click karne se band ho */
  backdropClose?: boolean;
  /** Andar kahin bhi click karne se band ho (photo dekhne wala) */
  clickClose?: boolean;
  children: ReactNode;
};

/** Browser ka asli <dialog>: Esc se band hota hai aur keyboard focus andar rehta hai. Band hone par andar ka sab hat jata hai. */
export function Dialog({ open, onClose, className, labelledBy, label, backdropClose, clickClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={labelledBy}
      aria-label={label}
      onClose={() => {
        if (openRef.current) onClose();
      }}
      onClick={(e) => {
        if (clickClose) {
          onClose();
          return;
        }
        if (!backdropClose || e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
