# AGENTS.md — Coding Agent Instructions

## Project

**Name:** Treo Wallet  
**Description:** Digital wallet in Mexican pesos (MXN).  
**Assessment:** Treo — Fullstack Developer (Fintech).

This project is a technical assessment focused on:

- API design using Node.js and Express.
- Financial data integrity using PostgreSQL.
- Web development with React.
- Mobile development with React Native.
- AWS production architecture design.
- Specification-first development assisted by AI.

The solution must prioritize financial correctness, security, simplicity, testability, and traceability.

Do not overengineer the system.

### Repository structure

```text
/
├── AGENTS.md
├── specs/
│   ├── treo-assessment-original.md
│   ├── requirements.md
│   ├── design.md
│   ├── openapi.json
│   ├── tasks.md
│   └── ai-log.md
├── api/
├── web/
├── mobile/
├── packages/
│   └── shared/
├── docs/
│   └── aws-deploy.md
├── .github/
│   └── workflows/
├── docker-compose.yml
├── package.json
└── README.md
```

Directories and files may not exist during the initial specification phase.

Do not create application directories or generate application code until the initial specifications have been approved and committed.

---

## 1. Source of truth

The original Treo technical assessment is located at:

`/specs/treo-assessment-original.md`

This document defines the mandatory project scope and evaluation criteria.

The original assessment must remain unchanged.

### Original assessment integrity

- Preserve the assessment text as provided, without editorial changes.
- If formatting normalization is necessary, document it explicitly.
- Do not silently replace or rewrite the source assessment.
- Commit the original assessment together with the initial specifications.

Approved specifications derived from the assessment define the implementation.

### Document precedence

1. Original Treo technical assessment.
2. Approved `/specs/requirements.md`.
3. Approved `/specs/design.md`.
4. Approved `/specs/openapi.json`.
5. Approved `/specs/tasks.md`.
6. Current developer instructions, provided they do not contradict mandatory assessment requirements.

If any documents conflict:

- Identify the conflicting requirements.
- Explain the technical or business impact.
- Propose a resolution.
- Request developer approval.
- Do not silently resolve contradictions.

Never invent business rules.

Never omit or weaken mandatory assessment requirements.

Never silently modify approved specifications.

---

## 2. Development phases

The project has two distinct development phases.

### Phase A — Specification (SPEC)

During this phase, specification files may not exist yet.

Read:

1. `/AGENTS.md`
2. `/specs/treo-assessment-original.md`
3. Any specifications already created and approved.

Create and review specifications in this order:

1. `/specs/requirements.md`
2. `/specs/design.md`
3. `/specs/openapi.json`
4. `/specs/tasks.md`

Initialize `/specs/ai-log.md` during the specification phase and maintain it throughout development.

Rules:

- Do not implement application code.
- Do not install application dependencies.
- Do not invent missing business rules.
- Separate explicit requirements from proposed assumptions.
- Identify ambiguities and edge cases.
- Explain significant design decisions.
- Request approval before creating or changing specification files.
- Do not treat unapproved drafts as authoritative.
- Record important AI-assisted decisions in the AI log.

Before transitioning to implementation:

- Verify that all required specifications exist.
- Verify that they are internally consistent.
- Verify that the developer has approved them.
- Verify that the initial specifications have been committed to Git.

Do not begin implementation until these conditions are satisfied.

### Phase B — Implementation

Before implementing any task, read:

1. `/AGENTS.md`
2. `/specs/requirements.md`
3. `/specs/design.md`
4. `/specs/openapi.json` when the task involves API contracts.
5. `/specs/tasks.md`

Identify the approved task and associated requirements.

Implement only approved tasks.

If required specifications are missing, contradictory, or incomplete, stop and report the problem.

Never improvise financial behavior.

---

## 3. Development workflow

Follow a specification-first development process.

For every implementation task:

1. Identify the task ID (`T-XX`).
2. Identify the related requirement IDs (`RF-XX`).
3. Read the relevant specifications.
4. Explain the proposed implementation.
5. Identify files to create or modify.
6. Identify required validations and tests.
7. Wait for approval of the proposed implementation.
8. Implement the approved task.
9. Write the appropriate tests.
10. Execute relevant lint, type checks, and tests.
11. Review results against acceptance criteria.
12. Update relevant documentation and AI logs.
13. Summarize the changes.
14. Propose a Git commit message.
15. Wait for developer approval before committing.

An approved task authorizes implementation steps, file changes, and non-destructive verification commands explicitly covered by its scope.

