#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2bf6d918ae11a95efb966af76b7f97d693b99de0aae29350d7646cc13870fc23/contract';
import endContract from '../../snapshots/2bf6d918ae11a95efb966af76b7f97d693b99de0aae29350d7646cc13870fc23/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a8685e053b5e7aa14942138d319283f3b85a45a8b41f686823d07b57c56faa3f/contract';
import startContract from '../../snapshots/a8685e053b5e7aa14942138d319283f3b85a45a8b41f686823d07b57c56faa3f/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'EmailJob',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('html', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('lastError', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lockedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('nextAttemptAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('providerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('sentAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('subject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('to', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'EmailJob_status_check_66feda27',
            sql`"status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED')`,
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'EmailJob',
        index: 'EmailJob_status_nextAttemptAt_idx_8ba20615',
        columns: ['status', 'nextAttemptAt'],
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'EmailJob' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
