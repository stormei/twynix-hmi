import {
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { Widget } from '@twynix/model';
import {
  rotateWidgetsBy,
  normalizeAngle,
  rotationTrig,
  type SelectionFrame,
} from '../../../../packages/editor/src/rotation';
import { EditorStore } from './editor.store';
@Component({
  selector: 'tx-rotation-handle',
  standalone: true,
  template: `<span
      class="rotation-stem"
      [style.left.px]="handleLeft()"
      [style.height.px]="stemHeight()"
      [style.width.px]="1 / zoom()"
      [style.top.px]="stemTop()"
    ></span>
    <button
      type="button"
      class="rotation-handle"
      [style.left.px]="handleLeft()"
      aria-label="Rotate selection"
      title="Drag to rotate in 5° steps · Escape: cancel"
      [style.width.px]="22 / zoom()"
      [style.font-size.px]="16 / zoom()"
      [style.border-width.px]="1 / zoom()"
      [style.height.px]="22 / zoom()"
      [style.top.px]="handleTop()"
      (pointerdown)="start($event)"
      (lostpointercapture)="cancel()"
      (click)="$event.stopPropagation()"
      (keydown)="key($event)"
    >
      ↻
    </button>
    @if (angle() !== null) {
      <span
        class="rotation-angle"
        [style.left.px]="handleLeft()"
        role="status"
        [style.font-size.px]="11 / zoom()"
        [style.top.px]="labelTop()"
        >{{ angle() }}°{{ limited() ? ' · Screen limit' : '' }}</span
      >
    }`,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .rotation-stem {
        position: absolute;
        left: 50%;
        width: 1px;
        background: #238ac5;
      }
      .rotation-handle {
        position: absolute;
        left: 50%;
        transform: translate(-50%, -50%);
        border: 1px solid #238ac5;
        border-radius: 50%;
        background: white;
        color: #146c9c;
        padding: 0;
        pointer-events: auto;
        touch-action: none;
        cursor: grab;
        font: inherit;
        display: grid;
        place-items: center;
      }
      .rotation-handle:active {
        cursor: grabbing;
        background: #e5f3fb;
      }
      .rotation-handle:focus-visible {
        outline: 2px solid #146c9c;
        outline-offset: 3px;
      }
      .rotation-angle {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        padding: 2px 6px;
        border-radius: 3px;
        background: #164f77;
        color: white;
      }
    `,
  ],
})
export class RotationHandleComponent {
  readonly zoom = input.required<number>();
  readonly bounds = input.required<SelectionFrame>();
  readonly previewed = output<Widget[]>();
  readonly angle = signal<number | null>(null);
  readonly limited = signal(false);
  private readonly store = inject(EditorStore);
  private gesture?: {
    pointerId: number;
    originals: Widget[];
    center: { x: number; y: number };
    start: number;
    latest: Widget[];
    project: ReturnType<EditorStore['project']>;
    element: HTMLElement;
  };
  constructor() {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.gesture) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.finish(false);
      }
    };
    window.addEventListener('keydown', escape, true);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', escape, true);
    });
    effect(() => {
      const project = this.store.project();
      const selection = this.store.selectedIds();
      if (
        this.gesture &&
        (selection.length !== this.gesture.originals.length ||
          this.gesture.originals.some((widget) => !selection.includes(widget.id)))
      )
        this.finish(false);
      if (this.gesture && project !== this.gesture.project) this.finish(false);
    });
  }
  private handlePosition() {
    const frame = this.bounds(),
      { cos, sin } = rotationTrig(frame.rotation),
      inset = 12 / this.zoom();
    const cx = frame.x + frame.width / 2,
      cy = frame.y + frame.height / 2,
      screen = this.store.screen();
    let y = -28 / this.zoom();
    let wx = cx - (y - frame.height / 2) * sin,
      wy = cy + (y - frame.height / 2) * cos;
    if (wx < inset || wy < inset || wx > screen.width - inset || wy > screen.height - inset) {
      y = frame.height + 52 / this.zoom();
      wx = cx - (y - frame.height / 2) * sin;
      wy = cy + (y - frame.height / 2) * cos;
    }
    const dx = Math.max(inset, Math.min(screen.width - inset, wx)) - cx,
      dy = Math.max(inset, Math.min(screen.height - inset, wy)) - cy;
    return { x: frame.width / 2 + dx * cos + dy * sin, y: frame.height / 2 - dx * sin + dy * cos };
  }
  handleTop() {
    return this.handlePosition().y;
  }
  handleLeft() {
    return this.handlePosition().x;
  }
  stemTop() {
    return this.handleTop() < 0
      ? this.handleTop()
      : this.handleTop() > this.bounds().height
        ? this.bounds().height
        : 0;
  }
  stemHeight() {
    return this.handleTop() < 0 ? -this.handleTop() : Math.abs(this.handleTop() - this.stemTop());
  }
  labelTop() {
    return this.handleTop() + (this.handleTop() < 0 ? -30 : 18) / this.zoom();
  }
  start(event: PointerEvent) {
    if (event.button !== 0 || !this.store.canTransform()) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = this.bounds(),
      canvas = (event.currentTarget as HTMLElement).closest('.screen-canvas');
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const center = {
      x: box.left + (bounds.x + bounds.width / 2) * this.zoom(),
      y: box.top + (bounds.y + bounds.height / 2) * this.zoom(),
    };
    const element = event.currentTarget as HTMLElement;
    element.focus({ preventScroll: true });
    element.setPointerCapture(event.pointerId);
    this.gesture = {
      pointerId: event.pointerId,
      originals: structuredClone(this.store.selectedWidgets()),
      center,
      start: Math.atan2(event.clientY - center.y, event.clientX - center.x),
      latest: [],
      project: this.store.project(),
      element,
    };
    this.angle.set(this.bounds().rotation);
    this.limited.set(false);
  }
  @HostListener('window:pointermove', ['$event']) move(event: PointerEvent) {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const current = Math.atan2(event.clientY - gesture.center.y, event.clientX - gesture.center.x);
    let delta = ((current - gesture.start) * 180) / Math.PI;
    const baseline = gesture.originals[0].rotation;
    const angle = normalizeAngle(Math.round((baseline + delta) / 5) * 5);
    delta = angle - baseline;
    try {
      const screen = this.store.screen();
      gesture.latest = rotateWidgetsBy(gesture.originals, delta, {
        x: 0,
        y: 0,
        width: screen.width,
        height: screen.height,
      });
      this.previewed.emit(gesture.latest);
      this.angle.set(angle);
      this.limited.set(false);
    } catch {
      this.limited.set(true);
    }
  }
  @HostListener('window:pointerup', ['$event']) up(event: PointerEvent) {
    if (this.gesture?.pointerId === event.pointerId) this.finish(true);
  }
  @HostListener('window:pointercancel') cancel() {
    this.finish(false);
  }
  @HostListener('window:blur') blur() {
    this.finish(false);
  }
  private finish(commit: boolean) {
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = undefined;
    if (gesture.element.hasPointerCapture(gesture.pointerId))
      gesture.element.releasePointerCapture(gesture.pointerId);
    if (
      commit &&
      gesture.project === this.store.project() &&
      gesture.latest.length &&
      JSON.stringify(gesture.latest) !== JSON.stringify(gesture.originals)
    )
      this.store.replaceWidgets(gesture.latest, true, 'Rotate selection');
    this.previewed.emit([]);
    this.angle.set(null);
    this.limited.set(false);
  }
  key(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const screen = this.store.screen();
    try {
      this.store.replaceWidgets(
        rotateWidgetsBy(this.store.selectedWidgets(), (event.key === 'ArrowLeft' ? -1 : 1) * 5, {
          x: 0,
          y: 0,
          width: screen.width,
          height: screen.height,
        }),
        true,
        'Rotate selection',
      );
    } catch {
      this.limited.set(true);
    }
  }
}