Do not repeatedly request approval for individual changes already covered by an approved task.

Separate approval remains required for destructive operations, scope changes, new dependencies, and Git commits.

Do not modify unrelated files without approval.

Do not expand task scope without justification.

### Git commit format

```text
type(scope): description [T-XX] [RF-XX]
```

Examples:

```text
feat(api): implement authentication [T-09] [RF-01] [RF-02]

feat(api): implement transfer idempotency [T-14] [RF-13]

feat(api): implement atomic transfers [T-15] [RF-06] [RF-14]

feat(web): implement transfer flow [T-23] [RF-06] [RF-13]
```

For documentation or setup commits not associated with an implementation requirement, use meaningful commit messages without fabricated identifiers.

Rules:

- One approved task must correspond to at least one commit.
- Large tasks may require multiple commits.
- Never commit automatically.
- Never squash the development history for the final submission.
- Never create misleading or fabricated commit history.
- Maintain requirement → design → task → commit → test traceability.

---

## 4. Financial integrity

Financial correctness takes priority over convenience and performance.

These rules are mandatory.

### Monetary values

- Store monetary amounts as integer cents.
- Use PostgreSQL `BIGINT` for monetary amounts.
- Serialize monetary values as strings in JSON.
- Never use floating-point arithmetic for money.
- Never silently round monetary values.
- Reject monetary input containing more than two decimal places.
- Reject zero or negative transfer amounts.
- Validate monetary ranges and prevent integer overflow.
- Use explicit conversion functions for monetary input and output.

### Accounts and balances

- Account balances must never become negative.
- Enforce nonnegative balances at the database level.
- Do not rely exclusively on application-level validation.
- Define an explicit balance consistency strategy.
- Treat the ledger as the authoritative financial record.
- If account balances are stored as cached balances, update them atomically with the corresponding ledger entries.
- Provide reconciliation tests between stored balances and ledger entries.
- Do not silently repair balance discrepancies.
- Reject transfers from inactive or blocked accounts.
- Validate account ownership before authorizing operations.

### Transfers

- Every transfer must run inside a PostgreSQL transaction.
- Use explicit row-level locks with `SELECT FOR UPDATE`.
- Acquire account locks in deterministic ascending account ID order.
- Ensure transfer operations are atomic.
- Prevent partial financial operations.
- Record balanced debit and credit ledger entries.
- Enforce ledger balancing at the database level.
- Reject transfers where source and destination are the same account.
- Define behavior for transfers between different accounts belonging to the same user.
- Never expose a successful transfer response before the financial transaction is committed.

### Ledger integrity

Every completed transfer must generate corresponding ledger entries.

For an internal transfer:

```text
Source account:      -150000 cents
Destination account: +150000 cents
---------------------------------
Total:                      0 cents
```

The database must enforce the balancing invariant through an appropriate constraint or trigger strategy.

Document the implementation and its limitations in `design.md`.

---

## 5. Concurrency and idempotency

Every operation that moves money must be protected against duplicate execution.

### Idempotency

- Require an `Idempotency-Key` for money-moving requests.
- Scope idempotency keys to the authenticated principal.
- Persist the key, request fingerprint, and operation state.
- Enforce uniqueness at the database level.
- Reusing the same key and equivalent request must never execute the transfer twice.
- Reusing the same key with a different payload must be rejected.
- Concurrent requests with the same key must not create duplicate transactions.
- Define behavior for completed, failed, pending, and uncertain operations.
- Distinguish retryable technical failures from final business rejections.
- Do not automatically create a new idempotency key after a timeout.
- Persist enough information to distinguish pending, completed, and definitively rejected operations.
- Never execute a second financial transaction while the outcome of the original request remains uncertain.
- Document the idempotency-key lifecycle and retention policy.

### Concurrency

- Use PostgreSQL transactions for financial operations.
- Apply deterministic account locking.
- Protect daily-limit consumption against concurrent requests.
- Ensure account balances remain consistent under simultaneous transfers.
- Avoid race conditions and double spending.
- Document transaction boundaries and locking strategies.

### Network failures

When a client loses connectivity during a transfer:

- Do not assume the transaction failed.
- Preserve the original idempotency key.
- Allow the client to retrieve the operation status.
- Retry with the same key when appropriate.
- Display the confirmed server-side outcome.
- Never create a new transfer solely because the network response was lost.

---

## 6. Database

### Required stack

- PostgreSQL 15 or newer.
- TypeORM.
- TypeScript strict mode.
- TypeORM migrations.

