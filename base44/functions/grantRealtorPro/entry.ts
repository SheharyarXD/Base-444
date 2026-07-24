import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update user to have Realtor Pro plan
    await base44.auth.updateMe({ 
      plan: 'realtor_pro',
      plan_activated_date: new Date().toISOString()
    });

    return Response.json({ success: true, message: 'Realtor Pro plan granted' });
  } catch (error) {
    console.error('Error granting Realtor Pro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});