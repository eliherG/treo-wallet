import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Required for Vitest module augmentation.
  interface Matchers<T> extends TestingLibraryMatchers<T, void> {}
}
