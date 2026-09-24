import { strict as assert } from "node:assert";
import {
  PowerShellWindowsPrintSource,
  WINDOWS_PRINT_JOBS_COMMAND,
} from "../src/edge/print/windowsSource";

async function main(): Promise<void> {
  let receivedCommand = "";
  const source = new PowerShellWindowsPrintSource(
    {
      async run(command: string) {
        receivedCommand = command;
        return JSON.stringify([
          {
            PrinterName: "ELGIN L42Pro",
            ID: 41,
            DocumentName: "LABEL",
            JobStatus: "Printing",
            SubmittedTime: "2026-09-25T00:10:00.000Z",
          },
        ]);
      },
    },
    "0001",
    () => new Date("2026-09-25T00:10:01.000Z"),
  );

  const rows = await source.listJobs();
  assert.equal(receivedCommand, WINDOWS_PRINT_JOBS_COMMAND);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].job_id, "41");
  assert.equal(rows[0].state, "PRINTING");
  assert.equal(rows[0].unit_id, "0001");
  assert.equal(rows[0].observed_at, "2026-09-25T00:10:01.000Z");

  console.log(JSON.stringify({
    status: "PASS",
    injected_runner_only: true,
    read_only_command_used: true,
    powershell_json_normalized: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});