/**
 * Read-only Windows print source boundary.
 *
 * The concrete Windows binding may use PowerShell/CIM/Win32 later, but this
 * contract exposes observation only. No submit/cancel/pause/resume/delete API.
 */
import type { ObservationSourceMode } from "../simulator";
import type { PrintJobSnapshot, PrintSnapshotSource } from "./observer";

export interface WindowsPrintJobRow {
  source_mode: ObservationSourceMode;
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
  const allowed = new Set([
    WINDOWS_PRINT_DISCOVERY_COMMAND,
    WINDOWS_PRINT_JOBS_COMMAND,
  ]);
  if (!allowed.has(command)) {
    throw new Error("PowerShell command not allowlisted for print source");
  }
}

export function normalizeWindowsPrintRow(
  row: WindowsPrintJobRow,
): PrintJobSnapshot {
  return {
    source_mode: row.source_mode,
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
interface PowerShellPrintJobJson {
  PrinterName?: string;
  ID?: string | number;
  DocumentName?: string;
  JobStatus?: string;
  SubmittedTime?: string;
}

export class PowerShellWindowsPrintSource implements PrintSnapshotSource {
  constructor(
    private readonly runner: ReadOnlyCommandRunner,
    private readonly unitId: string,
    private readonly sourceMode: ObservationSourceMode,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listJobs(): Promise<PrintJobSnapshot[]> {
    assertReadOnlyPrintCommand(WINDOWS_PRINT_JOBS_COMMAND);
    const raw = await this.runner.run(WINDOWS_PRINT_JOBS_COMMAND);
    if (!raw.trim()) return [];

    const parsed = JSON.parse(raw) as PowerShellPrintJobJson | PowerShellPrintJobJson[];
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const observedAt = this.now().toISOString();

    return rows
      .filter((row) => row.PrinterName && row.ID !== undefined)
      .map((row) => normalizeWindowsPrintRow({
        source_mode: this.sourceMode,
        printer_name: row.PrinterName as string,
        queue_name: row.PrinterName as string,
        job_id: row.ID as string | number,
        document_name: row.DocumentName,
        submitted_at: normalizeSubmittedTime(row.SubmittedTime),
        observed_at: observedAt,
        status: row.JobStatus,
        unit_id: this.unitId,
      }));
  }
}

function normalizeSubmittedTime(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}