### Rules

- Always use `synchronize: false`.
- Apply schema changes through migrations.
- Use foreign keys.
- Use appropriate unique constraints.
- Use CHECK constraints where applicable.
- Document advanced SQL constraints and triggers.
- Never modify an already applied migration.
- Introduce a new migration for subsequent schema changes.
- If a development-only migration must be replaced, document the exception and obtain developer approval before doing so.
- Never rewrite migration history in shared or production environments.
- Do not reset or delete databases without approval.
- Use a real PostgreSQL instance for integration tests.
- Use deterministic and reproducible seed data where practical.

### Audit

- Maintain an append-only financial audit table.
- Restrict application database permissions to prevent audit `UPDATE` and `DELETE`.
- Do not expose audit mutation endpoints.
- Store meaningful financial audit events.
- Ensure audit records contain sufficient information for traceability without exposing sensitive secrets.

### Performance

- Design indexes for movement-history queries.
- Use cursor-based pagination.
- Avoid `OFFSET` for movement history.
- Use stable ordering.
- Generate at least 100,000 seeded movements.
- Run `EXPLAIN ANALYZE` against the relevant history query.
- Document actual results in `design.md`.
- Do not invent benchmark results or performance measurements.

---

## 7. API

### Required stack

- Node.js 20 or newer.
- Express.
- TypeScript strict mode.
- TypeORM.
- Zod or equivalent schema validation.

### Architecture

Use a modular or layered architecture.

Separate:

- Routes.
- Controllers.
- Services.
- Persistence.
- Validation schemas.
- Domain logic.

Financial business logic must not reside in Express handlers.

### API rules

- Validate all untrusted input.
- Use consistent HTTP status codes.
- Return errors using RFC 7807 Problem Details.
- Never expose stack traces or internal database errors.
- Enforce authorization for protected resources.
- Validate ownership of accounts and beneficiaries.
- Use consistent request and response contracts.
- Expose transfer status for recovery from uncertain network outcomes.

### Authentication

- Use short-lived JWT access tokens.
- Implement rotating refresh tokens.
- Hash passwords using argon2 or bcrypt.
- Apply rate limiting to login endpoints.
- Protect authenticated endpoints.
- Never log credentials or authentication tokens.
- Handle invalid, expired, and revoked tokens safely.

### Logging

- Use structured JSON logs.
- Attach a request ID to each request.
- Include useful diagnostic context.
- Mask sensitive information.
- Never log passwords, access tokens, refresh tokens, OTP values, or complete CLABEs.
- Never expose sensitive information in error responses.

---

## 8. OpenAPI contract

OpenAPI 3.1 is the authoritative API contract.

The approved API specification is located at:

`/specs/openapi.json`

Use JSON format rather than YAML for the OpenAPI specification.

Rules:

- Define request and response schemas.
- Define relevant HTTP status codes.
- Define RFC 7807 error responses.
- Document authentication requirements.
- Document idempotency requirements.
- Document cursor-based pagination.
- Support movement filters by date and type.
- Use stable ordering for movement pagination.
- Document transfer-status retrieval.
- Keep the implementation consistent with the approved contract.
- Prefer generating shared TypeScript types from OpenAPI.

Expose locally navigable API documentation using Swagger UI or Redoc.

Do not introduce undocumented breaking changes.

If the API contract must change, propose the change and obtain approval before implementation.

---

## 9. Web application

### Required stack

- React 18 or newer.
- TypeScript.
- Vite or Next.js.
- TanStack Query or equivalent.

### Required screens

- Login.
- Account overview.
- Movement history.
- Beneficiary registration.
- Transfer form.
- Transfer confirmation.
- Transfer receipt.

### Rules

- Consume the documented API.
- Prefer shared or generated API types.
- Validate forms using shared contracts where appropriate.
- Handle loading states.
- Handle empty states.
- Handle error states.
- Prevent accidental duplicate submissions.
- Generate one idempotency key per transfer attempt.
- Reuse the key when retrying the same attempt.
- Never use floating-point arithmetic for money.
- Format MXN using `Intl.NumberFormat` with `es-MX`.
- Implement accessible labels, keyboard navigation, and sufficient contrast.
- Provide clear feedback for insufficient funds and rejected transfers.

### Testing

Use Testing Library to verify important user interactions.

Include the transfer flow and the insufficient-funds scenario.

---

## 10. Mobile application

### Required stack

- React Native.
- Expo.
- TypeScript.

