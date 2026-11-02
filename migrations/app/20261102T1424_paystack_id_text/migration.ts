#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/c7debe09353e089498e5d32bf26b991ff70ee646136c363bd7cb89dca532595c/contract';
import startContract from '../../snapshots/c7debe09353e089498e5d32bf26b991ff70ee646136c363bd7cb89dca532595c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/faa9ff5d85b47ab41cf108f310d46f849c9b4cb7ac19b1d343b2bc05b94584ce/contract';
import endContract from '../../snapshots/faa9ff5d85b47ab41cf108f310d46f849c9b4cb7ac19b1d343b2bc05b94584ce/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.alterColumnType({
        schema: 'public',
        table: 'PaymentTransaction',
        column: 'paystackId',
        type: 'text',
        operationClass: 'widening',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
