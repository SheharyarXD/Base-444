import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The one sanctioned path for setting user_type. Phase 0 re-audit found (and
// fixed) two client call sites that bypassed this entirely by calling
// base44.auth.updateMe({ user_type }) directly — Onboarding.jsx and
// ThankYou.jsx. Both now call this function instead.
//
// Residual, documented limitation: User.jsonc intentionally has no `rls`
// block (unlike every other entity here) because a self-only `read`/`update`
// rule would break legitimate cross-user reads that already exist elsewhere
// in this app (e.g. BookingDetail.jsx reads the *accepted contractor's*
// User row client-side to show their business name — not their own row).
// That means the generic entities API's row-level RLS can't be used to stop
// a determined actor from calling base44.auth.updateMe({ user_type: ... })
// (or { role: 'admin' } — the Base44 SDK's own documented example shows
// `role` as a writable field via that endpoint) directly from a browser
// console with a valid session, bypassing this function's guard entirely.
// auth.updateMe() is a distinct platform endpoint from the generic entities
// API this repo's `rls` blocks govern, so there is no in-repo way to close
// this further — it would need a Base44 platform capability (e.g. a
// server-only/field-locked flag for role/user_type) that doesn't exist
// today. Mitigation applied: every client call site that could pass these
// fields has been removed; this is the only remaining legitimate path.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Account type is fixed at signup and cannot be changed afterward — the
    // only legitimate caller of this function is the signup/onboarding flow,
    // before user_type has ever been set.
    if (user.user_type) {
      return Response.json({ error: 'Account type cannot be changed after signup.' }, { status: 403 });
    }

    const { user_type } = await req.json();

    if (!user_type || !['Homeowner', 'Realtor', 'Business Owner', 'Contractor', 'Handyman'].includes(user_type)) {
      return Response.json({ error: 'Invalid user type' }, { status: 400 });
    }

    await base44.asServiceRole.entities.User.update(user.id, { user_type });

    return Response.json({ success: true, user_type });
  } catch (error) {
    console.error('Failed to update user type:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});