#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b5c6cc21347fc8aec47b1e6a506b13345fac97b3a4135a59a5e1ad51687d98a5/contract';
import endContract from '../../snapshots/b5c6cc21347fc8aec47b1e6a506b13345fac97b3a4135a59a5e1ad51687d98a5/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'Course',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('isPublished', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Module',
        columns: [
          col('accessDays', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('contentUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('isPublished', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('order', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('previewUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('price', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('thumbnailUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Order',
        columns: [
          col('amount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('GHS'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('paidAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('userId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Order_status_check_3b453265',
            sql`"status" IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'PaymentTransaction',
        columns: [
          col('amount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('authorizationCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('channel', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('GHS'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('gatewayResponse', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('orderId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('paidAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('paystackId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('rawResponse', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Purchase',
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
          col('moduleId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('orderId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('userId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'User',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('emailVerificationExpiry', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('emailVerificationToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('emailVerifiedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('firstName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('isEmailVerified', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('lastLoginAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('lastLoginIp', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lastName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('password', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('passwordResetExpiry', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('passwordResetToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('STUDENT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('User_role_check_482f18a5', sql`"role" IN ('STUDENT', 'ADMIN')`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Course',
        constraint: 'Course_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Module',
        constraint: 'Module_courseId_order_key',
        columns: ['courseId', 'order'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Order',
        constraint: 'Order_reference_key',
        columns: ['reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PaymentTransaction',
        constraint: 'PaymentTransaction_reference_key',
        columns: ['reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Purchase',
        constraint: 'Purchase_userId_moduleId_key',
        columns: ['userId', 'moduleId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_emailVerificationToken_key',
        columns: ['emailVerificationToken'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_passwordResetToken_key',
        columns: ['passwordResetToken'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Module',
        index: 'Module_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Order',
        index: 'Order_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PaymentTransaction',
        index: 'PaymentTransaction_orderId_idx_d284871b',
        columns: ['orderId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Purchase',
        index: 'Purchase_moduleId_idx_04fe188b',
        columns: ['moduleId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Purchase',
        index: 'Purchase_orderId_idx_d284871b',
        columns: ['orderId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Purchase',
        index: 'Purchase_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'User',
        index: 'User_role_idx_2c1ddf83',
        columns: ['role'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Module',
        foreignKey: {
          name: 'Module_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Order',
        foreignKey: {
          name: 'Order_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PaymentTransaction',
        foreignKey: {
          name: 'PaymentTransaction_orderId_fkey',
          columns: ['orderId'],
          references: { schema: 'public', table: 'Order', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Purchase',
        foreignKey: {
          name: 'Purchase_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Purchase',
        foreignKey: {
          name: 'Purchase_moduleId_fkey',
          columns: ['moduleId'],
          references: { schema: 'public', table: 'Module', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Purchase',
        foreignKey: {
          name: 'Purchase_orderId_fkey',
          columns: ['orderId'],
          references: { schema: 'public', table: 'Order', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'Course' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'Module' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'Order' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'PaymentTransaction' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'Purchase' }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'User' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
