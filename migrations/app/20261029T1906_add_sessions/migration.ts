#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/51b30226b252a492c1f60f8116e9ba3cb5038fbcb23c29a726e24536fdc683e2/contract';
import endContract from '../../snapshots/51b30226b252a492c1f60f8116e9ba3cb5038fbcb23c29a726e24536fdc683e2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d28be38f9aeaba93ea787a2c2d83b93baeb62593446e065560a35da0418fed39/contract';
import startContract from '../../snapshots/d28be38f9aeaba93ea787a2c2d83b93baeb62593446e065560a35da0418fed39/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Session',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lastUsedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('previousTokenHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('rotatedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userAgent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Session',
        constraint: 'Session_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Session',
        constraint: 'Session_previousTokenHash_key',
        columns: ['previousTokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Session',
        foreignKey: {
          name: 'Session_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'Session' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
