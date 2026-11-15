import { Component, input } from '@angular/core';
import type { Widget } from '@twynix/model';

/** Original flat process symbols. Port faces match the industrial SVG geometry. */
@Component({
  selector: 'g[twynixSchematic]',
  standalone: true,
  template: `<svg:g [attr.stroke]="ink()" stroke-width="2" fill="none">
    @switch (widget().kind) {
      @case ('tank') {
        <path
          d="M28 51 H152 V179 Q90 201 28 179 Z M11 165 H28 M152 165 H169 M48 193 V211 M132 193 V211"
        />
        <rect
          x="30"
          [attr.y]="190 - level() * 1.36"
          width="120"
          [attr.height]="level() * 1.36"
          [attr.fill]="ink()"
          stroke="none"
          opacity=".15"
        />
        <path [attr.d]="'M30 ' + (190 - level() * 1.36) + ' H150'" />
        <text x="90" y="19" text-anchor="middle" class="equipment-tag" stroke="none">
          {{ text() }}
        </text>
        <text x="90" y="126" text-anchor="middle" class="equipment-reading" stroke="none">
          {{ display() }}
          <tspan font-size="12">%</tspan>
        </text>
        <text x="90" y="147" text-anchor="middle" class="equipment-status" stroke="none">
          {{ quality() }}
        </text>
        <text x="90" y="232" text-anchor="middle" class="equipment-caption" stroke="none">
          {{ widget().name }}
        </text>
      }
      @case ('pump') {
        <path d="M2 63 H44 M99 41 H150 M52 87 L45 98 H99 L92 87" />
        <circle cx="72" cy="61" r="28" [attr.fill]="surface()" />
        <path d="M61 44 L88 61 L61 78 Z" [attr.fill]="active() ? ink() : surface()" />
        <text x="80" y="113" text-anchor="middle" class="equipment-tag" stroke="none">
          {{ text() }}
        </text>
        <text x="128" y="20" text-anchor="middle" class="flat-state" stroke="none">
          {{ state() }}
        </text>
      }
      @case ('valve') {
        <path
          d="M2 52 H36 M124 52 H158 M36 31 L80 52 L36 73 Z M124 31 L80 52 L124 73 Z M80 52 V18 M60 18 Q80 -2 100 18 Z"
          [attr.fill]="active() ? surface() : '#c9d0d5'"
        />
        <text x="80" y="94" text-anchor="middle" class="equipment-tag" stroke="none">
          {{ text() }}
        </text>
        <text x="132" y="21" text-anchor="middle" class="flat-state" stroke="none">
          {{ state() === 'N/A' ? 'N/A' : display() + '%' }}
        </text>
      }
      @case ('motor') {
        <circle cx="80" cy="56" r="31" [attr.fill]="surface()" />
        <path d="M111 56 H151 M57 78 L46 96 H114 L103 78" />
        <text x="80" y="65" class="flat-letter" text-anchor="middle" stroke="none">M</text>
        <text x="80" y="119" class="equipment-tag" text-anchor="middle" stroke="none">
          {{ text() }}
        </text>
      }
      @case ('fan') {
        <circle cx="80" cy="56" r="31" [attr.fill]="surface()" />
        <path
          d="M80 56 Q53 24 80 30 Q112 29 80 56 Q112 86 80 82 Q48 82 80 56 M57 78 L46 96 H114 L103 78"
        />
        <text x="80" y="119" class="equipment-tag" text-anchor="middle" stroke="none">
          {{ text() }}
        </text>
      }
      @case ('pipe') {
        <path d="M8 50 H232 M113 44 L121 50 L113 56" />
        <text x="120" y="91" class="equipment-tag" text-anchor="middle" stroke="none">
          {{ text() }}
        </text>
      }
      @case ('elbow') {
        <g [attr.transform]="'rotate(' + widget().pipeRotation + ' 60 60)'">
          <path d="M8 60 H36 Q60 60 60 36 V8" />
        </g>
      }
      @case ('tee') {
        <g [attr.transform]="'rotate(' + widget().pipeRotation + ' 60 60)'">
          <path d="M8 60 H112 M60 60 V8" />
          <circle cx="60" cy="60" r="3" [attr.fill]="ink()" stroke="none" />
        </g>
      }
      @case ('connector') {
        <g [attr.transform]="'rotate(' + widget().pipeRotation + ' 60 60)'">
          <path d="M8 60 H112 M53 49 V71 M67 49 V71" />
        </g>
      }
      @case ('conveyor') {
        <rect x="13" y="43" width="214" height="31" rx="15" [attr.fill]="surface()" />
        <path d="M48 74 V91 M192 74 V91 M95 27 H145 M139 21 L145 27 L139 33" />
        @for (x of [30, 60, 90, 120, 150, 180, 210]; track x) {
          <circle [attr.cx]="x" cy="59" r="6" />
        }
        <text x="120" y="111" class="equipment-tag" text-anchor="middle" stroke="none">
          {{ text() }}
        </text>
      }
      @case ('sensor') {
        <circle cx="80" cy="55" r="31" [attr.fill]="surface()" />
        <text x="80" y="63" class="flat-letter" text-anchor="middle" stroke="none">S</text>
        <path d="M80 86 V101" />
        <text x="80" y="122" class="equipment-tag" text-anchor="middle" stroke="none">
          {{ text() }}
        </text>
      }
    }
  </svg:g>`,
})
export class SchematicComponent {
  readonly widget = input.required<Widget>();
  readonly ink = input('#43525e');
  readonly surface = input('#ffffff');
  readonly text = input('');
  readonly display = input('—');
  readonly level = input(0);
  readonly active = input(false);
  readonly state = input('N/A');
  readonly quality = input('UNKNOWN');
}
