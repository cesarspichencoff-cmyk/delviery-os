import { strict as assert } from "node:assert";
import { observePrintJobs } from "../src/edge/print/observer";
import {
  assertReadOnlyPrintCommand,
  WINDOWS_PRINT_DISCOVERY_COMMAND,
  WINDOWS_PRINT_JOBS_COMMAND,
  WINDOWS_PRINT_SOURCE_CAPABILITIES,
  WindowsPrintReadOnlySource,
} from "../src/edge/print/windowsSource";

async function main(): Promise<void> {
  assert.doesNotThrow(() => assertReadOnlyPrintCommand(WINDOWS_PRINT_DISCOVERY_COMMAND));
  assert.doesNotThrow(() => assertReadOnlyPrintCommand(WINDOWS_PRINT_JOBS_COMMAND));
  assert.throws(
    () => assertReadOnlyPrintCommand("Remove-PrintJob -PrinterName X -ID 1"),
    /mutating PowerShell verb forbidden/,
  );

  const source = new WindowsPrintReadOnlySource(async () => [
    {
      printer_name: "ELGIN L42Pro",
      queue_name: "TATA-OS",
      job_id: 10,
      document_name: "LABEL",
      observed_at: "2026-09-24T23:45:00.000Z",
      status: "Printing",
      unit_id: "0001",
    },
    {
      printer_name: "Kitchen Printer",
      job_id: 11,
      document_name: "COMANDA-7001",
      observed_at: "2026-09-24T23:45:01.000Z",
      status: "Error",
      unit_id: "0001",
    },
  ]);

  const observations = await observePrintJobs(source);
  assert.equal(observations.length, 2);
  assert.equal(observations[0].observation.payload.state, "PRINTING");
  assert.equal(observations[1].observation.payload.state, "ERROR");
  assert.equal(observations[0].physical_effect, "UNKNOWN");
  assert.equal(observations[1].physical_effect, "UNKNOWN");

  assert.deepEqual(WINDOWS_PRINT_SOURCE_CAPABILITIES, [
    "discover_printers",
    "list_print_jobs",
  ]);

  console.log(JSON.stringify({
    status: "PASS",
    discovery_command_read_only: true,
    jobs_command_read_only: true,
    mutation_command_rejected: true,
    physical_success_inferred: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});