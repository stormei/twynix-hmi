import { Component, computed, input } from '@angular/core';
import type { Widget, SymbolStyle } from '@twynix/model';
import { SchematicComponent } from './schematic.component';
import { displayAccent, operatingRange } from '../../../../packages/editor/src/display-style';
import { equipmentState } from '../../../../packages/editor/src/symbol-state';

// Every rendered instance (including palette and drag previews) owns its SVG definitions.
let nextSymbolId = 0;
@Component({
  selector: 'svg[twynixSymbol]',
  standalone: true,
  imports: [SchematicComponent],
  host: {
    '[attr.viewBox]': 'viewBox()',
    preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true',
  },
  template: `<svg:defs>
      <linearGradient [attr.id]="metalId" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#cbd5da" />
        <stop offset=".24" stop-color="#f8fafb" />
        <stop offset=".62" stop-color="#e8eef1" />
        <stop offset="1" stop-color="#b7c4cb" />
      </linearGradient>
      <linearGradient [attr.id]="capId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" stop-color="#dce4e9" />
      </linearGradient>
      <clipPath [attr.id]="vesselId">
        <path d="M28 51 Q90 34 152 51 V179 Q90 201 28 179 Z" />
      </clipPath>
    </svg:defs>
    <svg:g stroke-linejoin="round" stroke-linecap="round">
      @if (flatEquipment()) {
        <svg:g
          twynixSchematic
          [widget]="widget()"
          [ink]="stateColor()"
          [surface]="visualStyle() === 'high-performance' ? '#e8ecef' : '#ffffff'"
          [text]="effectiveText()"
          [display]="processState().usable ? display() : '—'"
          [level]="level()"
          [active]="processState().active"
          [state]="operatingState()"
          [quality]="qualityLabel()"
        />
      } @else {
        @switch (widget().kind) {
          @case ('tank') {
            <text x="90" y="17" text-anchor="middle" class="equipment-tag">
              {{ effectiveText() }}
            </text>
            <path
              d="M47 189 V211 H59 V193 M121 193 V211 H133 V189"
              fill="#b9c6ce"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path
              d="M11 159 H28 V171 H11 Z M152 159 H169 V171 H152 Z"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path d="M11 155 V175 M169 155 V175" stroke="#718492" stroke-width="3" />
            <path
              d="M28 51 Q90 34 152 51 V179 Q90 201 28 179 Z"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <g [attr.clip-path]="vesselClip">
              <rect
                x="28"
                [attr.y]="190 - level() * 1.36"
                width="124"
                [attr.height]="level() * 1.36"
                [attr.fill]="stateColor()"
                opacity=".3"
              />
              @if (valid() && level() > 0) {
                <ellipse
                  cx="90"
                  [attr.cy]="190 - level() * 1.36"
                  rx="62"
                  ry="9"
                  [attr.fill]="stateColor()"
                  opacity=".22"
                />
                <path
                  [attr.d]="
                    'M28 ' +
                    (190 - level() * 1.36) +
                    ' Q90 ' +
                    (208 - level() * 1.36) +
                    ' 152 ' +
                    (190 - level() * 1.36)
                  "
                  [attr.stroke]="stateColor()"
                  fill="none"
                  stroke-width="1.5"
                />
              }
              <path d="M41 58 V178" stroke="white" stroke-width="4" opacity=".65" />
            </g>
            <ellipse
              cx="90"
              cy="51"
              rx="62"
              ry="13"
              [attr.fill]="capFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path
              d="M76 38 V31 H104 V38"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path d="M28 179 Q90 201 152 179" fill="none" stroke="#718492" stroke-width="1.5" />
            <path
              d="M157 66 H163 M157 88 H163 M157 110 H163 M157 132 H163 M157 154 H163"
              stroke="#8b9ba6"
              stroke-width="1"
            />
            <rect x="49" y="103" width="82" height="48" rx="4" fill="#ffffff" opacity=".88" />
            <text x="90" y="126" text-anchor="middle" class="equipment-reading">
              {{ display() }}
              <tspan font-size="11">{{ valid() ? ' %' : '' }}</tspan>
            </text>
            <text x="90" y="141" text-anchor="middle" class="equipment-status">
              {{ qualityLabel() }}
            </text>
            <text x="90" y="232" text-anchor="middle" class="equipment-caption">
              {{ widget().name }}
            </text>
          }
          @case ('pump') {
            <path
              d="M2 57 H38 V69 H2 M98 35 H150 V47 H98"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path d="M10 53 V73 M143 31 V51" stroke="#718492" stroke-width="3" />
            <path
              d="M49 86 L43 97 H100 L94 84"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <rect x="36" y="97" width="71" height="5" rx="1" fill="#9aaab5" />
            <path
              d="M103 38 V65 C103 89 75 100 54 86 C35 73 36 48 52 36 C67 24 91 28 103 38 Z"
              [attr.fill]="metalFill"
              stroke="#647987"
              stroke-width="1.8"
            />
            <circle cx="72" cy="61" r="25" fill="#f8fafb" stroke="#91a2ad" stroke-width="1.5" />
            <circle cx="72" cy="61" r="21" [attr.fill]="stateColor()" opacity=".12" />
            <path d="M62 46 L85 61 L62 76 Z" [attr.fill]="stateColor()" />
            <circle cx="72" cy="61" r="3" fill="white" />
            <circle cx="48" cy="43" r="2" fill="#718492" />
            <circle cx="97" cy="77" r="2" fill="#718492" />
            <rect x="99" y="9" width="53" height="15" rx="3" fill="#f3f6f8" stroke="#d4dde3" />
            <circle cx="106" cy="16.5" r="2.5" [attr.fill]="stateColor()" />
            <text x="127" y="19.5" text-anchor="middle" class="equipment-state">
              {{ operatingState() }}
            </text>
            <path
              d="M119 59 H133 M129 55 L133 59 L129 63"
              stroke="#8b9ba6"
              stroke-width="1.5"
              fill="none"
            />
            <text x="80" y="119" text-anchor="middle" class="equipment-tag">
              {{ effectiveText() }}
            </text>
          }
          @case ('valve') {
            <path
              d="M2 46 H36 V58 H2 M124 46 H158 V58 H124"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path d="M14 41 V63 M146 41 V63" stroke="#718492" stroke-width="3" />
            <path d="M80 30 V52" stroke="#718492" stroke-width="5" />
            <rect
              x="59"
              y="8"
              width="42"
              height="23"
              rx="3"
              [attr.fill]="capFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <rect
              x="65"
              y="14"
              width="30"
              height="11"
              rx="2"
              [attr.fill]="stateColor()"
              opacity=".2"
            />
            <path d="M74 19.5 H86" [attr.stroke]="stateColor()" stroke-width="2.5" />
            <path
              d="M36 31 L80 52 L36 73 Z M124 31 L80 52 L124 73 Z"
              [attr.fill]="metalFill"
              stroke="#647987"
              stroke-width="1.8"
            />
            <path
              d="M43 42 L65 52 L43 62 Z M117 42 L95 52 L117 62 Z"
              [attr.fill]="stateColor()"
              opacity=".7"
            />
            <circle
              cx="80"
              cy="52"
              r="4"
              [attr.fill]="stateColor()"
              stroke="#f8fafb"
              stroke-width="1.5"
            />
            <text x="80" y="94" text-anchor="middle" class="equipment-tag">
              {{ effectiveText() }}
            </text>
          }
          @case ('elbow') {
            <g [attr.transform]="'rotate(' + widget().pipeRotation + ' 60 60)'">
              <path d="M8 60 H36 Q60 60 60 36 V8" fill="none" stroke="#718492" stroke-width="23" />
              <path d="M8 60 H36 Q60 60 60 36 V8" fill="none" stroke="#e1e8ed" stroke-width="20" />
              <path
                d="M8 56 H36 Q56 56 56 36 V8"
                fill="none"
                stroke="white"
                stroke-width="3"
                opacity=".65"
              />
              <path
                d="M8 60 H36 Q60 60 60 36 V8"
                fill="none"
                [attr.stroke]="stateColor()"
                stroke-width="3"
                opacity=".5"
              />
              <path d="M13 45 V75 M45 13 H75" stroke="#718492" stroke-width="4" />
            </g>
          }
          @case ('tee') {
            <g [attr.transform]="'rotate(' + widget().pipeRotation + ' 60 60)'">
              <path d="M8 60 H112 M60 60 V8" fill="none" stroke="#718492" stroke-width="23" />
              <path d="M8 60 H112 M60 60 V8" fill="none" stroke="#e1e8ed" stroke-width="20" />
              <path
                d="M8 56 H56 V8 M64 56 H112"
                fill="none"
                stroke="white"
                stroke-width="3"
                opacity=".65"
              />
              <path
                d="M8 60 H112 M60 60 V8"
                fill="none"
                [attr.stroke]="stateColor()"
                stroke-width="3"
                opacity=".5"
              />
              <path d="M13 45 V75 M107 45 V75 M45 13 H75" stroke="#718492" stroke-width="4" />
            </g>
          }
          @case ('connector') {
            <g [attr.transform]="'rotate(' + widget().pipeRotation + ' 60 60)'">
              <path
                d="M8 50 H112 V70 H8Z"
                [attr.fill]="metalFill"
                stroke="#718492"
                stroke-width="1.5"
              />
              <rect
                x="42"
                y="44"
                width="36"
                height="32"
                rx="3"
                [attr.fill]="metalFill"
                stroke="#647987"
                stroke-width="1.5"
              />
              <path d="M49 46 V74 M71 46 V74" stroke="#8d9fab" stroke-width="2" />
              <path d="M8 60 H112" [attr.stroke]="stateColor()" stroke-width="3" opacity=".5" />
            </g>
          }
          @case ('motor') {
            <path
              d="M41 77 L35 91 H123 L117 77"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <rect x="32" y="91" width="94" height="5" rx="1" fill="#9aaab5" />
            <rect
              x="112"
              y="45"
              width="39"
              height="13"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <rect
              x="32"
              y="28"
              width="87"
              height="53"
              rx="9"
              [attr.fill]="metalFill"
              stroke="#647987"
              stroke-width="1.8"
            />
            <ellipse
              cx="35"
              cy="54.5"
              rx="12"
              ry="26.5"
              [attr.fill]="capFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path
              d="M54 35 V74 M63 35 V74 M72 35 V74 M81 35 V74 M90 35 V74 M99 35 V74"
              stroke="#8d9fab"
              stroke-width="1.5"
            />
            <rect
              x="66"
              y="17"
              width="28"
              height="16"
              rx="2"
              [attr.fill]="capFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path d="M74 22 H86" [attr.stroke]="stateColor()" stroke-width="3" />
            <text x="80" y="113" text-anchor="middle" class="equipment-tag">
              {{ effectiveText() }}
            </text>
          }
          @case ('fan') {
            <path
              d="M43 88 L36 98 H124 L117 88"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <rect x="34" y="98" width="92" height="4" rx="1" fill="#9aaab5" />
            <rect
              x="38"
              y="19"
              width="84"
              height="74"
              rx="8"
              [attr.fill]="metalFill"
              stroke="#647987"
              stroke-width="1.8"
            />
            <circle cx="80" cy="56" r="32" fill="#f7f9fa" stroke="#8d9fab" stroke-width="1.5" />
            <circle cx="80" cy="56" r="27" [attr.fill]="stateColor()" opacity=".1" />
            <g [attr.fill]="stateColor()" opacity=".8">
              <path d="M80 53 C61 39 66 25 82 30 C95 34 91 45 80 53Z" />
              <path d="M83 56 C99 39 114 45 107 60 C101 72 91 67 83 56Z" />
              <path d="M80 59 C99 73 94 87 78 82 C65 78 69 67 80 59Z" />
              <path d="M77 56 C61 73 46 67 53 52 C59 40 69 45 77 56Z" />
            </g>
            <circle
              cx="80"
              cy="56"
              r="7"
              [attr.fill]="capFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <text x="80" y="119" text-anchor="middle" class="equipment-tag">
              {{ effectiveText() }}
            </text>
          }
          @case ('pipe') {
            <rect
              x="8"
              y="38"
              width="224"
              height="24"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path d="M8 39 H232" stroke="white" stroke-width="2" opacity=".7" />
            <rect
              x="17"
              y="31"
              width="7"
              height="38"
              rx="1"
              [attr.fill]="capFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <rect
              x="216"
              y="31"
              width="7"
              height="38"
              rx="1"
              [attr.fill]="capFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path d="M37 50 H203" [attr.stroke]="stateColor()" stroke-width="4" opacity=".4" />
            <path
              d="M81 44 L89 50 L81 56 M116 44 L124 50 L116 56 M151 44 L159 50 L151 56"
              [attr.stroke]="stateColor()"
              stroke-width="2"
              fill="none"
            />
            <text x="120" y="91" text-anchor="middle" class="equipment-tag">
              {{ effectiveText() }}
            </text>
          }
          @case ('conveyor') {
            <path
              d="M48 68 V91 H61 V68 M180 68 V91 H193 V68"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <rect
              x="13"
              y="43"
              width="214"
              height="31"
              rx="15.5"
              [attr.fill]="metalFill"
              stroke="#647987"
              stroke-width="1.8"
            />
            <rect x="20" y="49" width="200" height="19" rx="9.5" fill="#536a79" />
            @for (x of rollers; track x) {
              <circle
                [attr.cx]="x"
                cy="58.5"
                r="6"
                [attr.fill]="capFill"
                stroke="#718492"
                stroke-width="1"
              />
            }
            <path d="M36 43 H205" [attr.stroke]="stateColor()" stroke-width="3" />
            <path
              d="M105 27 H135 M130 22 L135 27 L130 32"
              [attr.stroke]="stateColor()"
              stroke-width="2"
              fill="none"
            />
            <text x="120" y="111" text-anchor="middle" class="equipment-tag">
              {{ effectiveText() }}
            </text>
          }
          @case ('sensor') {
            <path d="M80 8 V21 M75 8 H85" stroke="#718492" stroke-width="3" />
            <rect
              x="54"
              y="22"
              width="52"
              height="49"
              rx="6"
              [attr.fill]="metalFill"
              stroke="#647987"
              stroke-width="1.8"
            />
            <rect x="61" y="30" width="38" height="23" rx="3" fill="#f8fafb" stroke="#b7c4cb" />
            <circle cx="68" cy="41.5" r="3" [attr.fill]="stateColor()" />
            <text x="84" y="44" text-anchor="middle" class="equipment-state">
              {{ valid() ? display() : '—' }}
            </text>
            <path
              d="M70 71 V82 H90 V71 M74 82 V89 H86 V82"
              [attr.fill]="metalFill"
              stroke="#718492"
              stroke-width="1.5"
            />
            <path
              d="M63 61 H97 M72 94 Q80 99 88 94 M66 101 Q80 110 94 101"
              [attr.stroke]="stateColor()"
              stroke-width="1.5"
              fill="none"
            />
            <text x="80" y="122" text-anchor="middle" class="equipment-tag">
              {{ effectiveText() }}
            </text>
          }
          @case ('instrument') {
            @if (widget().instrumentLocation === 'shared') {
              <rect
                x="43"
                y="11"
                width="74"
                height="74"
                fill="none"
                [attr.stroke]="inkColor()"
                stroke-width="1.8"
              />
            }
            <circle
              cx="80"
              cy="48"
              r="32"
              fill="none"
              [attr.stroke]="inkColor()"
              stroke-width="1.8"
            />
            @if (widget().instrumentLocation !== 'field') {
              <path d="M48 48 H112" [attr.stroke]="inkColor()" stroke-width="1.5" />
            }
            <text
              x="80"
              y="40"
              text-anchor="middle"
              class="instrument-function"
              [attr.fill]="inkColor()"
            >
              {{ widget().instrumentFunction }}
            </text>
            <text x="80" y="63" text-anchor="middle" class="instrument-loop">
              {{ loopNumber() }}
            </text>
            <text
              x="80"
              y="103"
              text-anchor="middle"
              class="instrument-reading"
              [attr.fill]="inkColor()"
            >
              {{ display() }}
              <tspan font-size="11">{{ unit() }}</tspan>
            </text>
            @if (visualStyle() === 'high-performance' && widget().operatingRange) {
              <path d="M35 114 H125" stroke="#a7b2ba" stroke-width="4" />
              <path
                [attr.d]="
                  'M' + (35 + range().normalStart * 90) + ' 114 h' + range().normalWidth * 90
                "
                stroke="#657681"
                stroke-width="5"
              />
              <path
                [attr.d]="'M' + (35 + range().position * 90) + ' 108 v12'"
                [attr.stroke]="range().outside ? '#ad6b00' : '#263d4c'"
                stroke-width="2"
              />
            }
            <text x="80" y="129" text-anchor="middle" class="equipment-status">
              {{
                range().outside && visualStyle() === 'high-performance'
                  ? range().label + ' · OUTSIDE NORMAL'
                  : qualityLabel()
              }}
            </text>
          }
          @case ('value') {
            <rect x="1" y="1" width="218" height="108" rx="5" fill="#ffffff" stroke="#d4dde3" />
            <text x="18" y="27" class="metric-label">{{ widget().name }}</text>
            <text x="18" y="69" class="metric-value" [style.fill]="readingColor()">
              {{ display() }}
              <tspan dx="8" class="metric-unit">{{ text() ?? unit() }}</tspan>
            </text>
            @if (visualStyle() === 'high-performance' && widget().operatingRange) {
              <path d="M18 91 H190" stroke="#bac3ca" stroke-width="4" />
              <path
                [attr.d]="
                  'M' + (18 + range().normalStart * 172) + ' 91 h' + range().normalWidth * 172
                "
                stroke="#657681"
                stroke-width="6"
              />
              <path
                [attr.d]="'M' + (18 + range().position * 172) + ' 83 v16'"
                [attr.stroke]="range().outside ? '#ad6b00' : '#263d4c'"
                stroke-width="2"
              />
              <text x="18" y="106" class="equipment-status">
                {{ range().label }} · {{ widget().operatingRange!.normalLow }}–{{
                  widget().operatingRange!.normalHigh
                }}
                · SCALE {{ widget().operatingRange!.min }}–{{ widget().operatingRange!.max }}
              </text>
            } @else {
              <circle
                cx="21"
                cy="91"
                r="3"
                [attr.fill]="quality() === 'good' ? color() : '#a0adb1'"
              />
              <text x="30" y="95" class="symbol-small">
                {{ quality() === 'simulation' ? 'SIMULATED' : quality().toUpperCase() }}
              </text>
            }
          }
          @case ('label') {
            <text
              x="2"
              y="28"
              [attr.fill]="inkColor()"
              class="screen-label"
              [attr.font-size]="widget().height > 35 ? 26 : 12"
            >
              {{ effectiveText() }}
            </text>
          }
          @case ('button') {
            <rect x="1" y="1" width="218" height="58" rx="4" [attr.fill]="inkColor()" />
            <text x="110" y="35" text-anchor="middle" fill="white" font-size="14" font-weight="600">
              {{ effectiveText() }}
            </text>
          }
          @case ('trend') {
            <rect x="1" y="1" width="398" height="198" rx="5" fill="white" stroke="#d4dde3" />
            <text x="18" y="27" class="metric-label">{{ effectiveText() }}</text>
            <path
              d="M30 60 H375 M30 100 H375 M30 140 H375 M30 175 H375"
              stroke="#e6edec"
              stroke-width="1"
            />
            @if (samples().length > 1) {
              <polyline
                [attr.points]="points()"
                fill="none"
                [attr.stroke]="inkColor()"
                stroke-width="2.5"
              />
            } @else {
              <text x="200" y="112" text-anchor="middle" class="symbol-small">
                Waiting for samples
              </text>
            }
            <text x="30" y="191" class="symbol-small">
              RECENT SAMPLES · {{ quality().toUpperCase() }}
            </text>
          }
        }
      }
      @if (extendedEquipment()) {
        <g
          [attr.transform]="
            'translate(' +
            (widget().kind === 'pipe' || widget().kind === 'conveyor' ? 120 : 80) +
            ' 0)'
          "
        >
          <rect x="-29" y="1" width="58" height="13" rx="3" fill="#f3f6f8" stroke="#d4dde3" />
          <circle cx="-21" cy="7.5" r="2.5" [attr.fill]="stateColor()" />
          <text x="5" y="10" text-anchor="middle" class="equipment-state">
            {{ equipmentState() }}
          </text>
        </g>
      }
    </svg:g>`,
})
export class SymbolComponent {
  private readonly definitionId = `tx-symbol-${nextSymbolId++}`;
  readonly metalId = `${this.definitionId}-metal`;
  readonly capId = `${this.definitionId}-cap`;
  readonly vesselId = `${this.definitionId}-vessel`;
  readonly metalFill = `url(#${this.metalId})`;
  readonly capFill = `url(#${this.capId})`;
  readonly vesselClip = `url(#${this.vesselId})`;
  readonly widget = input.required<Widget>();
  readonly visualStyle = input<SymbolStyle>('industrial');
  readonly flatEquipment = computed(
    () =>
      this.visualStyle() !== 'industrial' &&
      !['instrument', 'value', 'label', 'button', 'trend'].includes(this.widget().kind),
  );
  readonly range = computed(() =>
    operatingRange(this.value(), this.quality(), this.widget().operatingRange),
  );
  readonly inkColor = computed(() =>
    this.visualStyle() === 'industrial'
      ? this.color()
      : this.color().toLowerCase() === '#329c8c'
        ? '#43525e'
        : this.color(),
  );
  readonly readingColor = computed(() =>
    this.visualStyle() !== 'high-performance'
      ? null
      : this.color().toLowerCase() !== '#329c8c'
        ? this.color()
        : this.range().outside
          ? '#ad6b00'
          : '#263d4c',
  );
  readonly loopNumber = computed(() => this.effectiveText().split('-').slice(1).join('-') || '101');
  readonly rollers = [30, 56, 82, 108, 134, 160, 186, 210];
  readonly extendedEquipment = computed(() =>
    ['motor', 'fan', 'pipe', 'conveyor', 'sensor'].includes(this.widget().kind),
  );
  readonly equipmentState = computed(() => this.processState().label);
  readonly processState = computed(() =>
    equipmentState(this.widget().kind, this.value(), this.quality()),
  );
  readonly value = input<unknown>(null);
  readonly quality = input('unknown');
  readonly color = input('#329c8c');
  readonly text = input<string | null>(null);
  readonly unit = input('');
  readonly effectiveText = computed(
    () => this.text() ?? (this.widget().text || this.widget().name),
  );
  readonly samples = input<number[]>([]);
  readonly valid = computed(
    () =>
      this.value() !== null &&
      this.value() !== undefined &&
      !(typeof this.value() === 'string' && String(this.value()).trim() === '') &&
      ['number', 'boolean', 'string'].includes(typeof this.value()) &&
      Number.isFinite(Number(this.value())),
  );
  readonly qualityLabel = computed(() =>
    this.quality() === 'simulation' ? 'SIMULATED' : this.quality().toUpperCase(),
  );
  readonly operatingState = computed(
    () => equipmentState('pump', this.value(), this.quality()).label,
  );
  readonly stateColor = computed(() =>
    displayAccent(this.visualStyle(), this.color(), this.value(), this.quality()),
  );
  readonly display = computed(() =>
    this.valid() ? Number(this.value()).toLocaleString('en', { maximumFractionDigits: 1 }) : '—',
  );
  readonly level = computed(() =>
    this.valid() ? Math.max(0, Math.min(100, Number(this.value()))) : 0,
  );
  readonly viewBox = computed(
    () =>
      ({
        instrument: '0 0 160 135',
        tank: '0 0 180 240',
        elbow: '0 0 120 120',
        tee: '0 0 120 120',
        connector: '0 0 120 120',
        motor: '0 0 160 125',
        fan: '0 0 160 125',
        pipe: '0 0 240 100',
        conveyor: '0 0 240 120',
        sensor: '0 0 160 130',
        pump: '0 0 160 125',
        valve: '0 0 160 100',
        value: '0 0 220 110',
        label: `0 0 ${this.widget().width} ${this.widget().height}`,
        button: '0 0 220 60',
        trend: '0 0 400 200',
        dropdown: '0 0 300 110',
        slider: '0 0 300 110',
        radio: '0 0 300 140',
        toggle: '0 0 240 110',
        segmented: '0 0 360 110',
        sparkline: '0 0 300 110',
        'linear-gauge': '0 0 300 140',
        chart: '0 0 360 240',
        gauge: '0 0 360 240',
        markdown: '0 0 360 240',
        iframe: '0 0 360 240',
        html: '0 0 360 240',
      })[this.widget().kind],
  );
  readonly points = computed(() => {
    const samples = this.samples(),
      min = Math.min(...samples) - 1,
      max = Math.max(...samples) + 1;
    return samples
      .map(
        (v, i) =>
          `${30 + (i * 345) / Math.max(1, samples.length - 1)},${165 - ((v - min) / (max - min)) * 110}`,
      )
      .join(' ');
  });
}
