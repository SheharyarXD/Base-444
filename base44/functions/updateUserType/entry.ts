import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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