import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Limpiar el DOM después de cada prueba para evitar
// componentes duplicados entre casos de prueba.
afterEach(() => {
  cleanup();
});
