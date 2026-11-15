import { Component, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { validEmbedUrl } from '@twynix/model';
import { DashboardWidgetInputs } from '../shared/widget-inputs';
@Component({
  selector: 'tx-iframe-widget',
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
        background: #f8fafc;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
      }
      .placeholder {
        height: 100%;
        display: grid;
        place-content: center;
        text-align: center;
        color: #607789;
        font: 13px system-ui;
        gap: 8px;
      }
      .placeholder b {
        color: #19374c;
      }
    `,
  ],
  template: `@if (source(); as url) {
      <iframe
        [src]="url"
        sandbox="allow-scripts"
        referrerpolicy="no-referrer"
        loading="lazy"
        [title]="widget().name"
        [attr.tabindex]="interactive() ? 0 : -1"
        [style.pointer-events]="interactive() ? 'auto' : 'none'"
      ></iframe>
    } @else {
      <div class="placeholder"><b>Embedded page</b><span>Set the page URL in Style</span></div>
    }`,
})
export class IframeWidgetComponent extends DashboardWidgetInputs {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly url = computed(() => {
    const config = this.widget().dashboard;
    return config?.type === 'iframe' ? config.url : '';
  });
  readonly source = computed(() => {
    const url = this.url();
    return url && validEmbedUrl(url) ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });
}
