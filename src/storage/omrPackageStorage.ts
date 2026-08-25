import { Directory, File, Paths } from "expo-file-system";

function getOmrDirectory(): Directory {
  return new Directory(Paths.document, "omr", "packages");
}

function getOmrPackageFile(courseTestId: number): File {
  const directory = getOmrDirectory();

  return new File(directory, `${courseTestId}.omr`);
}

async function ensureOmrDirectory(): Promise<void> {
  const directory = getOmrDirectory();

  if (directory.exists) {
    return;
  }

  directory.create({
    intermediates: true,
    idempotent: true,
  });
}

export function getOmrPackagePath(courseTestId: number): string {
  return getOmrPackageFile(courseTestId).uri;
}

export async function saveEncryptedOmrPackage(
  courseTestId: number,
  encryptedBase64: string,
): Promise<string> {
  await ensureOmrDirectory();

  const file = getOmrPackageFile(courseTestId);

  /*
    |--------------------------------------------------------------------------
    | Convert Base64 Ciphertext To Binary
    |--------------------------------------------------------------------------
    */

  const binaryString = atob(encryptedBase64);

  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index++) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  /*
    |--------------------------------------------------------------------------
    | Create / Overwrite .omr
    |--------------------------------------------------------------------------
    */

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
    const file = new File(path);

    return file.exists;
  } catch {
    return false;
  }
}

export async function deleteOmrPackage(courseTestId: number): Promise<void> {
  const file = getOmrPackageFile(courseTestId);

  if (!file.exists) {
    return;
  }

  file.delete();
}
