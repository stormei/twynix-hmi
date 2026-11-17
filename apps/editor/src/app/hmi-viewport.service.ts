import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { clamp, Rect } from '../../../../packages/editor/src/geometry';
import { canvasToScreen } from '../../../../packages/editor/src/viewport';
import { HmiRuntimeContext } from './hmi-runtime-context.service';

@Injectable()
export class HmiViewportService {
  private readonly context = inject(HmiRuntimeContext);
  readonly displayScreen = this.context.screen;
  private canvas: HTMLElement | null = null;
  element() {
    if (!this.canvas) throw new Error('The HMI viewport is not attached.');
    return this.canvas;
  }
  attach(canvas: HTMLElement) {
    this.canvas = canvas;
  }

  readonly zoom = signal(0.75);
  readonly pan = signal({ x: 0, y: 0 });
  private panDrag?: { x: number; y: number; original: { x: number; y: number } };
  startPan(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.panDrag = { x: event.clientX, y: event.clientY, original: { ...this.pan() } };
  }
  setZoom(delta: number) {
    this.setZoomTo(this.zoom() + delta);
  }
  setZoomTo(value: number, anchor?: { x: number; y: number }) {
    const next = clamp(Math.round(value * 100) / 100, 0.1, 3),
      old = this.zoom();
    const point = anchor ?? { x: 0, y: 0 },
      pan = this.pan();
    this.pan.set({
      x: point.x - ((point.x - pan.x) * next) / old,
      y: point.y - ((point.y - pan.y) * next) / old,
    });
    this.zoom.set(next);
  }
  wheel(event: WheelEvent) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = this.element().getBoundingClientRect();
      this.setZoomTo(this.zoom() * Math.exp(-event.deltaY * 0.005), {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      });
    } else this.pan.update((point) => ({ x: point.x - event.deltaX, y: point.y - event.deltaY }));
  }
  fit(container: HTMLElement) {
    this.zoom.set(
      clamp(
        Math.min(
          1,
          (container.clientWidth - 112) / this.displayScreen().width,
          (container.clientHeight - 96) / this.displayScreen().height,
        ),
        0.1,
        3,
      ),
    );
    this.pan.set({ x: 0, y: 0 });
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.canvas = null;
      this.panDrag = undefined;
    });
  }
  worldPoint(event: { clientX: number; clientY: number }) {
    const rect = this.element().getBoundingClientRect();
    return canvasToScreen(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      { width: rect.width, height: rect.height },
      this.displayScreen(),
      this.zoom(),
      this.pan(),
    );
  }
  movePan(event: PointerEvent) {
    if (!this.panDrag) return false;
    this.pan.set({
      x: this.panDrag.original.x + event.clientX - this.panDrag.x,
      y: this.panDrag.original.y + event.clientY - this.panDrag.y,
    });
    return true;
  }
  endPan() {
    this.panDrag = undefined;
  }
  fitBounds(box: Rect) {
    const area = this.element(),
      zoom = clamp(
        Math.min(
          (area.clientWidth - 120) / Math.max(40, box.width),
          (area.clientHeight - 120) / Math.max(40, box.height),
        ),
        0.1,
        3,
      );
    this.zoom.set(zoom);
    this.pan.set({
      x: (this.displayScreen().width / 2 - box.x - box.width / 2) * zoom,
      y: (this.displayScreen().height / 2 - box.y - box.height / 2) * zoom,
    });
  }
}
