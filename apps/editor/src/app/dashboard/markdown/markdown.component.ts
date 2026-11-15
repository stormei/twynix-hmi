import { Component, computed } from '@angular/core';
import { DashboardWidgetInputs } from '../shared/widget-inputs';

/** Intentionally text-only Markdown: raw HTML is never inserted into the host document. */
@Component({
  selector: 'tx-markdown-widget',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        box-sizing: border-box;
        border: 1px solid #dce4eb;
        border-radius: 8px;
        background: white;
        overflow: auto;
        padding: 18px;
        color: #19374c;
        font: 13px/1.6 system-ui;
      }
      h2,
      h3 {
        margin: 0 0 10px;
      }
      p {
        margin: 0 0 10px;
        white-space: pre-wrap;
      }
      .bullet {
        margin: 3px 0;
        padding-left: 14px;
      }
      pre {
        white-space: pre-wrap;
        padding: 10px;
        background: #f1f5f8;
        border-radius: 4px;
        font: 12px monospace;
      }
      a {
        color: #147b91;
      }
    `,
  ],
  template: `@for (block of blocks(); track $index) {
    @switch (block.type) {
      @case ('heading') {
        @if (block.level === 1) {
          <h2>{{ block.text }}</h2>
        } @else {
          <h3>{{ block.text }}</h3>
        }
      }
      @case ('bullet') {
        <p class="bullet">• {{ block.text }}</p>
      }
      @case ('code') {
        <pre>{{ block.text }}</pre>
      }
      @case ('link') {
        <p>
          <a
            [href]="block.url"
            target="_blank"
            rel="noopener noreferrer"
            [attr.tabindex]="interactive() ? 0 : -1"
            >{{ block.text }}</a
          >
        </p>
      }
      @default {
        <p>{{ block.text }}</p>
      }
    }
  }`,
})
export class MarkdownWidgetComponent extends DashboardWidgetInputs {
  readonly blocks = computed(() => {
    const c = this.widget().dashboard;
    const content = c?.type === 'markdown' ? c.content : '';
    const blocks: { type: string; text: string; level?: number; url?: string }[] = [];
    let code: string[] | null = null;
    for (const line of content.split('\n')) {
      if (line.startsWith('```')) {
        if (code) {
          blocks.push({ type: 'code', text: code.join('\n') });
          code = null;
        } else code = [];
        continue;
      }
      if (code) {
        code.push(line);
        continue;
      }
      if (!line.trim()) continue;
      const heading = /^(#{1,6})\s+(.*)$/.exec(line),
        bullet = /^\s*[-*]\s+(.*)$/.exec(line),
        link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(line);
      if (heading) blocks.push({ type: 'heading', text: heading[2], level: heading[1].length });
      else if (bullet) blocks.push({ type: 'bullet', text: bullet[1] });
      else if (link) blocks.push({ type: 'link', text: link[1], url: link[2] });
      else blocks.push({ type: 'paragraph', text: line });
    }
    if (code) blocks.push({ type: 'code', text: code.join('\n') });
    return blocks;
  });
}
