import type { MigrationInterface, QueryRunner } from 'typeorm';

/** T-05 — Structural constraints only. T-06 adds deferred ledger integrity triggers. */
export class CreateFinancialSchema1792713600000 implements MigrationInterface {
  name = 'CreateFinancialSchema1792713600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transfers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sender_user_id" uuid NOT NULL,
        "source_account_id" uuid NOT NULL,
        "destination_account_id" uuid NULL,
        "beneficiary_id" uuid NULL,
        "kind" text NOT NULL,
        "amount_cents" bigint NOT NULL,
        "concept" text NOT NULL,
        "reference" text NOT NULL,
        "idempotency_key" text NOT NULL,
        "payload_hash" text NOT NULL,
        "status" text NOT NULL DEFAULT 'PROCESSING',
        "rejection_code" text NULL,
        "requires_otp" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz NULL,
        CONSTRAINT "fk_transfers_sender" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_transfers_source" FOREIGN KEY ("source_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_transfers_destination" FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_transfers_beneficiary" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_transfers_sender_idempotency" UNIQUE ("sender_user_id", "idempotency_key"),
        CONSTRAINT "chk_transfers_amount_positive" CHECK ("amount_cents" > 0),
        CONSTRAINT "chk_transfers_kind" CHECK ("kind" IN ('BENEFICIARY', 'OWN_ACCOUNTS')),
        CONSTRAINT "chk_transfers_status" CHECK ("status" IN ('PROCESSING', 'PENDING_CONFIRMATION', 'COMPLETED', 'REJECTED')),
        CONSTRAINT "chk_transfers_different_accounts" CHECK ("source_account_id" IS DISTINCT FROM "destination_account_id"),
        CONSTRAINT "chk_transfers_concept" CHECK (char_length(btrim("concept")) BETWEEN 1 AND 140),
        CONSTRAINT "chk_transfers_reference" CHECK ("reference" ~ '^[0-9]{1,7}$'),
        CONSTRAINT "chk_transfers_idempotency_key" CHECK (char_length(btrim("idempotency_key")) > 0),
        CONSTRAINT "chk_transfers_payload_hash" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_transfers_destination_kind" CHECK (
          ("kind" = 'OWN_ACCOUNTS' AND "beneficiary_id" IS NULL AND "destination_account_id" IS NOT NULL)
          OR ("kind" = 'BENEFICIARY' AND "beneficiary_id" IS NOT NULL)
        ),
        CONSTRAINT "chk_transfers_completed_at" CHECK (
          ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
          OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_transfers_sender_created_at" ON "transfers"
        ("sender_user_id", "created_at" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "transfer_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "type" text NOT NULL,
        "signed_amount_cents" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_ledger_entries_transfer" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_ledger_entries_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_ledger_entries_transfer_type" UNIQUE ("transfer_id", "type"),
        CONSTRAINT "chk_ledger_entries_signed_amount" CHECK (
          ("type" = 'DEBIT' AND "signed_amount_cents" < 0)
          OR ("type" = 'CREDIT' AND "signed_amount_cents" > 0)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_ledger_entries_account_time_id" ON "ledger_entries"
        ("account_id", "created_at" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "daily_transfer_usage" (
        "user_id" uuid NOT NULL,
        "business_date" date NOT NULL,
        "spent_cents" bigint NOT NULL DEFAULT 0,
        CONSTRAINT "pk_daily_transfer_usage" PRIMARY KEY ("user_id", "business_date"),
        CONSTRAINT "fk_daily_transfer_usage_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_daily_transfer_usage_range" CHECK ("spent_cents" BETWEEN 0 AND 2000000)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "otp_challenges" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "transfer_id" uuid NOT NULL,
        "code_hash" text NOT NULL,
        "failed_attempts" integer NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        CONSTRAINT "fk_otp_challenges_transfer" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_otp_challenges_transfer" UNIQUE ("transfer_id"),
        CONSTRAINT "chk_otp_challenges_attempts" CHECK ("failed_attempts" BETWEEN 0 AND 3),
        CONSTRAINT "chk_otp_challenges_hash_nonempty" CHECK (char_length("code_hash") > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_user_id" uuid NULL,
        "transfer_id" uuid NULL,
        "action" text NOT NULL,
        "metadata_sanitized" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "request_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_audit_events_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_audit_events_transfer" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_audit_events_action_nonempty" CHECK (char_length(btrim("action")) > 0),
        CONSTRAINT "chk_audit_events_metadata_object" CHECK (jsonb_typeof("metadata_sanitized") = 'object')
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_events_transfer_created_at" ON "audit_events"
        ("transfer_id", "created_at" DESC)
    `);

    // No schema ownership and no DELETE for the app role. Ledger/audit are append-only
    // for treo_app already; T-06 will add DB-level terminal-state and ledger triggers.
    await queryRunner.query(`GRANT SELECT, INSERT, UPDATE ON TABLE "transfers", "daily_transfer_usage", "otp_challenges" TO treo_app`);
    await queryRunner.query(`GRANT SELECT, INSERT ON TABLE "ledger_entries", "audit_events" TO treo_app`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Destructive rollback; only use after explicit developer authorization.
    await queryRunner.query(`DROP TABLE "audit_events"`);
    await queryRunner.query(`DROP TABLE "otp_challenges"`);
    await queryRunner.query(`DROP TABLE "daily_transfer_usage"`);
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP TABLE "transfers"`);
  }
}
