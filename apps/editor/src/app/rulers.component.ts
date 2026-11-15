import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  screenOrigin,
  rulerTicks,
  type Size,
  type Point,
} from '../../../../packages/editor/src/viewport';

@Component({
  selector: 'tx-rulers',
  standalone: true,
  template: `<svg
      class="horizontal-ruler"
      role="img"
      aria-label="Horizontal ruler in target screen pixels"
      [attr.viewBox]="'0 0 ' + size().width + ' 18'"
      preserveAspectRatio="none"
      (pointerdown)="$event.stopPropagation()"
    >
      <rect
        [attr.x]="origin().x"
        y="0"
        [attr.width]="screen().width * zoom()"
        height="18"
        class="ruler-screen-span"
      />
      @for (tick of horizontal(); track tick.value) {
        <path [attr.d]="'M' + tick.position + ' ' + (tick.major ? 9 : 14) + ' V18'" />
        <text [attr.x]="tick.position + 3" y="8">{{ tick.major ? tick.value : '' }}</text>
      }
    </svg>
    <svg
      class="vertical-ruler"
      role="img"
      aria-label="Vertical ruler in target screen pixels"
      [attr.viewBox]="'0 0 18 ' + size().height"
      preserveAspectRatio="none"
      (pointerdown)="$event.stopPropagation()"
    >
      <rect
        x="0"
        [attr.y]="origin().y"
        width="18"
        [attr.height]="screen().height * zoom()"
        class="ruler-screen-span"
      />
      @for (tick of vertical(); track tick.value) {
        <path [attr.d]="'M' + (tick.major ? 9 : 14) + ' ' + tick.position + ' H18'" />
        <text
          x="7"
          [attr.y]="tick.position - 3"
          [attr.transform]="'rotate(-90 7 ' + (tick.position - 3) + ')'"
        >
          {{ tick.major ? tick.value : '' }}
        </text>
      }</svg
    ><span class="ruler-corner" aria-hidden="true">px</span>`,
})
export class RulersComponent {
  readonly screen = input.required<Size>();
  readonly zoom = input.required<number>();
  readonly pan = input.required<Point>();
  readonly size = signal<Size>({ width: 0, height: 0 });
  readonly origin = computed(() =>
    screenOrigin(this.size(), this.screen(), this.zoom(), this.pan()),
  );
  readonly horizontal = computed(() =>
    rulerTicks(this.screen().width, this.size().width, this.origin().x, this.zoom()),
  );
  readonly vertical = computed(() =>
    rulerTicks(this.screen().height, this.size().height, this.origin().y, this.zoom()),
  );
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);
  constructor() {
    afterNextRender(() => {
      const update = () =>
        this.size.set({
          width: this.host.nativeElement.clientWidth,
          height: this.host.nativeElement.clientHeight,
        });
      const observer = new ResizeObserver(update);
      observer.observe(this.host.nativeElement);
      update();
      this.destroy.onDestroy(() => observer.disconnect());
    });
  }
}
