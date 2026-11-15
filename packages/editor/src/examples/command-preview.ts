import { actionSchema, newWidget, type Widget, type ControlValue } from '../../../model/src';
const DEMO_DEVICE = '00000000-0000-0000-0000-000000000000';

/** No bindings, no real target, and an enforced Preview-only command policy. */
export function createCommandPreviewWidgets(): Widget[] {
  const widgets: Widget[] = [];
  const note = (
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    content: string,
  ) => {
    const widget = {
      ...newWidget('markdown', widgets.length),
      name,
      x,
      y,
      width,
      height,
      dashboard: { type: 'markdown' as const, content },
    };
    widgets.push(widget);
    return widget;
  };
  const heading = {
    ...newWidget('label', 0),
    name: 'Preview lab heading',
    text: 'Command mapping · Preview lab',
    x: 48,
    y: 36,
    width: 1184,
    height: 50,
  };
  widgets.push(heading);
  note(
    'How to use the lab',
    48,
    104,
    1184,
    156,
    '## Safe local practice\n\nChange a control, review the resolved parameters, and choose a simulated result. These examples never send a device command, even if published.\n\n- In Design, select a control and open Actions to inspect its saved rules or test a custom value.\n- Reply only demonstrates a reported-value timeout. Device failure and Timeout demonstrate failure feedback.',
  );
  const mapped = (
    widget: Widget,
    method: string,
    parameter: string,
    valueType: 'number' | 'boolean' | 'string',
    allowedValues: ControlValue[] = [],
  ) => {
    widget.action = actionSchema.parse({
      type: 'command',
      deviceId: DEMO_DEVICE,
      method,
      params: { line: 'preview-lab' },
      confirmation: `Simulate ${widget.name}? No command will be sent.`,
      policy: {
        previewOnly: true,
        mapping: {
          parameter,
          valueType,
          minimum: valueType === 'number' ? 10 : null,
          maximum: valueType === 'number' ? 80 : null,
          step: valueType === 'number' ? 5 : null,
          allowedValues,
        },
        timeoutMs: 5000,
        authorities: ['TENANT_ADMIN'],
        feedback: { timeoutMs: 2000, tolerance: 0 },
      },
    });
    widgets.push(widget);
  };
  mapped(
    {
      ...newWidget('slider', 0),
      name: 'Speed setpoint',
      text: 'Speed setpoint',
      x: 48,
      y: 300,
      width: 352,
      height: 144,
      demoValue: 30,
      dashboard: { type: 'slider', minimum: 0, maximum: 100, step: 5, unit: 'rpm' },
    },
    'setSpeed',
    'speed',
    'number',
  );
  mapped(
    {
      ...newWidget('toggle', 0),
      name: 'Pump enable',
      text: 'Pump enable',
      x: 448,
      y: 300,
      width: 320,
      height: 144,
      demoValue: 0,
      dashboard: { type: 'toggle', onLabel: 'Enabled', offLabel: 'Stopped' },
    },
    'setEnabled',
    'enabled',
    'boolean',
    [true, false],
  );
  mapped(
    {
      ...newWidget('dropdown', 0),
      name: 'Operating mode',
      text: 'Operating mode',
      x: 816,
      y: 300,
      width: 416,
      height: 144,
      demoValue: 0,
      dashboard: {
        type: 'dropdown',
        options: [
          { label: 'Manual', value: 'manual' },
          { label: 'Automatic', value: 'auto' },
          { label: 'Maintenance · rejected example', value: 'maintenance' },
        ],
      },
    },
    'setMode',
    'mode',
    'string',
    ['manual', 'auto'],
  );
  note(
    'Speed command rules',
    48,
    476,
    352,
    180,
    '## Speed command\n\nMaps the slider value into speed.\n\n- Allowed: 10–80 rpm, in steps of 5.\n- Try 35 for a valid request.\n- Try 95 to see validation reject it.',
  );
  note(
    'Enable command rules',
    448,
    476,
    320,
    180,
    '## Enable command\n\nMaps the toggle into enabled as a boolean.\n\n- Toggle on, then simulate a matching reported value.\n- Choose Device failure or Timeout to try other outcomes.',
  );
  note(
    'Mode command rules',
    816,
    476,
    416,
    180,
    '## Mode command\n\nMaps the selected value into mode.\n\n- Manual and Automatic are allowed.\n- Maintenance is deliberately rejected by the command allowlist.',
  );
  note(
    'Inspect and experiment',
    48,
    692,
    1184,
    72,
    'Use Design → select a control → Actions → Preview test to try invalid types, steps or a different simulated authority. No ThingsBoard connection is needed.',
  );
  return widgets;
}
