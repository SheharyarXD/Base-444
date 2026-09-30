import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// One-off (but safely repeatable) migration that moves provider licence
// numbers and EINs off the publicly readable Contractor record and into
// ContractorVerification, whose read policy is limited to the owning provider
// and admins.
//
// Why a migration is required at all: changing the Contractor schema does not
// remove values already stored on existing rows. A code-only change would
// leave every current provider's licence number and tax identifier exactly
// where they were — readable by anyone signed in — while making the app look
// fixed. So this explicitly nulls both fields on each row rather than relying
// on the schema edit to do it.
//
// Safety properties:
//   - Admin-only. A normal signed-in user cannot run it.
//   - Idempotent. Re-running copies nothing new and simply confirms the public
//     record is clear, so it is safe to run again to verify.
//   - Copy-then-clear, per provider. The private row is written and read back
//     before the public fields are cleared, so a failure midway can never
//     destroy a licence number that was not successfully copied.
//   - Supports a dry run, so the scope of the change can be inspected before
//     anything is written.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Only an administrator can run this migration.' }, { status: 403 });
    }

    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
    } catch {
      // No body is fine — defaults to performing the migration.
    }

    const contractors = await base44.asServiceRole.entities.Contractor.list();

    const report = {
      dryRun,
      scanned: contractors.length,
      needingMigration: 0,
      copied: 0,
      cleared: 0,
      alreadyClean: 0,
      failed: [] as Array<{ id: string; error: string }>,
    };

    for (const contractor of contractors) {
      const license = contractor.license_number || '';
      const ein = contractor.ein_number || '';

      if (!license && !ein) {
        report.alreadyClean += 1;
        continue;
      }
      report.needingMigration += 1;
      if (dryRun) continue;

      try {
        const email = contractor.created_by;
        if (!email) {
          report.failed.push({ id: contractor.id, error: 'Contractor row has no owner email; cannot scope private record.' });
          continue;
        }

        const existing = await base44.asServiceRole.entities.ContractorVerification.filter({
          contractor_email: email,
        });

        const payload = {
          contractor_id: contractor.id,
          contractor_email: email,
          // Never overwrite a value already captured by a real submission with
          // an older one carried on the public row.
          license_number: existing[0]?.license_number || license,
          ein_number: existing[0]?.ein_number || ein,
          submitted_at: contractor.verification_submitted_date || new Date().toISOString(),
        };

        let privateId: string;
        if (existing.length > 0) {
          await base44.asServiceRole.entities.ContractorVerification.update(existing[0].id, payload);
          privateId = existing[0].id;
        } else {
          const created = await base44.asServiceRole.entities.ContractorVerification.create(payload);
          privateId = created?.id;
        }
        report.copied += 1;

        // Read back before clearing. Clearing the public copy is destructive,
        // so it only happens once the private copy is confirmed present.
        const verify = await base44.asServiceRole.entities.ContractorVerification.get(privateId);
        if (!verify || (license && verify.license_number !== payload.license_number)) {
          report.failed.push({ id: contractor.id, error: 'Private record did not read back correctly; public fields left untouched.' });
          continue;
        }

        await base44.asServiceRole.entities.Contractor.update(contractor.id, {
          license_number: null,
          ein_number: null,
        });
        report.cleared += 1;
      } catch (err) {
        report.failed.push({ id: contractor.id, error: err?.message || String(err) });
      }
    }

    return Response.json({ success: report.failed.length === 0, report });
  } catch (error) {
    console.error('Error in migrateVerificationDetails:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
