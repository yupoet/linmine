/**
 * Pointer input normalisation. Converts raw pointer events into tap / hover
 * callbacks with client coordinates; the app turns those into grid cells via
 * the renderer's `pickCell`.
 *
 * Only the primary pointer is tracked, so a second finger resting on the
 * screen cannot trigger a dig.
 */

export interface InputOptions {
  target: HTMLElement;
  onTap(x: number, y: number): void;
  onHover?(x: number, y: number): void;
  onHoverEnd?(): void;
}

export function attachInput(options: InputOptions): () => void {
  const { target, onTap, onHover, onHoverEnd } = options;
  let activePointer: number | null = null;
  let downX = 0;
  let downY = 0;
  const TAP_SLOP = 24;

  const onPointerDown = (event: PointerEvent): void => {
    if (activePointer !== null) return;
    activePointer = event.pointerId;
    downX = event.clientX;
    downY = event.clientY;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    const dx = event.clientX - downX;
    const dy = event.clientY - downY;
    // A drag/swipe is not a tap.
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) return;
    onTap(event.clientX, event.clientY);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === activePointer) activePointer = null;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!onHover) return;
    if (event.pointerType === 'touch' && activePointer === null) return;
    onHover(event.clientX, event.clientY);
  };

  const onPointerLeave = (): void => {
    onHoverEnd?.();
  };

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerCancel);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerleave', onPointerLeave);

  return () => {
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerCancel);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerleave', onPointerLeave);
  };
}
