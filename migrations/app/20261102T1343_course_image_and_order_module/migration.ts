#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c7debe09353e089498e5d32bf26b991ff70ee646136c363bd7cb89dca532595c/contract';
import endContract from '../../snapshots/c7debe09353e089498e5d32bf26b991ff70ee646136c363bd7cb89dca532595c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d8671939913d3883b7cb407c36d0e45d28648a5519cf8122d437d7c4c382d083/contract';
import startContract from '../../snapshots/d8671939913d3883b7cb407c36d0e45d28648a5519cf8122d437d7c4c382d083/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('imageUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Order',
        column: col('moduleId', 'character(24)', {
          codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'Order',
        index: 'Order_moduleId_idx_04fe188b',
        columns: ['moduleId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Order',
        foreignKey: {
          name: 'Order_moduleId_fkey',
          columns: ['moduleId'],
          references: { schema: 'public', table: 'Module', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
