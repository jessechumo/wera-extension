import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

// jsdom lacks DataTransfer; a minimal one is enough to attach files.
if (typeof DataTransfer === 'undefined') {
  class FakeDataTransfer {
    private list: File[] = [];
    items = { add: (f: File) => this.list.push(f) };
    get files() {
      const files = this.list;
      const list: Record<number, File> & { length: number; item: (i: number) => File | null } = {
        length: files.length,
        item: (i: number) => files[i] ?? null,
      };
      files.forEach((f, i) => (list[i] = f));
      return list as unknown as FileList;
    }
  }
  (globalThis as unknown as { DataTransfer: unknown }).DataTransfer = FakeDataTransfer;
}

// jsdom only accepts its own FileList on <input type=file>; keep whatever
// the fake DataTransfer produced so tests can read the attached file.
{
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')!;
  Object.defineProperty(HTMLInputElement.prototype, 'files', {
    configurable: true,
    get(this: HTMLInputElement & { _weraFiles?: FileList }) {
      return this._weraFiles ?? (desc.get!.call(this) as FileList);
    },
    set(this: HTMLInputElement & { _weraFiles?: FileList }, v: FileList) {
      this._weraFiles = v;
    },
  });
}

// Blob URLs for the print view.
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:wera-test';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
