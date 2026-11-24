import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom does not implement the native dialog methods.
if (!HTMLDialogElement.prototype.showModal) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { value(this: HTMLDialogElement) { this.open = true; } },
    close: { value(this: HTMLDialogElement) { this.open = false; } },
  });
}
