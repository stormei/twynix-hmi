import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type ReusableComponent,
  type ComponentVersion,
  type ComponentInstance,
  type BindableProperty,
  type PropertyValue,
  bindableProperties,
} from '@twynix/model';
import {
  captureComponent,
  componentNeedsEntity,
  parameterDefault,
} from '../../../../packages/editor/src/components';
import { EditorStore } from './editor.store';
import { ModalDirective } from './modal.directive';
import { DataBrowserComponent } from './data-browser.component';

@Component({
  selector: 'tx-component-library',
  standalone: true,
  imports: [FormsModule, ModalDirective, DataBrowserComponent],
  templateUrl: './component-library.component.html',
  styleUrl: './component-library.component.css',
})
export class ComponentLibraryComponent {
  readonly store = inject(EditorStore);
  readonly properties = bindableProperties;
  readonly draft = signal<ComponentVersion | null>(null);
  readonly editingType = signal<ReusableComponent | null>(null);
  readonly configType = signal<ReusableComponent | null>(null);
  readonly configVersion = signal<ComponentVersion | null>(null);
  readonly error = signal('');
  readonly needsEntity = componentNeedsEntity;
  readonly instance = computed(() => {
    const selected = this.store.selectedWidgets();
    const instance = selected[0]?.component;
    return instance &&
      selected.every((widget) => widget.component?.instanceId === instance.instanceId)
      ? instance
      : null;
  });
  name = '';
  description = '';
  values: Record<string, PropertyValue> = {};
  entityId = '';
  entityType: 'DEVICE' | 'ASSET' = 'DEVICE';
  configInstanceId: string | undefined;
  upgrading = false;
  capture(type?: ReusableComponent) {
    try {
      this.error.set('');
      this.name = type?.name ?? 'New component';
      this.description = type?.description ?? '';
      this.editingType.set(type ?? null);
      const draft = captureComponent(this.store.selectedWidgets(), this.store.screen().connections);
      // Keep stable named inputs when publishing from an existing instance.
      if (type)
        draft.parameters = structuredClone(type.versions.at(-1)!.parameters).filter((parameter) =>
          draft.widgets.some((widget) => widget.id === parameter.widgetId),
        );
      this.draft.set(draft);
    } catch (error) {
      this.error.set(this.message(error));
    }
  }
  parameter(widgetId: string, property: BindableProperty) {
    return this.draft()?.parameters.find(
      (parameter) => parameter.widgetId === widgetId && parameter.property === property,
    );
  }
  expose(widgetId: string, property: BindableProperty, enabled: boolean) {
    this.draft.update((version) => {
      if (!version) return version;
      const widget = version.widgets.find((widget) => widget.id === widgetId)!;
      const parameters = version.parameters.filter(
        (parameter) => !(parameter.widgetId === widgetId && parameter.property === property),
      );
      if (enabled)
        parameters.push({
          name: `input${version.widgets.indexOf(widget) + 1}_${property}`,
          widgetId,
          property,
          value: parameterDefault(widget, property),
        });
      return { ...version, parameters };
    });
  }
  renameInput(widgetId: string, property: BindableProperty, name: string) {
    this.draft.update((version) =>
      version
        ? {
            ...version,
            parameters: version.parameters.map((parameter) =>
              parameter.widgetId === widgetId && parameter.property === property
                ? { ...parameter, name }
                : parameter,
            ),
          }
        : null,
    );
  }
  setDefault(widgetId: string, property: BindableProperty, value: PropertyValue) {
    this.draft.update((version) =>
      version
        ? {
            ...version,
            parameters: version.parameters.map((parameter) =>
              parameter.widgetId === widgetId && parameter.property === property
                ? { ...parameter, value }
                : parameter,
            ),
          }
        : null,
    );
  }
  publish() {
    try {
      this.store.publishComponent(
        this.name.trim(),
        this.description,
        this.draft()!,
        this.editingType()?.id,
      );
      this.draft.set(null);
    } catch (error) {
      this.error.set(this.message(error));
    }
  }
  configure(typeId: string, instanceId?: string) {
    const type = this.store.project().components.find((type) => type.id === typeId);
    if (!type) return;
    const instance = this.store
      .screen()
      .widgets.find((widget) => widget.component?.instanceId === instanceId)?.component;
    const version =
      type.versions.find((version) => version.version === instance?.version) ??
      type.versions.at(-1)!;
    this.error.set('');
    this.values = {
      ...Object.fromEntries(
        version.parameters.map((parameter) => [parameter.name, parameter.value]),
      ),
      ...instance?.values,
    };
    this.entityId = instance?.entity?.entityId ?? '';
    this.entityType = instance?.entity?.entityType ?? 'DEVICE';
    this.configInstanceId = instanceId;
    this.upgrading = false;
    this.configVersion.set(version);
    this.configType.set(type);
  }
  prepareUpgrade() {
    const version = this.configType()!.versions.at(-1)!;
    this.configVersion.set(version);
    this.values = {
      ...Object.fromEntries(
        version.parameters.map((parameter) => [parameter.name, parameter.value]),
      ),
      ...this.values,
    };
    this.upgrading = true;
  }
  assignEntity(entity: NonNullable<ComponentInstance['entity']>) {
    this.entityId = entity.entityId;
    this.entityType = entity.entityType;
  }
  apply() {
    try {
      this.store.placeComponent(
        this.configType()!.id,
        this.values,
        componentNeedsEntity(this.configVersion()!)
          ? { entityId: this.entityId, entityType: this.entityType }
          : null,
        this.configInstanceId,
        this.upgrading,
      );
      this.configType.set(null);
    } catch (error) {
      this.error.set(this.message(error));
    }
  }
  private message(error: unknown) {
    return error instanceof Error && !('issues' in error)
      ? error.message
      : 'Check component names, input names, values and equipment UUID.';
  }
}
