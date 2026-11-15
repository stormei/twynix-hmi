import { Component, computed } from '@angular/core';
import { defaultDashboardConfig, type DashboardConfig } from '@twynix/model';
import { DashboardWidgetInputs } from '../shared/widget-inputs';
@Component({
  selector: 'tx-linear-gauge-widget',
  standalone: true,
  styleUrl: '../shared/card.css',
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><small>{{
        quality()
      }}</small>
    </header>
    <svg viewBox="0 0 300 90" role="img" [attr.aria-label]="widget().name + ' linear gauge'">
      <text x="14" y="26" fill="#19374c" font-size="22">
        {{ usable() ? numeric().toFixed(1) : '—' }}
        <tspan font-size="12">{{ unit() || config().unit }}</tspan>
      </text>
      <rect x="14" y="39" width="272" height="15" rx="3" fill="#e7edf2" />
      <rect x="14" y="39" [attr.width]="percent() * 2.72" height="15" rx="3" [attr.fill]="ink()" />
      <path
        [attr.d]="
          'M' + marker(config().warning) + ' 35v23 M' + marker(config().critical) + ' 35v23'
        "
        stroke="#6c7e8c"
        stroke-width="1"
      />
      <text x="14" y="75" font-size="10" fill="#718291">{{ config().minimum }}</text>
      <text x="286" y="75" text-anchor="end" font-size="10" fill="#718291">
        {{ config().maximum }}
      </text>
    </svg>`,
})
export class LinearGaugeWidgetComponent extends DashboardWidgetInputs {
  readonly config = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'linear-gauge'
      ? c
      : (defaultDashboardConfig('linear-gauge') as Extract<
          DashboardConfig,
          { type: 'linear-gauge' }
        >);
  });
  readonly numeric = computed(() => Number(this.value()));
  readonly percent = computed(() =>
    this.usable()
      ? Math.max(
          0,
          Math.min(
            100,
            ((this.numeric() - this.config().minimum) /
              (this.config().maximum - this.config().minimum)) *
              100,
          ),
        )
      : 0,
  );
  readonly ink = computed(() =>
    this.numeric() >= this.config().critical
      ? '#c64444'
      : this.numeric() >= this.config().warning
        ? '#bf861d'
        : this.color(),
  );
  marker(value: number) {
    return (
      14 + ((value - this.config().minimum) / (this.config().maximum - this.config().minimum)) * 272
    );
  }
}
