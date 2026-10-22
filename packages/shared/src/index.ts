/** Tipos y cliente HTTP derivados del contrato normativo specs/openapi.json. */
export type { paths, components, operations } from './generated/api-types.js';
export type { TreoApiClient } from './client.js';
export { createTreoApiClient } from './client.js';

import type { components } from './generated/api-types.js';

export type TreoUser = components['schemas']['User'];
export type TreoAccount = components['schemas']['Account'];
export type TreoBeneficiary = components['schemas']['Beneficiary'];
export type TreoTransfer = components['schemas']['Transfer'];
export type TreoMovement = components['schemas']['Movement'];
export type TreoProblem = components['schemas']['Problem'];
export type TreoCreateTransferRequest = components['schemas']['CreateTransferRequest'];
export type TreoRegisterRequest = components['schemas']['RegisterRequest'];
export type TreoLoginRequest = components['schemas']['LoginRequest'];
