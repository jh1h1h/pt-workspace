import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
});
Range.prototype.getBoundingClientRect = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({})
});
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
HTMLElement.prototype.scrollIntoView = () => {};
// Use Node's AbortSignal with Node's Request; jsdom's signal is a different realm.
import { transferableAbortController } from 'node:util';
const nativeController = transferableAbortController();
Object.assign(globalThis, {
  AbortController: Object.getPrototypeOf(nativeController).constructor,
  AbortSignal: Object.getPrototypeOf(nativeController.signal).constructor
});
Object.defineProperty(document, 'elementFromPoint', {
  value: () => document.querySelector('[contenteditable="true"]'),
  configurable: true
});
