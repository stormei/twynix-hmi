import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { z } from 'zod';
import {
  behaviorCapabilities,
  behaviorConfigSchema,
  bindingSchema,
  type Appearance,
  type BehaviorConfig,
  type Binding,
  type Screen,
  type Widget,
  isDashboardKind,
} from '@twynix/model';
import {
  behaviorDraft,
  behaviorTemplates,
  instantiateTemplate,
  liveAuthoringContext,
  parseSample,
} from '../../../../packages/scripting/src/authoring';
import { scriptInputs } from '../../../../packages/scripting/src/inputs';
import {
  validateAppearance,
  type ScriptContext,
  type ScriptInput,
} from '../../../../packages/scripting/src/evaluate';
import { runtimeWidget } from '../../../../packages/editor/src/runtime-appearance';
import { widgetContentSize } from '../../../../packages/editor/src/rotation';
import { ApiService } from './api.service';
import { RealtimeService } from './realtime.service';
import { ScriptService } from './script.service';
import { DataBrowserComponent, type BrowserSource } from './data-browser.component';
import { SymbolComponent } from './symbol.component';
import { DashboardWidgetComponent } from './dashboard/dashboard-widget.component';

@Component({
  selector: 'tx-behavior-editor',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    JsonPipe,
    DataBrowserComponent,
    SymbolComponent,
    DashboardWidgetComponent,
  ],
  providers: [RealtimeService],
  templateUrl: './behavior-editor.component.html',
  styleUrl: './behavior-editor.component.css',
})
export class BehaviorEditorComponent {
  readonly widget = input.required<Widget>();
  readonly screen = input.required<Screen>();
  readonly context = input.required<ScriptContext>();
  readonly applied = output<{ source: string; config: BehaviorConfig }>();
  readonly closed = output<void>();
  readonly api = inject(ApiService);
  readonly live = inject(RealtimeService);
  private readonly scripts = inject(ScriptService);
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly editor = viewChild.required<ElementRef<HTMLTextAreaElement>>('editor');
  readonly completionList = viewChild<ElementRef<HTMLElement>>('completions');
  readonly source = signal('');
  readonly suggestions = signal<string[]>([]);
  private completionStart = 0;
  readonly resultMode = signal<'effects' | 'appearance'>('effects');
  readonly inputs = signal<Record<string, Binding>>({});
  readonly outputs = signal<BehaviorConfig['outputs']>([]);
  readonly templateOrigin = signal<BehaviorConfig['template']>(undefined);
  readonly initialized = signal(false);
  readonly error = signal('');
  readonly testing = signal(false);
  readonly testMode = signal<'live' | 'simulation'>('live');
  readonly result = signal<{
    appearance: Appearance;
    widget: Widget;
    context: ScriptContext;
    effects: unknown;
    mode: string;
    duration: number;
    capturedAt: number;
  } | null>(null);
  readonly now = signal(Date.now());
  readonly liveInputs = computed(() => {
    this.now();
    return scriptInputs(
      this.configuration(),
      this.live.values(),
      this.live.state() === 'connected',
      Date.now(),
    );
  });
  readonly aliases = computed(() => Object.keys(this.inputs()));
  readonly capabilities = computed(
    () => behaviorCapabilities[this.widget().kind] as readonly (keyof Appearance)[],
  );
  readonly templates = behaviorTemplates;
  readonly isDashboardKind = isDashboardKind;
  readonly contentSize = widgetContentSize;
  readonly scale = computed(() =>
    Math.min(1, 520 / this.screen().width, 240 / this.screen().height),
  );
  readonly completionTokens = computed(() => [
    'context.value',
    'context.quality',
    'context.name',
    ...this.aliases().flatMap((alias) => [
      `inputs.${alias}.value`,
      `inputs.${alias}.quality`,
      `inputs.${alias}.timestamp`,
      `inputs.${alias}.unit`,
    ]),
    ...(this.resultMode() === 'appearance'
      ? [
          'helpers.clamp(value, 0, 100)',
          'return { text: "" };',
          'return { color: "#329c8c" };',
          'return { position: { offsetX: 0, offsetY: 0 } };',
          'return { rotation: { offsetDegrees: 0 } };',
        ]
      : ['hmi.setText(context.value);', 'hmi.setColor("#329c8c");']),
  ]);
  alias = 'value';
  unit = '';
  freshness = 30;
  sampleValues: Record<string, string> = Object.create(null) as Record<string, string>;
  sampleQualities: Record<string, ScriptInput['quality']> = Object.create(null) as Record<
    string,
    ScriptInput['quality']
  >;
  sampleTimes: Record<string, number | null> = Object.create(null) as Record<string, number | null>;
  mainSample = 'null';
  mainQuality = 'good';
  readonly qualities: ScriptInput['quality'][] = [
    'good',
    'stale',
    'missing',
    'disconnected',
    'invalid',
  ];
  templateId = behaviorTemplates[0].id;
  templateAliases: Record<string, string> = {};
  templateParameters: Record<string, string | number> = {};
  private subscription = '';
  private generation = 0;
  private destroyed = false;
  constructor() {
    effect(() => {
      if (!this.initialized()) return;
      const user = this.api.user()?.id.id ?? '';
      const bindings = Object.values(this.inputs());
      const signature = JSON.stringify([user, bindings]);
      if (signature === this.subscription) return;
      this.subscription = signature;
      untracked(() => {
        if (user && bindings.length) this.live.connect(bindings, false);
        else this.live.disconnect();
      });
    });
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation++;
      clearInterval(timer);
    });
    afterNextRender(() => {
      const widget = this.widget(),
        config = widget.behaviorConfig;
      this.source.set(widget.behavior);
      this.resultMode.set(config?.resultMode ?? 'effects');
      this.inputs.set(structuredClone(config?.inputs ?? {}));
      this.outputs.set([...(config?.outputs ?? [])]);
      this.templateOrigin.set(config?.template);
      this.mainSample = JSON.stringify(this.context().value ?? null);
      this.mainQuality = this.context().quality;
      this.chooseTemplate(this.templateId);
      this.initialized.set(true);
      this.dialog().nativeElement.showModal();
    });
  }
  configuration(): BehaviorConfig {
    return {
      apiVersion: 1,
      resultMode: this.resultMode(),
      inputs: this.inputs(),
      outputs: this.outputs(),
      fallback: 'baseline',
      ...(this.templateOrigin() ? { template: this.templateOrigin() } : {}),
    };
  }
  changed() {
    this.generation++;
    this.result.set(null);
    this.error.set('');
  }
  setSource(source: string) {
    this.suggestions.set([]);
    this.source.set(source);
    this.changed();
  }
  setMode(mode: 'effects' | 'appearance') {
    this.resultMode.set(mode);
    this.changed();
  }
  toggleOutput(output: keyof Appearance, checked: boolean) {
    this.outputs.update((outputs) =>
      checked ? [...new Set([...outputs, output])] : outputs.filter((key) => key !== output),
    );
    this.changed();
  }
  chooseSource(source: BrowserSource) {
    try {
      const binding = bindingSchema.parse({
        ...source,
        unit: this.unit,
        staleAfterMs: this.freshness * 1000,
      });
      const config = behaviorConfigSchema.parse({
        ...this.configuration(),
        inputs: { ...this.inputs(), [this.alias.trim()]: binding },
      });
      this.inputs.set(config.inputs);
      this.changed();
    } catch (error) {
      this.fail(error);
    }
  }
  editInput(alias: string) {
    this.alias = alias;
    this.unit = this.inputs()[alias].unit;
    this.freshness = this.inputs()[alias].staleAfterMs / 1000;
  }
  updateInput() {
    const existing = Object.hasOwn(this.inputs(), this.alias)
      ? this.inputs()[this.alias]
      : undefined;
    if (!existing) {
      this.error.set('Choose a ThingsBoard source to add this input.');
      return;
    }
    this.chooseSource({
      entityId: existing.entityId,
      entityType: existing.entityType,
      key: existing.key,
      dataType: existing.dataType ?? 'TIME_SERIES',
    });
  }
  removeInput(alias: string) {
    this.inputs.update((inputs) =>
      Object.fromEntries(Object.entries(inputs).filter(([key]) => key !== alias)),
    );
    this.changed();
  }
  template() {
    return this.templates.find((template) => template.id === this.templateId)!;
  }
  chooseTemplate(id: string) {
    this.templateId = id;
    this.templateParameters = Object.fromEntries(
      this.template().parameters.map((parameter) => [parameter.key, parameter.value]),
    );
    this.templateAliases = Object.fromEntries(
      this.template().inputs.map((slot) => [
        slot,
        this.aliases().includes(slot) ? slot : (this.aliases()[0] ?? ''),
      ]),
    );
  }
  templateSupported() {
    return this.template().outputs.every((output) => this.capabilities().includes(output));
  }
  insertTemplate() {
    try {
      if (!this.templateSupported())
        throw new Error('This widget does not support the template outputs.');
      for (const slot of this.template().inputs)
        if (!Object.hasOwn(this.inputs(), this.templateAliases[slot]))
          throw new Error(`Choose a telemetry input for ${slot}.`);
      const source = instantiateTemplate(
        this.template(),
        this.templateAliases,
        this.templateParameters,
      );
      this.resultMode.set('appearance');
      this.outputs.set([...this.template().outputs]);
      this.templateOrigin.set({ id: this.template().id, version: this.template().version });
      this.setSource(source);
    } catch (error) {
      this.fail(error);
    }
  }
  insertToken(token: string) {
    if (!token) return;
    const editor = this.editor().nativeElement;
    editor.setRangeText(token, editor.selectionStart, editor.selectionEnd, 'end');
    this.setSource(editor.value);
    editor.focus();
  }
  suggest(editor: HTMLTextAreaElement, force = false) {
    const prefix =
      editor.value.slice(0, editor.selectionStart).match(/[A-Za-z_][A-Za-z0-9_.]*$/)?.[0] ?? '';
    this.completionStart = editor.selectionStart - prefix.length;
    this.suggestions.set(
      !force && !prefix.includes('.')
        ? []
        : this.completionTokens()
            .filter((token) => token.startsWith(prefix) && token !== prefix)
            .slice(0, 8),
    );
  }
  complete(token: string) {
    const editor = this.editor().nativeElement;
    editor.setSelectionRange(this.completionStart, editor.selectionStart);
    this.insertToken(token);
    this.suggestions.set([]);
  }
  moveCompletion(event: KeyboardEvent, index: number) {
    const buttons =
      this.completionList()?.nativeElement.querySelectorAll<HTMLButtonElement>('button');
    if (!buttons) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[
        (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.suggestions.set([]);
      this.editor().nativeElement.focus();
    }
  }
  indent(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' && this.suggestions().length) {
      event.preventDefault();
      this.completionList()?.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      this.suggest(this.editor().nativeElement, true);
      return;
    }
    if (event.key === 'Escape' && this.suggestions().length) {
      event.preventDefault();
      event.stopPropagation();
      this.suggestions.set([]);
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      this.insertToken('  ');
    }
  }
  copyLive() {
    for (const [alias, sample] of Object.entries(this.liveInputs())) {
      this.sampleValues[alias] = JSON.stringify(sample.value);
      this.sampleQualities[alias] = sample.quality;
      this.sampleTimes[alias] = sample.timestamp;
    }
    this.mainSample = JSON.stringify(this.context().value ?? null);
    this.mainQuality = this.context().quality;
    this.testMode.set('simulation');
    this.changed();
  }
  testContext(): ScriptContext {
    if (this.testMode() === 'live')
      return liveAuthoringContext(
        this.widget(),
        this.context(),
        this.liveInputs(),
        !!this.api.user(),
      );
    const inputs = Object.fromEntries(
      this.aliases().map((alias) => [
        alias,
        {
          value: parseSample(this.sampleValues[alias] ?? 'null'),
          quality: this.sampleQualities[alias] ?? 'missing',
          timestamp: this.sampleTimes[alias] ?? null,
          unit: this.inputs()[alias].unit,
        },
      ]),
    );
    return {
      value: parseSample(this.mainSample),
      quality: this.mainQuality,
      name: this.widget().name,
      inputs,
    };
  }
  async test() {
    if (this.testing()) return;
    const generation = ++this.generation;
    this.testing.set(true);
    this.result.set(null);
    this.error.set('');
    try {
      const draft = behaviorDraft(
        this.widget(),
        this.source(),
        this.configuration(),
        this.screen(),
      );
      const context = this.testContext(),
        mode = this.testMode(),
        signature = JSON.stringify(context),
        start = performance.now(),
        capturedAt = Date.now();
      let appearance: Appearance, effects: unknown;
      if (draft.config.resultMode === 'appearance') {
        appearance = validateAppearance(
          await this.scripts.behavior(draft.source, context),
          draft.config.outputs,
        );
        effects = appearance;
      } else {
        const result = await this.scripts.run(draft.source, context);
        effects = result;
        appearance = {};
        for (const effect of result) {
          if (effect.type === 'text') appearance.text = effect.value;
          if (effect.type === 'color' && /^#[a-f\d]{6}$/i.test(effect.value))
            appearance.color = effect.value;
        }
      }
      const widget = runtimeWidget(this.widget(), appearance, this.screen());
      if (this.destroyed || generation !== this.generation) return;
      if (mode !== this.testMode() || signature !== JSON.stringify(this.testContext())) {
        this.error.set('Inputs changed during evaluation. Test again with the latest snapshot.');
        return;
      }
      this.result.set({
        appearance,
        widget,
        context,
        effects,
        mode,
        duration: Math.round((performance.now() - start) * 100) / 100,
        capturedAt,
      });
    } catch (error) {
      if (!this.destroyed && generation === this.generation) this.fail(error);
    } finally {
      if (!this.destroyed) this.testing.set(false);
    }
  }
  apply() {
    try {
      this.applied.emit(
        behaviorDraft(this.widget(), this.source(), this.configuration(), this.screen()),
      );
    } catch (error) {
      this.fail(error);
    }
  }
  close() {
    this.dialog().nativeElement.close();
  }
  display(value: unknown) {
    return value === null || value === undefined
      ? '—'
      : typeof value === 'string'
        ? JSON.stringify(value)
        : String(value);
  }
  private fail(error: unknown) {
    this.error.set(
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join(' ')
        : error instanceof Error
          ? error.message
          : 'Behavior operation failed.',
    );
  }
}
