import { Component, Injectable, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  actionSchema,
  commandPolicy,
  type Widget,
  type CommandPolicy,
  propertyBinding,
  projectSchema,
} from '@twynix/model';
import { EditorStore } from './editor.store';
import { DataBrowserComponent } from './data-browser.component';
import { CommandStateService } from './command-state.service';
interface ActionDraft {
  type: Widget['action']['type'];
  message: string;
  screenId: string;
  deviceId: string;
  method: string;
  params: string;
  confirmation: string;
  mapValue: boolean;
  parameter: string;
  valueType: 'number' | 'boolean' | 'string';
  minimum: number | null;
  maximum: number | null;
  step: number | null;
  allowed: string;
  timeout: number;
  authority: string;
  feedback: boolean;
  feedbackTimeout: number;
  tolerance: number;
  expected: string;
  checkReply: boolean;
  replyField: string;
  replyExpected: string;
}
@Injectable({ providedIn: 'root' })
class ActionDraftCache {
  key = '';
  source = '';
  draft?: ActionDraft;
  event: 'activate' | 'doubleClick' = 'activate';
}
@Component({
  selector: 'tx-action-editor',
  standalone: true,
  imports: [FormsModule, DataBrowserComponent],
  templateUrl: './action-editor.component.html',
  styleUrl: './action-editor.component.css',
})
export class ActionEditorComponent {
  readonly store = inject(EditorStore);
  readonly commands = inject(CommandStateService);
  private readonly cache = inject(ActionDraftCache);
  readonly openScript = output<void>();
  readonly event = signal<'activate' | 'doubleClick'>(this.cache.event);
  readonly draft = signal<ActionDraft>(this.defaults());
  readonly error = signal('');
  testValue = '0';
  testAuthority = 'TENANT_ADMIN';
  constructor() {
    effect(() => {
      const widget = this.store.selected(),
        event = this.event();
      if (!widget) return;
      const action = event === 'activate' ? widget.action : widget.doubleClickAction,
        key = `${this.store.project().id}:${widget.id}:${event}`,
        source = JSON.stringify(action);
      if (this.cache.key === key && this.cache.source === source && this.cache.draft) {
        this.draft.set(this.cache.draft);
        return;
      }
      this.cache.event = event;
      this.cache.key = key;
      this.cache.source = source;
      const draft = this.defaults();
      draft.type = action.type;
      if (action.type === 'notify') draft.message = action.message;
      if (action.type === 'navigate') draft.screenId = action.screenId;
      if (action.type === 'command') {
        const policy = commandPolicy(action);
        Object.assign(draft, {
          deviceId: action.deviceId,
          method: action.method,
          params: JSON.stringify(action.params, null, 2),
          confirmation: action.confirmation,
          timeout: policy.timeoutMs / 1000,
          checkReply: !!policy.replyCheck,
          replyField: policy.replyCheck?.field ?? 'success',
          replyExpected: JSON.stringify(policy.replyCheck?.expectedValue ?? true),
          authority: policy.authorities[0] ?? '',
          feedback: !!policy.feedback,
          feedbackTimeout: (policy.feedback?.timeoutMs ?? 15000) / 1000,
          tolerance: policy.feedback?.tolerance ?? 0,
          expected: JSON.stringify(policy.feedback?.expectedValue ?? 0),
        });
        if (policy.mapping)
          Object.assign(draft, {
            mapValue: true,
            parameter: policy.mapping.parameter,
            valueType: policy.mapping.valueType,
            minimum: policy.mapping.minimum,
            maximum: policy.mapping.maximum,
            step: policy.mapping.step,
            allowed: JSON.stringify(policy.mapping.allowedValues),
          });
      } else {
        const config = widget.dashboard;
        if (config?.type === 'slider')
          Object.assign(draft, {
            minimum: config.minimum,
            maximum: config.maximum,
            step: config.step,
          });
        if (config && 'options' in config) {
          draft.allowed = JSON.stringify(config.options.map((option) => option.value));
          draft.valueType = typeof config.options[0].value as ActionDraft['valueType'];
        }
        if (widget.kind === 'toggle') draft.valueType = 'boolean';
      }
      this.cache.draft = draft;
      this.draft.set(draft);
      this.error.set('');
      const config = widget.dashboard;
      this.testValue = JSON.stringify(
        config?.type === 'toggle'
          ? false
          : config?.type === 'slider'
            ? config.minimum
            : config && 'options' in config
              ? config.options[0].value
              : widget.demoValue,
      );
    });
  }
  private defaults(): ActionDraft {
    return {
      type: 'none',
      message: '',
      screenId: this.store?.project().screens[0].id ?? '',
      deviceId: '',
      method: 'setState',
      params: '{}',
      confirmation: 'Apply this command to the device?',
      mapValue: false,
      parameter: 'value',
      valueType: 'number',
      minimum: null,
      maximum: null,
      step: null,
      allowed: '[]',
      timeout: 10,
      authority: '',
      feedback: false,
      feedbackTimeout: 15,
      tolerance: 0,
      expected: '0',
      checkReply: false,
      replyField: 'success',
      replyExpected: 'true',
    };
  }
  previewOnly() {
    const widget = this.store.selected();
    const action = this.event() === 'activate' ? widget?.action : widget?.doubleClickAction;
    return action?.type === 'command' && !!action.policy?.previewOnly;
  }
  build(): Widget['action'] {
    const draft = this.draft();
    if (draft.type === 'none') return { type: 'none' };
    if (draft.type === 'notify')
      return actionSchema.parse({ type: 'notify', message: draft.message });
    if (draft.type === 'navigate')
      return actionSchema.parse({ type: 'navigate', screenId: draft.screenId });
    const policy: CommandPolicy = {
      previewOnly: this.previewOnly() || undefined,
      mapping: draft.mapValue
        ? {
            parameter: draft.parameter,
            valueType: draft.valueType,
            minimum: draft.minimum,
            maximum: draft.maximum,
            step: draft.step,
            allowedValues: JSON.parse(draft.allowed),
          }
        : null,
      replyCheck: draft.checkReply
        ? { field: draft.replyField, expectedValue: JSON.parse(draft.replyExpected) }
        : null,
      timeoutMs: draft.timeout * 1000,
      authorities: draft.authority ? [draft.authority as CommandPolicy['authorities'][number]] : [],
      feedback: draft.feedback
        ? {
            timeoutMs: draft.feedbackTimeout * 1000,
            tolerance: draft.tolerance,
            ...(!draft.mapValue ? { expectedValue: JSON.parse(draft.expected) } : {}),
          }
        : null,
    };
    if (draft.feedback && !this.previewOnly()) {
      const binding = propertyBinding(this.store.selected()!, 'value');
      if (!binding?.enabled || binding.type === 'constant' || !binding.source)
        throw new Error(
          'Bind the widget value to telemetry before enabling reported-value confirmation.',
        );
    }
    return actionSchema.parse({
      type: 'command',
      deviceId: draft.deviceId.trim(),
      method: draft.method.trim(),
      params: JSON.parse(draft.params),
      confirmation: draft.confirmation,
      policy,
    });
  }
  dirty() {
    try {
      const widget = this.store.selected();
      if (!widget) return false;
      const stored = this.event() === 'activate' ? widget.action : widget.doubleClickAction;
      return (
        JSON.stringify(this.build()) !==
        JSON.stringify(
          stored.type === 'command' ? { ...stored, policy: commandPolicy(stored) } : stored,
        )
      );
    } catch {
      return true;
    }
  }
  save() {
    try {
      const action = this.build();
      const project = structuredClone(this.store.project());
      const widget = project.screens
        .find((screen) => screen.id === this.store.screen().id)!
        .widgets.find((widget) => widget.id === this.store.selectedId())!;
      Object.assign(
        widget,
        this.event() === 'activate' ? { action } : { doubleClickAction: action },
      );
      projectSchema.parse(project);
      this.store.updateWidget(
        this.event() === 'activate' ? { action } : { doubleClickAction: action },
      );
      this.error.set('');
    } catch (error) {
      this.error.set(this.message(error));
    }
  }
  chooseEntity(entity: { entityId: string; entityType: string }) {
    if (entity.entityType === 'DEVICE') this.draft().deviceId = entity.entityId;
    else this.error.set('Device RPC requires a device target, not an asset.');
  }
  test() {
    try {
      const action = this.build();
      if (action.type !== 'command') return;
      const widget = {
        ...this.store.selected()!,
        ...(this.event() === 'activate' ? { action } : { doubleClickAction: action }),
      };
      this.commands.prepare(
        {
          widget,
          event: this.event(),
          screenId: this.store.screen().id,
          mode: 'preview',
          authority: this.testAuthority,
        },
        JSON.parse(this.testValue),
      );
      this.error.set('');
    } catch (error) {
      this.error.set(this.message(error));
    }
  }
  private message(error: unknown) {
    return error instanceof SyntaxError
      ? 'Enter valid JSON for parameters, allowed values and the test value.'
      : error instanceof Error && 'issues' in error
        ? 'Check the device UUID, parameter name, value rules and timeout settings.'
        : error instanceof Error
          ? error.message
          : 'Check the action settings.';
  }
}
