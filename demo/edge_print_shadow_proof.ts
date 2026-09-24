import { strict as assert } from "node:assert";
import {
  observePrintJobs,
  PRINT_OBSERVER_CAPABILITIES,
} from "../src/edge/print/observer";

async function main(): Promise<void> {
  const observations = await observePrintJobs({
    listJobs() {
      return [
        {
          queue_name: "TEKNISA-KITCHEN",
          printer_name: "Kitchen Printer",
          job_id: "501",
          document_name: "COMANDA-7001",
          submitted_at: "2026-09-24T18:00:05.000Z",
          observed_at: "2026-09-24T18:00:06.000Z",
          state: "QUEUED" as const,
          unit_id: "0001",
        },
        {
          queue_name: "TATA-OS",
          printer_name: "ELGIN L42Pro",
          job_id: "9001",
          document_name: "LABEL",
          submitted_at: "2026-09-24T18:05:00.000Z",
          observed_at: "2026-09-24T18:05:01.000Z",
          state: "PRINTING" as const,
          unit_id: "0001",
        },
      ];
    },
  });

  assert.equal(observations.length, 2);
  assert.equal(observations[0].physical_effect, "UNKNOWN");
  assert.equal(observations[1].physical_effect, "UNKNOWN");
  assert.equal(observations[0].observation.kind, "print_job");

  assert.deepEqual(PRINT_OBSERVER_CAPABILITIES, [
    "list_jobs",
    "observe_job_state",
  ]);

  // Disappearance from a queue still does not prove paper came out correctly.
  const disappeared = await observePrintJobs({
    listJobs() {
      return [
        {
          queue_name: "TEKNISA-KITCHEN",
          printer_name: "Kitchen Printer",
          job_id: "501",
          observed_at: "2026-09-24T18:00:10.000Z",
          state: "NO_LONGER_LISTED" as const,
          unit_id: "0001",
        },
      ];
    },
  });
  assert.equal(disappeared[0].physical_effect, "UNKNOWN");

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        observation_only: true,
        print_control_methods: 0,
        physical_success_inferred: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
