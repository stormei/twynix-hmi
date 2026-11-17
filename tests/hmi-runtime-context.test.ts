import '@angular/compiler';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { test } from 'node:test';
import { Injector, signal } from '@angular/core';
import { CommandStateService } from '../apps/editor/src/app/command-state.service';
import { createStarterProject, type Release } from '../packages/model/src';
import { HmiRuntimeContext } from '../apps/editor/src/app/hmi-runtime-context.service';
import { screenConnections } from '../packages/editor/src/screen-presentation';
import { runtimeWidget } from '../packages/editor/src/runtime-appearance';
import { processPorts } from '../packages/editor/src/ports';

function release(): Release {
  const project = createStarterProject();
  project.screens.push({ ...structuredClone(project.screens[0]), id: crypto.randomUUID() });
  return { id: crypto.randomUUID(), publishedAt: new Date().toISOString(), project };
}

test('operator context loads a detached published snapshot without an editor draft', () => {
  const context = new HmiRuntimeContext();
  assert.equal(context.ready(), false);
  const published = release();
  context.openPublished(published);
  assert.equal(context.ready(), true);
  assert.equal(context.mode(), 'runtime');
  assert.equal(context.operatorOnly(), true);
  assert.equal(context.dataSource(), 'live');
  published.project.screens[0].name = 'changed draft';
  assert.notEqual(context.screen().name, 'changed draft');
  assert.throws(() => context.showDraft('edit'), /operator viewer/);
  const sequence = context.transition().sequence;
  context.navigate(published.project.screens[1].id);
  assert.equal(context.screen().id, published.project.screens[1].id);
  assert.equal(context.transition().sequence, sequence + 1);
});

test('editor transitions preserve draft ownership and published runtime separation', () => {
  const context = new HmiRuntimeContext();
  const published = release();
  const draft = signal(structuredClone(published.project.screens[0]));
  let navigated = '';
  context.attachEditor(draft, (id) => {
    navigated = id;
  });
  context.showDraft('preview');
  assert.equal(context.screen(), draft());
  context.navigate('draft-screen');
  assert.equal(navigated, 'draft-screen');
  context.openPublished(published, false);
  context.navigate(published.project.screens[1].id);
  assert.equal(navigated, 'draft-screen');
  draft.update((screen) => ({ ...screen, name: 'Unsaved' }));
  assert.notEqual(context.screen().name, 'Unsaved');
  context.showDraft('edit');
  assert.equal(context.screen(), draft());
  assert.equal(context.operatorOnly(), false);
});

test('shared runtime service graph cannot depend on editor store or authoring shell', () => {
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.doesNotMatch(
      file,
      /(?:editor\.store|app\.component|editor-canvas|editor-workspace|.*\.component)\.ts$/,
    );
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (
        specifier.startsWith('.') &&
        resolve(dirname(file), specifier).includes('/apps/editor/src/app/')
      )
        visit(resolve(dirname(file), specifier + '.ts'));
    }
  }
  for (const name of [
    'context',
    'binding-runtime',
    'behavior-runtime',
    'actions',
    'feedback',
    'viewport',
  ])
    visit(
      resolve(
        'apps/editor/src/app',
        name === 'context' ? 'hmi-runtime-context.service.ts' : `hmi-${name}.service.ts`,
      ),
    );
});

test('shared screen routing consumes runtime widget geometry without modifying the published document', () => {
  const screen = createStarterProject().screens[0];
  const before = structuredClone(screen);
  const link = screen.connections[0];
  assert.ok(link);
  const source = screen.widgets.find((widget) => widget.id === link.from.widgetId)!;
  const moved = runtimeWidget(source, { position: { offsetX: 8, offsetY: 8 } }, screen);
  const widgets = screen.widgets.map((widget) => (widget.id === source.id ? moved : widget));
  const route = screenConnections(screen, widgets).find((route) => route.link.id === link.id)!;
  const port = processPorts(moved).find((port) => port.port === link.from.port)!;
  assert.equal(route.points[0].x, port.x);
  assert.equal(route.points[0].y, port.y);
  assert.deepEqual(screen, before);
});

test('destroying a runtime command scope invalidates an unfinished lazy preparation', async () => {
  const injector = Injector.create({ providers: [CommandStateService] });
  const commands = injector.get(CommandStateService);
  const published = release();
  const screen = published.project.screens[0];
  const preparing = commands.prepare({
    widget: screen.widgets[0],
    screenId: screen.id,
    mode: 'preview',
    event: 'activate',
  });
  assert.equal(commands.busy(), true);
  injector.destroy();
  assert.equal(await preparing, false);
  assert.equal(commands.current(), null);
  assert.equal(commands.pending(), null);
  assert.equal(commands.busy(), false);
});
