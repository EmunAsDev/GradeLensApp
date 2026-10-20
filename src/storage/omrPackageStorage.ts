import { Directory, File, Paths } from "expo-file-system";

import { getActiveDatabaseEmployeeId } from "../database/database";

function requireActiveEmployeeId(): number {
  const employeeId = getActiveDatabaseEmployeeId();

  if (
    employeeId === null ||
    !Number.isSafeInteger(employeeId) ||
    employeeId <= 0
  ) {
    throw new Error(
      "Cannot access OMR package storage without an active faculty database.",
    );
  }

  return employeeId;
}

function getOmrDirectory(employeeId: number): Directory {
  return new Directory(
    Paths.document,
    "omr",
    `employee-${employeeId}`,
    "packages",
  );
}

function getOmrPackageFile(employeeId: number, courseTestId: number): File {
  return new File(getOmrDirectory(employeeId), `${courseTestId}.omr`);
}

async function ensureOmrDirectory(employeeId: number): Promise<void> {
  const directory = getOmrDirectory(employeeId);

  if (!directory.exists) {
    directory.create({
      intermediates: true,
      idempotent: true,
    });
  }
}

export function getOmrPackagePath(courseTestId: number): string {
  if (!Number.isSafeInteger(courseTestId) || courseTestId <= 0) {
    throw new Error("A valid course test ID is required.");
  }

  const employeeId = requireActiveEmployeeId();

  return getOmrPackageFile(employeeId, courseTestId).uri;
}

export async function saveEncryptedOmrPackage(
  courseTestId: number,
  encryptedBase64: string,
): Promise<string> {
  if (!Number.isSafeInteger(courseTestId) || courseTestId <= 0) {
    throw new Error("A valid course test ID is required.");
  }

  // Capture the owner before awaiting any filesystem operation.
  const employeeId = requireActiveEmployeeId();

  await ensureOmrDirectory(employeeId);

  const file = getOmrPackageFile(employeeId, courseTestId);

  const binaryString = atob(encryptedBase64);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index++) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  if (!file.exists) {
    file.create({
      intermediates: true,
    });
  }

  file.write(bytes);

  return file.uri;
}

export async function omrPackageExists(path: string | null): Promise<boolean> {
  if (!path) {
    return false;
  }

  try {
    return new File(path).exists;
  } catch {
    return false;
  }
}

export async function deleteOmrPackage(courseTestId: number): Promise<void> {
  if (!Number.isSafeInteger(courseTestId) || courseTestId <= 0) {
    throw new Error("A valid course test ID is required.");
  }

  const employeeId = requireActiveEmployeeId();
  const file = getOmrPackageFile(employeeId, courseTestId);

  if (file.exists) {
    file.delete();
  }
}