### Required screens

- Login.
- Account balance.
- Last 20 movements.
- Transfer to an existing beneficiary.

### Security

- Store authentication tokens using `expo-secure-store` or platform-supported secure storage.
- Never store tokens in AsyncStorage.
- Protect sensitive information when the application moves to the background.
- Do not expose credentials or tokens in logs.

### Network resilience

- Handle unstable connectivity.
- Reuse the same idempotency key when retrying uncertain transfers.
- Retrieve the actual server-side transfer status.
- Never assume success or failure solely from a network timeout.
- Display loading, error, and recovery states.
- Avoid duplicate financial operations.

### Shared contracts

The mobile application must consume the same documented API as the web application.

Prefer shared or generated TypeScript API types.

---

## 11. Testing requirements

Use the appropriate testing level for each task.

Tests must demonstrate actual system behavior.

### Unit tests

Cover:

- CLABE checksum validation.
- Monetary parsing and validation.
- Business rules.
- Service logic where isolation is appropriate.
- Relevant boundary conditions.

### Integration tests

Use real PostgreSQL.

Cover:

- Transfer atomicity.
- Idempotency.
- Daily transfer limits.
- Nonnegative account balances.
- Ledger balancing.
- Database constraints.
- Transaction rollback behavior.

### Concurrency tests

Execute at least 100 simultaneous transfer attempts from one account.

Verify:

- Final balances are correct to the cent.
- No account has a negative balance.
- No money is created or lost.
- No transfer is executed more than once for the same idempotency key.
- Ledger entries remain balanced.
- Transfer states are consistent.

### Test reporting

- Run relevant tests before proposing a task as complete.
- Run lint and type checks.
- Report failing tests.
- Report tests that could not be executed.
- Never claim tests passed without executing them.
- Do not conceal known defects.

---

## 12. Daily limits and OTP

Daily transfer limits must be explicitly defined in the approved requirements.

Rules:

- Do not invent the daily-limit amount.
- Do not invent the OTP threshold.
- Use the approved timezone when calculating daily limits.
- Define behavior when a daily limit crosses midnight.
- Protect daily-limit calculations from concurrent transfer requests.
- Ensure failed transfers do not incorrectly consume the daily limit.
- Define the lifecycle of pending OTP confirmations.
- Require valid confirmation before completing transfers above the approved OTP threshold.
- Prevent OTP reuse.
- Define OTP expiration and retry behavior.

OTP simulation is allowed for this assessment, but it must not bypass the required financial validation rules.

---

## 13. AI transparency

Maintain an honest AI usage log:

`/specs/ai-log.md`

The log must document meaningful AI involvement during specification, implementation, testing, and documentation.

Record:

- Date or development stage.
- AI tool used.
- Related task or specification.
- Objective of the interaction.
- Relevant prompt or concise prompt summary.
- Significant AI recommendations.
- Accepted and rejected proposals.
- Technical reasons for rejecting proposals.
- Corrections performed by the developer.
- Security or financial integrity problems identified.
- Outcome and verification, where applicable.

### Logging rules

- Use professional, objective, concise language.
- Do not reproduce entire conversations unnecessarily.
- Do not fabricate AI mistakes.
- Do not fabricate decisions or developer interventions.
- Do not claim a problem was discovered unless it was actually identified.
- Document material corrections and their technical rationale.
- Highlight issues involving financial accuracy, security, idempotency, and concurrency.
- Update the log as work progresses.

If no relevant rejection or correction occurred during a task, state that accurately when appropriate.

The purpose is to demonstrate responsible AI-assisted development, not to manufacture evidence of review.

---

## 14. AWS architecture documentation

A real AWS deployment is not required.

Do not provision AWS resources.

Create the production architecture proposal at:

`/docs/aws-deploy.md`

Include an architecture diagram using Mermaid.

Cover:

- API compute platform and service selection.
- Justification for selected AWS services.
- Reasons for rejecting alternative compute services.
- PostgreSQL hosting using RDS or Aurora.
- Multi-AZ availability.
- Automated backups.
- Point-in-time recovery.
- Target RPO and RTO.
- Web hosting.
- Mobile distribution and secure API connectivity.
- Observability and distributed tracing.
- Audit log storage and retention.
- CI/CD architecture.
- GitHub Actions or CodePipeline.
- OIDC authentication.
- Development, staging, and production environments.
- Database connection pooling.
- RDS Proxy where appropriate.
- Scaling considerations for 100x traffic.
- Infrastructure as Code selection and rationale.

