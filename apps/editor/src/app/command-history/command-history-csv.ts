import type { CommandHistoryEntry, SimulationResult } from '../command-runtime.service';

export const SIMULATION_LABELS: Record<SimulationResult, string> = {
  confirmed: 'Reply + matching value',
  accepted: 'Reply only',
  failed: 'Device failure',
  timeout: 'Timeout / unknown',
};

/** Quote every cell and prevent spreadsheet formula execution in editable text. */
function csvCell(value: string | number | boolean) {
  const text = String(value);
  const safe =
    typeof value === 'string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function jsonValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return value === undefined ? '' : JSON.stringify(value);
}

/** UTF-8 BOM and CRLF rows support spreadsheet imports, including Unicode names. */
export function commandHistoryCsv(entries: readonly CommandHistoryEntry[]): string {
  const rows: (string | number | boolean)[][] = [
    [
      'Time (UTC)',
      'Control',
      'Method',
      'Requested value (JSON)',
      'Simulated outcome',
      'Status',
      'Reported value (JSON)',
      'Quality',
      'Validation / feedback message',
      'Attempt ID',
    ],
  ];
  for (const entry of entries)
    rows.push([
      new Date(entry.recordedAt).toISOString(),
      entry.name,
      entry.method,
      jsonValue(entry.requested),
      entry.simulationResult ? SIMULATION_LABELS[entry.simulationResult] : 'Not simulated',
      entry.phase,
      jsonValue(entry.reported),
      entry.quality,
      entry.message,
      entry.id,
    ]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
