import { Component, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DashboardWidgetInputs } from '../shared/widget-inputs';
@Component({
  selector: 'tx-html-widget',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        border: 1px solid #dce4eb;
        border-radius: 8px;
        overflow: hidden;
        box-sizing: border-box;
        background: white;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
      }
    `,
  ],
  template: `<iframe
    [srcdoc]="document()"
    sandbox=""
    referrerpolicy="no-referrer"
    [title]="widget().name"
    [attr.tabindex]="interactive() ? 0 : -1"
    [style.pointer-events]="interactive() ? 'auto' : 'none'"
  ></iframe>`,
})
export class HtmlWidgetComponent extends DashboardWidgetInputs {
  private readonly sanitizer = inject(DomSanitizer);
  // Raw HTML is confined to an opaque-origin frame with scripts/forms/navigation disabled.
  private readonly content = computed(() => {
    const config = this.widget().dashboard;
    return config?.type === 'html' ? config.content : '';
  });
  readonly document = computed(() => {
    return this.sanitizer.bypassSecurityTrustHtml(
      "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; frame-src 'none'; form-action 'none'; base-uri 'none'\"><style>body{margin:0;overflow-wrap:anywhere}*{box-sizing:border-box}</style>" +
        this.content(),
    );
  });
}
