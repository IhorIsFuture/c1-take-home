import { afterAll, beforeEach } from 'vitest';
import { closeTestStores, resetTestState } from './database/reset-test-state';

beforeEach(resetTestState);
afterAll(closeTestStores);
