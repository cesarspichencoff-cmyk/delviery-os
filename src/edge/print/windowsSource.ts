/**
 * Read-only Windows print source boundary.
 *
 * The concrete Windows binding may use PowerShell/CIM/Win32 later, but this
 * contract exposes observation only. No submit/cancel/pause/resume/delete API.
 */
import type { PrintJobSnapshot, PrintSnapshotSource } from "./observer";

export interface WindowsPrintJobRow {
  printer_name: string;
  queue_name?: string;
  job_id: string | number;
  document_name?: string;
  owner_pseudonym?: string;
  submitted_at?: string;
  observed_at: string;
  status?: string;
  unit_id: string;
}

export interface ReadOnlyCommandRunner {
  run(command: string): Promise<string>;
}

export const WINDOWS_PRINT_DISCOVERY_COMMAND = [
  "Get-Printer |",
  "Select-Object Name,DriverName,PortName,PrinterStatus |",
  "ConvertTo-Json -Depth 4",
].join(" ");

export const WINDOWS_PRINT_JOBS_COMMAND = [
  "Get-Printer | ForEach-Object {",
  "$p=$_.Name;",
  "Get-PrintJob -PrinterName $p -ErrorAction SilentlyContinue |",
  "Select-Object @{N='PrinterName';E={$p}},ID,DocumentName,JobStatus,SubmittedTime",
  "} | ConvertTo-Json -Depth 5",
].join(" ");

export function assertReadOnlyPrintCommand(command: string): void {
  const forbidden = /\b(Set|Remove|Restart|Stop|Start|Suspend|Resume|Clear|Add)-/i;
  if (forbidden.test(command)) {
    throw new Error("mutating PowerShell verb forbidden in print source");
  }
}

export function normalizeWindowsPrintRow(
  row: WindowsPrintJobRow,
): PrintJobSnapshot {
  return {
    queue_name: row.queue_name ?? row.printer_name,
    printer_name: row.printer_name,
    job_id: String(row.job_id),
    document_name: row.document_name,
    owner_pseudonym: row.owner_pseudonym,
    submitted_at: row.submitted_at,
    observed_at: row.observed_at,
    state: normalizeStatus(row.status),
    unit_id: row.unit_id,
  };
}

export class WindowsPrintReadOnlySource implements PrintSnapshotSource {
  constructor(private readonly rows: () => Promise<WindowsPrintJobRow[]>) {}

  async listJobs(): Promise<PrintJobSnapshot[]> {
    return (await this.rows()).map(normalizeWindowsPrintRow);
  }
}

function normalizeStatus(status?: string): PrintJobSnapshot["state"] {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("error")) return "ERROR";
  if (normalized.includes("paused")) return "PAUSED";
  if (normalized.includes("delet")) return "DELETING";
  if (normalized.includes("print")) return "PRINTING";
  return "QUEUED";
}

export const WINDOWS_PRINT_SOURCE_CAPABILITIES = Object.freeze([
  "discover_printers",
  "list_print_jobs",
] as const);