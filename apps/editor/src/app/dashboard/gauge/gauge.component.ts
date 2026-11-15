import { Component, computed } from '@angular/core';
import { defaultDashboardConfig, type DashboardConfig } from '@twynix/model';
import { DashboardWidgetInputs } from '../shared/widget-inputs';
@Component({
  selector: 'tx-gauge-widget',
  standalone: true,
  styleUrl: '../shared/card.css',
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><small>{{
        quality()
      }}</small>
    </header>
    <svg viewBox="0 0 300 190" role="img" [attr.aria-label]="widget().name + ' gauge'">
      <path
        d="M45 145 A105 105 0 0 1 255 145"
        fill="none"
        stroke="#e7edf2"
        stroke-width="18"
        stroke-linecap="round"
      />
      <path
        d="M45 145 A105 105 0 0 1 255 145"
        fill="none"
        [attr.stroke]="ink()"
        stroke-width="18"
        stroke-linecap="round"
        pathLength="100"
        [attr.stroke-dasharray]="percent() + ' 100'"
      />
      <text x="150" y="128" text-anchor="middle" font-size="32" fill="#19374c">
        {{ usable() ? numeric().toFixed(1) : '—' }}
      </text>
      <text x="150" y="150" text-anchor="middle" font-size="12" fill="#718291">
        {{ unit() || config().unit }}
      </text>
      <text x="40" y="177" text-anchor="middle" font-size="11" fill="#718291">
        {{ config().minimum }}
      </text>
      <text x="260" y="177" text-anchor="middle" font-size="11" fill="#718291">
        {{ config().maximum }}
      </text>
    </svg>
    <footer>
      {{
        !usable()
          ? 'No current value'
          : numeric() >= config().critical
            ? 'Critical range'
            : numeric() >= config().warning
              ? 'Warning range'
              : 'Normal range'
      }}
    </footer>`,
})
export class GaugeWidgetComponent extends DashboardWidgetInputs {
  readonly config = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'gauge'
      ? c
      : (defaultDashboardConfig('gauge') as Extract<DashboardConfig, { type: 'gauge' }>);
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
    !this.usable()
      ? '#a8b5bf'
      : this.numeric() >= this.config().critical
        ? '#c64444'
        : this.numeric() >= this.config().warning
          ? '#bf861d'
          : this.color(),
  );
}
