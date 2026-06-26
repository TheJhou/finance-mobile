// Mock expo-file-system for unit testing

const files: Map<string, { exists: boolean }> = new Map();

export const documentDirectory = "/mock/documents";

export async function getInfoAsync(path: string): Promise<{ exists: boolean }> {
  return { exists: files.has(path) };
}

export async function moveAsync(options: { from: string; to: string }): Promise<void> {
  if (files.has(options.from)) {
    files.set(options.to, { exists: true });
    files.delete(options.from);
  }
}

export async function copyAsync(options: { from: string; to: string }): Promise<void> {
  if (files.has(options.from)) {
    files.set(options.to, { exists: true });
  }
}

export async function deleteAsync(path: string): Promise<void> {
  files.delete(path);
}

export function makeDirectoryAsync(_path: string): Promise<void> {
  return Promise.resolve();
}

export function readDirectoryAsync(_path: string): Promise<string[]> {
  return Promise.resolve([]);
}

export function resetFileSystemMock(): void {
  files.clear();
}
