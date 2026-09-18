import {
  getLastSuccessfulSyncAt,
  markSyncSuccessful,
} from "@/database/syncMetadataRepository";

export const TARGETED_REFRESH_COOLDOWN_MS = 30_000;

export const FULL_REFERENCE_SYNC_COOLDOWN_MS = 5 * 60_000;

export type GuardedSyncResult<T> =
  | {
      status: "completed";
      data: T;
    }
  | {
      status: "cooldown";
      remainingMs: number;
      lastSuccessAt: string;
    }
  | {
      status: "in_progress";
    };

type RunGuardedSyncOptions<T> = {
  employeeId: number;
  syncKey: string;
  cooldownMs: number;
  task: () => Promise<T>;

  ignoreCooldown?: boolean;
  recordSuccess?: boolean;
};

const activeSyncs = new Set<string>();

export async function runGuardedSync<T>(
  options: RunGuardedSyncOptions<T>,
): Promise<GuardedSyncResult<T>> {
  const {
    employeeId,
    syncKey,
    cooldownMs,
    task,
    ignoreCooldown = false,
    recordSuccess = true,
  } = options;

  validateOptions(employeeId, syncKey, cooldownMs);

  const activeKey = `${employeeId}:${syncKey}`;

  /*
   * Prevent two copies of the same logical sync from running at once.
   *
   * Example:
   * - teacher pulls to refresh twice quickly
   * - Settings Sync button is double tapped
   */
  if (activeSyncs.has(activeKey)) {
    return {
      status: "in_progress",
    };
  }

  if (!ignoreCooldown) {
    const lastSuccessAt = await getLastSuccessfulSyncAt(employeeId, syncKey);

    if (lastSuccessAt) {
      const lastSuccessMs = Date.parse(lastSuccessAt);

      if (Number.isFinite(lastSuccessMs)) {
        const elapsedMs = Date.now() - lastSuccessMs;

        if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
          return {
            status: "cooldown",
            remainingMs: cooldownMs - elapsedMs,
            lastSuccessAt,
          };
        }
      }
    }
  }

  activeSyncs.add(activeKey);

  try {
    const data = await task();

    /*
     * Only callers that own a cooldown record the successful sync timestamp.
     *
     * Manual Settings sync:
     * - recordSuccess = true
     * - starts/resets the 5-minute cooldown
     *
     * Login full sync:
     * - recordSuccess = false
     * - never starts/resets the Settings cooldown
     *
     * Network failures, HTTP failures, and thrown errors are intentionally
     * NOT recorded here, so the user can retry after fixing the connection.
     */
    if (recordSuccess) {
      await markSyncSuccessful(employeeId, syncKey);
    }

    return {
      status: "completed",
      data,
    };
  } finally {
    activeSyncs.delete(activeKey);
  }
}

export function buildEmployeeSyncKey(
  baseKey: string,
  resourceId?: number,
): string {
  const normalizedBaseKey = baseKey.trim();

  if (!normalizedBaseKey) {
    throw new Error("A sync key is required.");
  }

  if (resourceId === undefined) {
    return normalizedBaseKey;
  }

  if (!Number.isInteger(resourceId) || resourceId <= 0) {
    throw new Error("A valid sync resource ID is required.");
  }

  return `${normalizedBaseKey}:${resourceId}`;
}

function validateOptions(
  employeeId: number,
  syncKey: string,
  cooldownMs: number,
): void {
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new Error("A valid employee ID is required for synchronization.");
  }

  if (!syncKey.trim()) {
    throw new Error("A sync key is required.");
  }

  if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
    throw new Error("Sync cooldown must be zero or greater.");
  }
}
