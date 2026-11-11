'use client';

import { useEffect, useRef } from 'react';

type Ripple = {
  x: number;
  y: number;
  startedAt: number;
};

const BASE_SPACING = 28;
const ACTIVE_SPACING = 10;
const ACTIVE_RADIUS = 150;
const RIPPLE_DURATION = 700;

export function PointerField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const orbit = orbitRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !orbit || !context) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );
    const root = document.documentElement;
    const pointer = { x: -1_000, y: -1_000 };
    const ripples: Ripple[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;
    let accent = '99,102,241';
    let isLight = false;

    const syncTheme = () => {
      const styles = window.getComputedStyle(root);
      accent = styles.getPropertyValue('--accent-rgb').trim() || accent;
      isLight = root.dataset.theme === 'light';
      draw();
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };

    const draw = (now = performance.now()) => {
      context.clearRect(0, 0, width, height);

      for (let y = 12; y < height; y += BASE_SPACING) {
        for (let x = 12; x < width; x += BASE_SPACING) {
          context.beginPath();
          context.arc(x, y, 0.8, 0, Math.PI * 2);
          context.fillStyle = `rgba(${accent},${isLight ? 0.19 : 0.24})`;
          context.fill();
        }
      }

      if (!reducedMotion.matches && pointer.x >= 0) {
        const left = Math.max(12, pointer.x - ACTIVE_RADIUS);
        const right = Math.min(width, pointer.x + ACTIVE_RADIUS);
        const top = Math.max(12, pointer.y - ACTIVE_RADIUS);
        const bottom = Math.min(height, pointer.y + ACTIVE_RADIUS);

        for (let y = Math.floor(top / ACTIVE_SPACING) * ACTIVE_SPACING; y <= bottom; y += ACTIVE_SPACING) {
          for (let x = Math.floor(left / ACTIVE_SPACING) * ACTIVE_SPACING; x <= right; x += ACTIVE_SPACING) {
            const distance = Math.hypot(x - pointer.x, y - pointer.y);

            if (distance > ACTIVE_RADIUS) continue;

            const strength = 1 - distance / ACTIVE_RADIUS;
            context.beginPath();
            context.arc(x, y, 0.8 + strength * 1.7, 0, Math.PI * 2);
            context.fillStyle = `rgba(${accent},${0.12 + strength * 0.48})`;
            context.fill();
          }
        }
      }

      if (!reducedMotion.matches) {
        for (let index = ripples.length - 1; index >= 0; index -= 1) {
          const ripple = ripples[index];
          const progress = (now - ripple.startedAt) / RIPPLE_DURATION;

          if (progress >= 1) {
            ripples.splice(index, 1);
            continue;
          }

          context.beginPath();
          context.arc(ripple.x, ripple.y, 12 + progress * 150, 0, Math.PI * 2);
          context.strokeStyle = `rgba(${accent},${(1 - progress) * 0.48})`;
          context.lineWidth = Math.max(0.5, 1.8 * (1 - progress));
          context.stroke();
        }
      } else {
        ripples.length = 0;
      }
    };

    const scheduleDraw = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        draw();

        if (ripples.length > 0) {
          frame = window.requestAnimationFrame(animateRipples);
        }
      });
    };

    const animateRipples = (now: number) => {
      frame = 0;
      draw(now);

      if (ripples.length > 0) {
        frame = window.requestAnimationFrame(animateRipples);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      orbit.style.setProperty('--pointer-x', `${event.clientX}px`);
      orbit.style.setProperty('--pointer-y', `${event.clientY}px`);
      orbit.style.opacity = '1';
      scheduleDraw();
    };

    const onPointerLeave = () => {
      pointer.x = -1_000;
      pointer.y = -1_000;
      orbit.style.opacity = '0';
      scheduleDraw();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (reducedMotion.matches || event.button !== 0) return;
      ripples.push({
        x: event.clientX,
        y: event.clientY,
        startedAt: performance.now(),
      });
      ripples.splice(0, Math.max(0, ripples.length - 4));
      scheduleDraw();
    };

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-color'] });
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('pointerleave', onPointerLeave);
    reducedMotion.addEventListener('change', scheduleDraw);
    resize();
    syncTheme();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('pointerleave', onPointerLeave);
      reducedMotion.removeEventListener('change', scheduleDraw);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-field"
        aria-hidden="true"
      />
      <div
        ref={orbitRef}
        className="pointer-orbit"
        aria-hidden="true"
      />
    </>
  );
}
