// Mock expo-file-system for unit testing (new API: File, Directory, Paths)

const fileStore: Map<string, { content: string; exists: boolean }> = new Map();
const dirStore: Set<string> = new Set();

function resolveUri(uris: (string | MockFile | MockDirectory)[]): string {
  return uris
    .map((u) => (typeof u === 'string' ? u : u.uri))
    .join('/')
    .replace(/\/+/g, '/');
}

class MockDirectory {
  readonly uri: string;

  constructor(...uris: (string | MockFile | MockDirectory)[]) {
    this.uri = resolveUri(uris);
  }

  get exists(): boolean {
    return dirStore.has(this.uri);
  }

  create(options?: { intermediates?: boolean; idempotent?: boolean }): void {
    if (this.exists && !options?.idempotent) return;
    dirStore.add(this.uri);
  }

  list(): (MockDirectory | MockFile)[] {
    const prefix = this.uri.endsWith('/') ? this.uri : this.uri + '/';
    const items: (MockDirectory | MockFile)[] = [];
    for (const path of fileStore.keys()) {
      if (path.startsWith(prefix)) {
        const rest = path.slice(prefix.length);
        if (!rest.includes('/')) {
          items.push(new MockFile(path));
        }
      }
    }
    return items;
  }

  get name(): string {
    return this.uri.split('/').pop() || '';
  }
}

class MockFile {
  readonly uri: string;

  constructor(...uris: (string | MockFile | MockDirectory)[]) {
    this.uri = resolveUri(uris);
  }

  get exists(): boolean {
    return fileStore.has(this.uri);
  }

  async text(): Promise<string> {
    return fileStore.get(this.uri)?.content ?? '';
  }

  write(content: string, _options?: { encoding?: string }): void {
    fileStore.set(this.uri, { content, exists: true });
  }

  delete(): void {
    fileStore.delete(this.uri);
  }

  move(destination: MockFile | MockDirectory): void {
    const entry = fileStore.get(this.uri);
    if (entry) {
      const destUri = destination instanceof MockFile ? destination.uri : destination.uri;
      fileStore.set(destUri, { ...entry });
      fileStore.delete(this.uri);
    }
  }

  copy(destination: MockFile | MockDirectory): void {
    const entry = fileStore.get(this.uri);
    if (entry) {
      const destUri = destination instanceof MockFile ? destination.uri : destination.uri;
      fileStore.set(destUri, { ...entry });
    }
  }

  get name(): string {
    return this.uri.split('/').pop() || '';
  }

  get size(): number {
    return fileStore.get(this.uri)?.content?.length ?? 0;
  }

  info(): { exists: boolean; uri?: string; size?: number } {
    return { exists: this.exists, uri: this.uri, size: this.size };
  }
}

const Paths = {
  document: new MockDirectory('/mock/documents'),
  cache: new MockDirectory('/mock/cache'),
  bundle: new MockDirectory('/mock/bundle'),
};

export { MockDirectory as Directory, MockFile as File, Paths };

export function resetFileSystemMock(): void {
  fileStore.clear();
  dirStore.clear();
}
