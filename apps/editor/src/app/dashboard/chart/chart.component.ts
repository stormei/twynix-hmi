import { Component, computed } from '@angular/core';
import { defaultDashboardConfig } from '@twynix/model';
import { DashboardWidgetInputs } from '../shared/widget-inputs';

@Component({
  selector: 'tx-chart-widget',
  standalone: true,
  styleUrl: '../shared/card.css',
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><small>{{
        quality()
      }}</small>
    </header>
    <svg
      viewBox="0 0 360 180"
      preserveAspectRatio="none"
      role="img"
      [attr.aria-label]="widget().name + ' recent samples chart'"
    >
      @if (config().showGrid) {
        @for (y of [25, 65, 105, 145]; track y) {
          <line x1="42" x2="344" [attr.y1]="y" [attr.y2]="y" stroke="#e7edf2" />
        }
      }
      <text x="36" y="28" text-anchor="end" fill="#718291" font-size="10">
        {{ axis().max.toFixed(1) }}
      </text>
      <text x="36" y="148" text-anchor="end" fill="#718291" font-size="10">
        {{ axis().min.toFixed(1) }}
      </text>
      @if (usable() && points().length) {
        @if (config().style === 'bar') {
          @for (point of points(); track $index) {
            <rect
              [attr.x]="point.x - barWidth() / 2"
              [attr.y]="point.y"
              [attr.width]="barWidth()"
              [attr.height]="145 - point.y"
              rx="1"
              [attr.fill]="color()"
            />
          }
        } @else {
          @if (config().style === 'area') {
            <path [attr.d]="area()" [attr.fill]="color()" fill-opacity=".12" />
          }
          <polyline
            [attr.points]="line()"
            fill="none"
            [attr.stroke]="color()"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
          @if (points().length === 1) {
            <circle
              [attr.cx]="points()[0].x"
              [attr.cy]="points()[0].y"
              r="3"
              [attr.fill]="color()"
            />
          }
        }
      } @else {
        <text x="195" y="88" text-anchor="middle" fill="#718291" font-size="12">
          Waiting for data
        </text>
      }
      <text x="42" y="167" fill="#718291" font-size="10">Earlier</text>
      <text x="344" y="167" text-anchor="end" fill="#718291" font-size="10">Now</text>
    </svg>
    <footer>Recent samples · {{ unit() || 'value' }}</footer>`,
})
export class ChartWidgetComponent extends DashboardWidgetInputs {
  readonly config = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'chart'
      ? c
      : (defaultDashboardConfig('chart') as Extract<NonNullable<typeof c>, { type: 'chart' }>);
  });
  readonly values = computed(() => this.samples().filter(Number.isFinite).slice(-80));
  readonly axis = computed(() => {
    const c = this.config(),
      values = this.values();
    if (!c.autoScale || !values.length) return { min: c.minimum, max: c.maximum };
    const low = Math.min(...values),
      high = Math.max(...values),
      padding = Math.max((high - low) * 0.1, 1);
    return { min: low - padding, max: high + padding };
  });
  readonly points = computed(() =>
    this.values().map((v, i, a) => ({
      x: 48 + (i / Math.max(1, a.length - 1)) * 290,
      y:
        145 -
        Math.max(0, Math.min(1, (v - this.axis().min) / (this.axis().max - this.axis().min))) * 120,
    })),
  );
  readonly barWidth = computed(() => Math.min(20, 240 / Math.max(1, this.points().length)));
  readonly line = computed(() =>
    this.points()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
  readonly area = computed(
    () =>
      `M48 145 L${this.points()
        .map((p) => `${p.x} ${p.y}`)
        .join(' L')} L${this.points().at(-1)?.x ?? 48} 145 Z`,
  );
}
