import type { ProductionPrintEvidenceState } from "./productionPrintPlan";

export type WindowsPrintJobStatus =
  | "PAUSED"
  | "ERROR"
  | "DELETING"
  | "SPOOLING"
  | "PRINTING"
  | "OFFLINE"
  | "PAPER_OUT"
  | "PRINTED"
  | "DELETED"
  | "BLOCKED"
  | "USER_INTERVENTION"
  | "RESTARTED"
  | "COMPLETE"
  | "RETAINED";

export type WindowsPrinterStatus =
  | "PAUSED"
  | "PAPER_JAM"
  | "PAPER_OUT"
  | "PAPER_PROBLEM"
  | "OFFLINE"
  | "NOT_AVAILABLE"
  | "USER_INTERVENTION"
  | "DOOR_OPEN"
  | "SERVER_UNKNOWN"
  | "BUSY"
  | "PRINTING"
  | "PROCESSING"
  | "WAITING";

export interface WindowsSpoolerObservation {
  job_exists: boolean;
  submission_rejected_before_job_creation: boolean;
  job_statuses: readonly WindowsPrintJobStatus[];
  printer_statuses: readonly WindowsPrinterStatus[];
}

export interface WindowsSpoolerEvidenceClassification {
  schema: "deliveryos.windows-spooler-evidence.v1";
  evidence: ProductionPrintEvidenceState;
  fiscal_dispatch_ready: boolean;
  blocking_reasons: string[];
  observed_facts: {
    job_exists: boolean;
    job_statuses: WindowsPrintJobStatus[];
    printer_statuses: WindowsPrinterStatus[];
  };
  policy: {
    complete_is_not_printed: true;
    printed_is_not_physical_confirmation: true;
    queue_fault_blocks_fiscal_progress: true;
    missing_job_without_pre_effect_rejection_is_ambiguous: true;
  };
}

const JOB_FAULTS = new Set<WindowsPrintJobStatus>([
  "ERROR",
  "OFFLINE",
  "PAPER_OUT",
  "BLOCKED",
  "USER_INTERVENTION",
]);

const QUEUE_FAULTS = new Set<WindowsPrinterStatus>([
  "PAPER_JAM",
  "PAPER_OUT",
  "PAPER_PROBLEM",
  "OFFLINE",
  "NOT_AVAILABLE",
  "USER_INTERVENTION",
  "DOOR_OPEN",
  "SERVER_UNKNOWN",
]);

function uniqSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

/**
 * Pure translation layer from Windows spooler facts to DeliveryOS evidence.
 *
 * Microsoft distinguishes JOB_STATUS_COMPLETE from JOB_STATUS_PRINTED:
 * COMPLETE can mean transfer to the printer is complete while the physical
 * printing may not be. Therefore COMPLETE alone can never release the fiscal
 * barrier.
 *
 * PRINTED is treated as SPOOLER_OBSERVED, not physical confirmation.
 */
export function classifyWindowsSpoolerObservation(
  observation: WindowsSpoolerObservation,
): WindowsSpoolerEvidenceClassification {
  const jobStatuses = uniqSorted(observation.job_statuses);
  const printerStatuses = uniqSorted(observation.printer_statuses);
  const blocking = new Set<string>();

  if (
    observation.submission_rejected_before_job_creation &&
    !observation.job_exists
  ) {
    return {
      schema: "deliveryos.windows-spooler-evidence.v1",
      evidence: "PROVEN_NO_EFFECT_FAILURE",
      fiscal_dispatch_ready: false,
      blocking_reasons: [],
      observed_facts: {
        job_exists: false,
        job_statuses: jobStatuses,
        printer_statuses: printerStatuses,
      },
      policy: {
        complete_is_not_printed: true,
        printed_is_not_physical_confirmation: true,
        queue_fault_blocks_fiscal_progress: true,
        missing_job_without_pre_effect_rejection_is_ambiguous: true,
      },
    };
  }

  if (!observation.job_exists) {
    blocking.add("NO_JOB_RECORD_EFFECT_UNKNOWN");
  }

  for (const status of jobStatuses) {
    if (JOB_FAULTS.has(status)) {
      blocking.add(`JOB_FAULT:${status}`);
    }
  }
  for (const status of printerStatuses) {
    if (QUEUE_FAULTS.has(status)) {
      blocking.add(`PRINTER_FAULT:${status}`);
    }
  }

  if (blocking.size > 0) {
    return {
      schema: "deliveryos.windows-spooler-evidence.v1",
      evidence: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
      fiscal_dispatch_ready: false,
      blocking_reasons: [...blocking].sort(),
      observed_facts: {
        job_exists: observation.job_exists,
        job_statuses: jobStatuses,
        printer_statuses: printerStatuses,
      },
      policy: {
        complete_is_not_printed: true,
        printed_is_not_physical_confirmation: true,
        queue_fault_blocks_fiscal_progress: true,
        missing_job_without_pre_effect_rejection_is_ambiguous: true,
      },
    };
  }

  if (jobStatuses.includes("PRINTED")) {
    return {
      schema: "deliveryos.windows-spooler-evidence.v1",
      evidence: "SPOOLER_OBSERVED",
      fiscal_dispatch_ready: true,
      blocking_reasons: [],
      observed_facts: {
        job_exists: observation.job_exists,
        job_statuses: jobStatuses,
        printer_statuses: printerStatuses,
      },
      policy: {
        complete_is_not_printed: true,
        printed_is_not_physical_confirmation: true,
        queue_fault_blocks_fiscal_progress: true,
        missing_job_without_pre_effect_rejection_is_ambiguous: true,
      },
    };
  }

  if (
    jobStatuses.includes("COMPLETE") ||
    jobStatuses.includes("PRINTING") ||
    jobStatuses.includes("SPOOLING") ||
    jobStatuses.includes("RESTARTED") ||
    jobStatuses.includes("DELETED")
  ) {
    return {
      schema: "deliveryos.windows-spooler-evidence.v1",
      evidence: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
      fiscal_dispatch_ready: false,
      blocking_reasons: ["JOB_OBSERVED_BUT_PRINTED_NOT_PROVEN"],
      observed_facts: {
        job_exists: observation.job_exists,
        job_statuses: jobStatuses,
        printer_statuses: printerStatuses,
      },
      policy: {
        complete_is_not_printed: true,
        printed_is_not_physical_confirmation: true,
        queue_fault_blocks_fiscal_progress: true,
        missing_job_without_pre_effect_rejection_is_ambiguous: true,
      },
    };
  }

  return {
    schema: "deliveryos.windows-spooler-evidence.v1",
    evidence: "SUBMISSION_RETURNED_UNOBSERVED",
    fiscal_dispatch_ready: false,
    blocking_reasons: ["SPOOLER_PRINT_STATE_NOT_OBSERVED"],
    observed_facts: {
      job_exists: observation.job_exists,
      job_statuses: jobStatuses,
      printer_statuses: printerStatuses,
    },
    policy: {
      complete_is_not_printed: true,
      printed_is_not_physical_confirmation: true,
      queue_fault_blocks_fiscal_progress: true,
      missing_job_without_pre_effect_rejection_is_ambiguous: true,
    },
  };
}
