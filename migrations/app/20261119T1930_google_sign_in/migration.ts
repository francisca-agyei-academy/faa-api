#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/13e6a309f2cdd08a9e75d290ba3f7ee6ba6cf2b9c6aca39d0c984cd4d75366e4/contract';
import endContract from '../../snapshots/13e6a309f2cdd08a9e75d290ba3f7ee6ba6cf2b9c6aca39d0c984cd4d75366e4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/2bf6d918ae11a95efb966af76b7f97d693b99de0aae29350d7646cc13870fc23/contract';
import startContract from '../../snapshots/2bf6d918ae11a95efb966af76b7f97d693b99de0aae29350d7646cc13870fc23/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('googleId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_googleId_key',
        columns: ['googleId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
