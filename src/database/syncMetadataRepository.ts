import { getDatabase } from "@/database/database";

export type SyncMetadataRow = {
  employee_id: number;
  sync_key: string;
  last_success_at: string;
};

export async function getLastSuccessfulSyncAt(
  employeeId: number,
  syncKey: string,
): Promise<string | null> {
  validateSyncIdentity(employeeId, syncKey);

  const db = await getDatabase();

  const row = await db.getFirstAsync<SyncMetadataRow>(
    `
      SELECT
        employee_id,
        sync_key,
        last_success_at

      FROM sync_metadata

      WHERE employee_id = ?
        AND sync_key = ?

      LIMIT 1
    `,
    [employeeId, syncKey],
  );

  return row?.last_success_at ?? null;
}

export async function markSyncSuccessful(
  employeeId: number,
  syncKey: string,
  completedAt = new Date().toISOString(),
): Promise<void> {
  validateSyncIdentity(employeeId, syncKey);

  if (Number.isNaN(Date.parse(completedAt))) {
    throw new Error("Sync completion timestamp must be a valid date.");
  }

  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO sync_metadata (
        employee_id,
        sync_key,
        last_success_at
      )

      VALUES (?, ?, ?)

      ON CONFLICT(
        employee_id,
        sync_key
      )

      DO UPDATE SET
        last_success_at = excluded.last_success_at
    `,
    [employeeId, syncKey, completedAt],
  );
}

export async function clearSyncMetadataForEmployee(
  employeeId: number,
): Promise<void> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new Error("A valid employee ID is required.");
  }

  const db = await getDatabase();

  await db.runAsync(
    `
      DELETE FROM sync_metadata
      WHERE employee_id = ?
    `,
    [employeeId],
  );
}

function validateSyncIdentity(employeeId: number, syncKey: string): void {
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new Error("A valid employee ID is required for sync metadata.");
  }

  if (!syncKey.trim()) {
    throw new Error("A sync key is required.");
  }
}