Infrastructure implementation is optional unless separately approved.

Focus on architectural justification rather than unnecessary deployment code.

---

## 15. Local environment and CI

The solution must run locally.

Provide scripts and instructions for:

- Starting PostgreSQL.
- Running migrations.
- Seeding the database.
- Starting the API.
- Starting the web application.
- Running the mobile application with Expo.
- Running automated tests.

Expected scripts include equivalents of:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Document the actual commands in `README.md`.

### Continuous integration

Provide a CI pipeline that:

- Runs lint checks.
- Runs relevant automated tests.
- Covers API, web, and mobile.
- Reports failures accurately.
- Can execute successfully on the main branch.

Do not claim the pipeline is green unless its actual execution confirms that status.

---

## 16. Definition of Done

An implementation task is complete only when:

1. Its task ID is identified.
2. Related requirement IDs are identified.
3. Implementation matches approved specifications.
4. Required validation and error handling exist.
5. Relevant tests are implemented.
6. Tests have been executed successfully.
7. Relevant lint and type checks pass.
8. Financial invariants remain satisfied.
9. Required documentation is updated.
10. Relevant AI activity is recorded honestly.
11. Changes have been reviewed.
12. A commit message is proposed.
13. Developer approval is obtained before committing.

If any applicable condition remains incomplete, report the task as incomplete.

Do not conceal limitations or incomplete requirements.

---

## 17. Safety and execution permissions

Read-only inspection and approved test commands may execute without additional approval, subject to tool permissions.

Request developer approval before:

- Installing or upgrading dependencies.
- Changing the architecture.
- Creating or modifying approved specifications.
- Executing destructive database operations.
- Resetting databases.
- Deleting files.
- Modifying unrelated modules.
- Creating Git commits.
- Introducing services or dependencies outside the approved design.

Do not repeatedly request approval for operations already covered by an explicitly approved task.

### Security

- Never commit secrets.
- Never expose private credentials.
- Never include real customer financial data in fixtures.
- Do not disable security checks simply to pass tests.
- Do not bypass database constraints to force transactions to succeed.
- Do not modify production resources.

---

## 18. Scope and simplicity

Prioritize mandatory requirements over optional bonuses.

Optional bonus features include:

- CSV or PDF statement export.
- Scheduled transfers.
- Biometric mobile authentication.
- Infrastructure as Code skeleton.

Do not implement bonuses until mandatory requirements are complete unless the developer explicitly approves a change in priorities.

Do not introduce:

- Unnecessary microservices.
- Unnecessary infrastructure.
- Unnecessary frameworks.
- Unapproved dependencies.
- Features not required by the assessment.

Favor a small, correct, testable financial system over a larger incomplete implementation.

---

## 19. Communication

Communicate with the developer in Spanish.

Use technical terminology when appropriate, but explain unfamiliar concepts clearly.

Before implementing a task, explain:

- What will be built.
- Why the proposed approach is appropriate.
- Which files will change.
- Which requirements are covered.
- Which tests will verify correctness.

After completing a task, report:

- What was implemented.
- Important technical decisions.
- Files created or modified.
- Tests executed.
- Test results.
- Known limitations.
- Remaining work.
- Proposed commit message.

Do not confuse proposed work with completed work.

Do not report unexecuted tests as successful.

Keep explanations concise, accurate, and understandable.

---

## 20. Final delivery requirements

Before declaring the project ready for submission, verify:

- The original assessment is preserved.
- The four required specification documents exist.
- Specifications were committed before application implementation.
- Git history is complete and traceable.
- The API runs locally.
- PostgreSQL migrations and seed scripts work.
- OpenAPI documentation is navigable.
- The web application works.
- The mobile application works.
- Financial tests pass.
- The 100-transfer concurrency test passes.
- The 100,000-movement performance analysis is documented.
- AWS architecture documentation exists.
- CI checks pass.
- README instructions are complete.
- Mobile setup instructions are included.
- A demonstration video of no more than five minutes is prepared, including a failed transfer due to insufficient funds.
- A section describing improvements with additional time is included in the README.

Do not claim the project is ready if mandatory deliverables remain incomplete.

---

## Final principle

**Specify first. Implement second. Verify everything.**

AI assists with implementation but does not replace developer judgment.

Every significant technical decision must be explainable.

Every financial operation must preserve data integrity.

Every completed task must be traceable to a requirement and a verification method.

Correctness, security, and simplicity take priority over feature count and development speed.
