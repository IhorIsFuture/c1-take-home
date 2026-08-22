import { backfillMessageBodyHashes } from '../message-body-hash-backfill';
import type { DatabaseSeed } from '../migrator';

export const up: DatabaseSeed = async () => {
  const backfill = await backfillMessageBodyHashes();
  console.log(JSON.stringify({ messageBodyHashBackfill: backfill }));
};
