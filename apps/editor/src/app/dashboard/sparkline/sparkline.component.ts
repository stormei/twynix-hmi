import { Component, computed } from '@angular/core';
import { DashboardWidgetInputs } from '../shared/widget-inputs';
@Component({
  selector: 'tx-sparkline-widget',
  standalone: true,
  styleUrl: '../shared/card.css',
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><small>{{
        quality()
      }}</small>
    </header>
    <svg
      viewBox="0 0 300 70"
      preserveAspectRatio="none"
      role="img"
      [attr.aria-label]="widget().name + ' sparkline'"
    >
      @if (usable() && points().length) {
        @if (fill()) {
          <path [attr.d]="area()" [attr.fill]="color()" fill-opacity=".12" />
        }
        <polyline
          [attr.points]="line()"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
        <circle
          [attr.cx]="points().at(-1)!.x"
          [attr.cy]="points().at(-1)!.y"
          r="2.5"
          [attr.fill]="color()"
        />
      } @else {
        <text x="150" y="38" text-anchor="middle" fill="#718291" font-size="11">
          Waiting for data
        </text>
      }
    </svg>
    @if (showValue()) {
      <footer>{{ usable() ? numeric().toFixed(1) : '—' }} {{ unit() }} · Recent samples</footer>
    }`,
})
export class SparklineWidgetComponent extends DashboardWidgetInputs {
  readonly numeric = computed(() => Number(this.value()));
  readonly showValue = computed(() => {
    const c = this.widget().dashboard;
    return c?.type !== 'sparkline' || c.showValue;
  });
  readonly fill = computed(() => {
    const c = this.widget().dashboard;
    return c?.type !== 'sparkline' || c.fill;
  });
  readonly points = computed(() => {
    const samples = this.samples().filter(Number.isFinite).slice(-80);
    const min = Math.min(...samples),
      max = Math.max(...samples),
      span = Math.max(1, max - min);
    return samples.map((value, index) => ({
      x: 10 + (index / Math.max(1, samples.length - 1)) * 280,
      y: 56 - ((value - min) / span) * 42,
    }));
  });
  readonly line = computed(() =>
    this.points()
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
  );
  readonly area = computed(
    () =>
      `M10 65 L${this.points()
        .map((point) => `${point.x} ${point.y}`)
        .join(' L')} L${this.points().at(-1)?.x ?? 10} 65 Z`,
  );
}
