import { Component, input } from '@angular/core';

/** Small, consistent line icons shared by navigation, layers and the symbol library. */
@Component({
  selector: 'tx-icon',
  standalone: true,
  host: { 'aria-hidden': 'true', class: 'tx-icon' },
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    @switch (name()) {
      @case ('front') {
        <rect x="7" y="7" width="14" height="14" rx="1" />
        <path d="M3 16V3h13M11 12h6m-3-3 3 3-3 3" />
      }
      @case ('back') {
        <rect x="3" y="3" width="14" height="14" rx="1" />
        <path d="M8 21h13V8M7 8h6m-3-3-3 3 3 3" />
      }
      @case ('rotate-right') {
        <path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6" />
      }
      @case ('rotate-left') {
        <path d="M4 9a8 8 0 1 1 0 7M4 3v6h6" />
      }
      @case ('dropdown') {
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M6 12h6m3-2 3 3 3-3" />
      }
      @case ('slider') {
        <path d="M3 12h18" />
        <rect x="8" y="7" width="5" height="10" rx="1" />
      }
      @case ('radio') {
        <circle cx="6" cy="7" r="3" />
        <circle cx="6" cy="17" r="3" />
        <circle cx="6" cy="7" r="1" />
        <path d="M12 7h9M12 17h9" />
      }
      @case ('toggle') {
        <rect x="2" y="6" width="20" height="12" rx="6" />
        <circle cx="15" cy="12" r="4" />
      }
      @case ('segmented') {
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M9 6v12m6-12v12M4 12h3" />
      }
      @case ('sparkline') {
        <path d="m2 16 5-6 4 3 5-9 6 4" />
      }
      @case ('linear-gauge') {
        <rect x="2" y="9" width="20" height="6" rx="1" />
        <path d="M2 9h12v6H2M17 6v12" />
      }
      @case ('chart') {
        <path d="M3 3v18h18M6 15l4-5 4 3 6-8" />
      }
      @case ('gauge') {
        <path d="M3 18a9 9 0 1 1 18 0M12 14l5-6M5 18h14" />
        <circle cx="12" cy="15" r="2" />
      }
      @case ('markdown') {
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M6 15V9l3 3 3-3v6M17 9v6m-2-2 2 2 2-2" />
      }
      @case ('iframe') {
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 8h18M6 5h1m2 0h1m2 0h1M9 12l-3 3 3 3m6-6 3 3-3 3" />
      }
      @case ('html') {
        <path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16" />
      }
      @case ('cursor') {
        <path d="m5 3 14 10-7 1-3 7L5 3Z" />
      }
      @case ('hand') {
        <path
          d="M7 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v6-2a2 2 0 0 1 4 0v5c0 5-3 8-7 8h-2c-3 0-5-2-7-5L3 13c-1-2 1-4 3-2l1 1Z"
          transform="translate(-1 0)"
        />
      }
      @case ('eye') {
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      }
      @case ('eye-off') {
        <path
          d="m3 3 18 18M9 5c6-2 11 5 13 7a19 19 0 0 1-4 4M5 7a23 23 0 0 0-3 5s4 7 10 7a12 12 0 0 0 4-1M10 10l4 4"
        />
      }
      @case ('lock') {
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
      }
      @case ('unlock') {
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0M12 14v3" />
      }
      @case ('group') {
        <path d="M3 3h18v18H3z" stroke-dasharray="3 3" />
        <rect x="6" y="6" width="6" height="6" />
        <rect x="12" y="12" width="6" height="6" />
      }
      @case ('ungroup') {
        <rect x="3" y="3" width="8" height="8" />
        <rect x="13" y="13" width="8" height="8" />
        <path d="m15 5 5-3M5 15l-3 5" />
      }
      @case ('faceplate') {
        <rect x="3" y="3" width="13" height="13" rx="1" />
        <rect x="8" y="8" width="13" height="13" rx="1" />
        <path d="M12 12h5M12 16h5" />
      }
      @case ('grid') {
        <rect x="3" y="3" width="18" height="18" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      }
      @case ('snap') {
        <path d="M6 4v10a6 6 0 0 0 12 0V4h-4v10a2 2 0 0 1-4 0V4H6ZM6 8h4M14 8h4" />
      }
      @case ('panel-left') {
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <path d="M9 3v18" />
      }
      @case ('panel-right') {
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <path d="M15 3v18" />
      }
      @case ('panel-bottom') {
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <path d="M3 15h18" />
      }
      @case ('help') {
        <circle cx="12" cy="12" r="9" />
        <path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5M12 17h.01" />
      }
      @case ('search') {
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      }
      @case ('chevron-right') {
        <path d="m9 6 6 6-6 6" />
      }
      @case ('align-left') {
        <path d="M4 3v18M8 6h12v4H8zM8 14h7v4H8z" />
      }
      @case ('align-center') {
        <path d="M12 2v20M4 6h16v4H4zM7 14h10v4H7z" />
      }
      @case ('align-right') {
        <path d="M20 3v18M4 6h12v4H4zM9 14h7v4H9z" />
      }
      @case ('align-top') {
        <path d="M3 4h18M6 8h4v12H6zM14 8h4v7h-4z" />
      }
      @case ('align-middle') {
        <path d="M2 12h20M6 4h4v16H6zM14 7h4v10h-4z" />
      }
      @case ('align-bottom') {
        <path d="M3 20h18M6 4h4v12H6zM14 9h4v7h-4z" />
      }
      @case ('distribute-horizontal') {
        <path d="M3 3v18M21 3v18M9 7h6v10H9zM3 12h6M15 12h6" />
      }
      @case ('distribute-vertical') {
        <path d="M3 3h18M3 21h18M7 9h10v6H7zM12 3v6M12 15v6" />
      }
      @case ('binding') {
        <path
          d="m9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 7l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"
          transform="translate(1 0) scale(.9)"
        />
      }
      @case ('edit') {
        <path d="m4 16-1 5 5-1L20 8l-4-4L4 16Z M14 6l4 4" />
      }
      @case ('preview') {
        <path d="m8 4 13 8-13 8V4Z" />
      }
      @case ('runtime') {
        <rect x="3" y="4" width="18" height="13" rx="1.5" />
        <path d="M8 21h8M12 17v4M7 12l3-3 3 2 4-4" />
      }
      @case ('screen') {
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M3 8h18M7 12h4v4H7zM15 12h2M15 16h2" />
      }
      @case ('tank') {
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v13c0 4 14 4 14 0V5M5 14c0 4 14 4 14 0M8 21v1M16 21v1" />
      }
      @case ('pump') {
        <circle cx="12" cy="11" r="7" />
        <path d="m9 7 7 4-7 4V7ZM2 11h3M19 11h3M8 18l-2 3h12l-2-3" />
      }
      @case ('valve') {
        <path d="M2 12h20M5 6l7 6-7 6V6ZM19 6l-7 6 7 6V6ZM12 12V3M9 3h6" />
      }
      @case ('elbow') {
        <path d="M3 14h6a5 5 0 0 0 5-5V3M3 20h6A11 11 0 0 0 20 9V3M2 12v10M12 2h10" />
      }
      @case ('tee') {
        <path d="M2 10h8V2h4v8h8v4H2Z M2 8v8M22 8v8M8 2h8" />
      }
      @case ('connector') {
        <path d="M2 9h6v6H2M16 9h6v6h-6" />
        <rect x="8" y="6" width="8" height="12" rx="1" />
      }
      @case ('instrument') {
        <circle cx="12" cy="10" r="8" />
        <path d="M4 10h16M12 18v4M9 6h6M10 14h4" />
      }
      @case ('motor') {
        <rect x="4" y="6" width="15" height="12" rx="3" />
        <path d="M8 8v8M11 8v8M14 8v8M19 11h3M6 18v3h12v-3" />
      }
      @case ('fan') {
        <circle cx="12" cy="12" r="9" />
        <path d="M12 12C3 4 12 2 12 12C20 3 22 12 12 12C21 20 12 22 12 12C4 21 2 12 12 12Z" />
      }
      @case ('pipe') {
        <path d="M2 9h20v6H2M5 6v12M19 6v12M9 12h6m-2-2 2 2-2 2" />
      }
      @case ('conveyor') {
        <rect x="2" y="8" width="20" height="8" rx="4" />
        <path d="M6 16v5M18 16v5M7 12h.01M12 12h.01M17 12h.01M8 4h8m-2-2 2 2-2 2" />
      }
      @case ('sensor') {
        <rect x="6" y="5" width="12" height="12" rx="2" />
        <path d="M12 2v3M9 9h6M10 17v3h4v-3M7 21q5 4 10 0" />
      }
      @case ('value') {
        <rect x="2" y="5" width="20" height="15" rx="2" />
        <path d="M6 9h3l-3 3h3M12 9v3h4M15 9v6M6 16h4" />
      }
      @case ('label') {
        <path d="M5 4h14M12 4v16M8 20h8M5 4v3M19 4v3" />
      }
      @case ('button') {
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M7 12h10m-3-3 3 3-3 3" />
      }
      @case ('trend') {
        <path d="M3 3v18h18M6 16l5-6 4 3 6-8" />
      }
      @case ('undo') {
        <path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12" />
      }
      @case ('redo') {
        <path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12" />
      }
      @case ('chevron') {
        <path d="m7 10 5 5 5-5" />
      }
      @case ('add') {
        <path d="M12 5v14M5 12h14" />
      }
      @case ('publish') {
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
      }
      @case ('fit') {
        <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />
      }
      @case ('alarm') {
        <path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4l-2 3ZM10 20h4M12 2v2" />
      }
      @case ('console') {
        <path d="m4 6 6 6-6 6M13 18h7" />
      }
      @case ('settings') {
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" fill="var(--tx-surface-1)" />
        <circle cx="15" cy="17" r="3" fill="var(--tx-surface-1)" />
      }
      @case ('copy') {
        <rect x="8" y="8" width="13" height="13" rx="1" />
        <path d="M16 8V3H3v13h5" />
      }
      @case ('delete') {
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      }
      @default {
        <rect x="4" y="4" width="16" height="16" rx="2" />
      }
    }
  </svg>`,
})
export class IconComponent {
  readonly name = input.required<string>();
}
