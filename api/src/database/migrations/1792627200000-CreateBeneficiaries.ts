import type { MigrationInterface, QueryRunner } from 'typeorm';

/** T-04 — Beneficiary persistence. No users, accounts or seed data are changed. */
export class CreateBeneficiaries1792627200000 implements MigrationInterface {
  name = 'CreateBeneficiaries1792627200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "beneficiaries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "name" text NOT NULL,
        "alias" text NOT NULL,
        "clabe" char(18) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_beneficiaries_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_beneficiaries_user_clabe" UNIQUE ("user_id", "clabe"),
        CONSTRAINT "chk_beneficiaries_clabe_digits" CHECK ("clabe" ~ '^[0-9]{18}$')
      )
    `);

    // The composite unique index also supports lookups filtering by user_id.
    // The application cannot DELETE beneficiary records; it does not own the schema.
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE ON TABLE "beneficiaries" TO treo_app
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping the table destroys data: revert only with explicit approval.
    await queryRunner.query(`DROP TABLE "beneficiaries"`);
  }
}
