import type { MigrationInterface, QueryRunner } from 'typeorm';

/** T-06: PostgreSQL-enforced finality, balanced ledger and append-only audit. */
export class EnforceLedgerAndAuditIntegrity1792800000000 implements MigrationInterface {
  name = 'EnforceLedgerAndAuditIntegrity1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Reassert least privilege; ownership belongs to treo_migrator, not treo_app.
    await queryRunner.query(`
      REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.ledger_entries, public.audit_events
      FROM treo_app
    `);
    await queryRunner.query(`
      REVOKE ALL ON TABLE public.ledger_entries, public.audit_events FROM PUBLIC
    `);

    // Protect all persisted ledger rows. No UPDATE/DELETE is necessary for posting
    // corrections: any future adjustments must be represented by new accounting operations.
    await queryRunner.query(`
      CREATE FUNCTION public.treo_block_ledger_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, public
      AS $function$
      BEGIN
        RAISE EXCEPTION 'Ledger entries are immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'ledger_entries_immutable';
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE TRIGGER treo_block_ledger_update_delete
      BEFORE UPDATE OR DELETE ON public.ledger_entries
      FOR EACH ROW EXECUTE FUNCTION public.treo_block_ledger_mutation()
    `);
    await queryRunner.query(`
      CREATE TRIGGER treo_block_ledger_truncate
      BEFORE TRUNCATE ON public.ledger_entries
      FOR EACH STATEMENT EXECUTE FUNCTION public.treo_block_ledger_mutation()
    `);

    // A finalized transfer is immutable, including its non-status columns.
    // REJECTED is likewise terminal: a rejected instruction cannot be reused.
    await queryRunner.query(`
      CREATE FUNCTION public.treo_block_terminal_transfer_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, public
      AS $function$
      BEGIN
        IF OLD.status IN ('COMPLETED', 'REJECTED') THEN
          RAISE EXCEPTION 'Terminal transfer cannot be changed or deleted'
            USING ERRCODE = '23514', CONSTRAINT = 'terminal_transfer_immutable';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE TRIGGER treo_block_terminal_transfer_update_delete
      BEFORE UPDATE OR DELETE ON public.transfers
      FOR EACH ROW EXECUTE FUNCTION public.treo_block_terminal_transfer_mutation()
    `);

    // Evaluated at transaction COMMIT (or SET CONSTRAINTS ... IMMEDIATE).
    // SELECT the *current* transfer and entries, not the event's old row image:
    // a transaction can insert an intent, insert both entries, then complete it.
    await queryRunner.query(`
      CREATE FUNCTION public.treo_verify_transfer_ledger()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, public
      AS $function$
      DECLARE
        transfer_key uuid;
        current_transfer record;
        entry_count bigint;
        debit_matches bigint;
        credit_matches bigint;
        amount_sum numeric;
      BEGIN
        IF TG_TABLE_NAME = 'transfers' THEN
          transfer_key := NEW.id;
        ELSIF TG_OP = 'DELETE' THEN
          transfer_key := OLD.transfer_id;
        ELSE
          transfer_key := NEW.transfer_id;
        END IF;

        SELECT t.status, t.source_account_id, t.destination_account_id,
               t.amount_cents, t.completed_at
          INTO current_transfer
          FROM public.transfers AS t
          WHERE t.id = transfer_key;

        IF NOT FOUND THEN
          RETURN NULL;
        END IF;

        IF current_transfer.status NOT IN ('COMPLETED', 'REJECTED', 'PENDING_CONFIRMATION') THEN
          RETURN NULL;
        END IF;

        SELECT COUNT(*),
               COUNT(*) FILTER (
                 WHERE e.type = 'DEBIT'
                   AND e.account_id = current_transfer.source_account_id
                   AND e.signed_amount_cents = -current_transfer.amount_cents
               ),
               COUNT(*) FILTER (
                 WHERE e.type = 'CREDIT'
                   AND e.account_id = current_transfer.destination_account_id
                   AND e.signed_amount_cents = current_transfer.amount_cents
               ),
               COALESCE(SUM(e.signed_amount_cents), 0)
          INTO entry_count, debit_matches, credit_matches, amount_sum
          FROM public.ledger_entries AS e
          WHERE e.transfer_id = transfer_key;

        -- OTP-pending or rejected operations must not have accounting entries.
        IF current_transfer.status IN ('REJECTED', 'PENDING_CONFIRMATION') THEN
          IF entry_count <> 0 THEN
            RAISE EXCEPTION 'Non-completed transfer has ledger entries'
              USING ERRCODE = '23514', CONSTRAINT = 'noncompleted_transfer_without_ledger';
          END IF;
          RETURN NULL;
        END IF;

        IF current_transfer.completed_at IS NULL
           OR current_transfer.destination_account_id IS NULL
           OR entry_count <> 2
           OR debit_matches <> 1
           OR credit_matches <> 1
           OR amount_sum <> 0 THEN
          RAISE EXCEPTION 'Completed transfer must have an exact balanced debit and credit'
            USING ERRCODE = '23514', CONSTRAINT = 'completed_transfer_balanced_ledger';
        END IF;
        RETURN NULL;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER treo_verify_transfers_ledger
      AFTER INSERT OR UPDATE ON public.transfers
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.treo_verify_transfer_ledger()
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER treo_verify_entries_ledger
      AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.treo_verify_transfer_ledger()
    `);

    // In addition to role-based denial, block audit mutation even for ordinary
    // DML attempted with the schema-owner role (TRUNCATE fires a statement trigger).
    await queryRunner.query(`
      CREATE FUNCTION public.treo_block_audit_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, public
      AS $function$
      BEGIN
        RAISE EXCEPTION 'Audit events are append-only'
          USING ERRCODE = '23514', CONSTRAINT = 'audit_events_append_only';
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE TRIGGER treo_block_audit_update_delete
      BEFORE UPDATE OR DELETE ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION public.treo_block_audit_mutation()
    `);
    await queryRunner.query(`
      CREATE TRIGGER treo_block_audit_truncate
      BEFORE TRUNCATE ON public.audit_events
      FOR EACH STATEMENT EXECUTE FUNCTION public.treo_block_audit_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SECURITY WARNING: disabling these protections must be explicitly authorized.
    // This migration does not revert/destroy any domain tables or financial data.
    await queryRunner.query('DROP TRIGGER IF EXISTS treo_block_audit_truncate ON public.audit_events');
    await queryRunner.query('DROP TRIGGER IF EXISTS treo_block_audit_update_delete ON public.audit_events');
    await queryRunner.query('DROP FUNCTION IF EXISTS public.treo_block_audit_mutation()');
    await queryRunner.query('DROP TRIGGER IF EXISTS treo_verify_entries_ledger ON public.ledger_entries');
    await queryRunner.query('DROP TRIGGER IF EXISTS treo_verify_transfers_ledger ON public.transfers');
    await queryRunner.query('DROP FUNCTION IF EXISTS public.treo_verify_transfer_ledger()');
    await queryRunner.query('DROP TRIGGER IF EXISTS treo_block_terminal_transfer_update_delete ON public.transfers');
    await queryRunner.query('DROP FUNCTION IF EXISTS public.treo_block_terminal_transfer_mutation()');
    await queryRunner.query('DROP TRIGGER IF EXISTS treo_block_ledger_truncate ON public.ledger_entries');
    await queryRunner.query('DROP TRIGGER IF EXISTS treo_block_ledger_update_delete ON public.ledger_entries');
    await queryRunner.query('DROP FUNCTION IF EXISTS public.treo_block_ledger_mutation()');
    // Intentionally do not restore mutation privileges to the application role.
  }
}
