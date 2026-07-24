import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_type } = await req.json();
    
    if (!user_type || !['Homeowner', 'Realtor', 'Business Owner', 'Contractor', 'Handyman'].includes(user_type)) {
      return Response.json({ error: 'Invalid user type' }, { status: 400 });
    }

    // Use service role to update the user record directly
    const users = await base44.asServiceRole.entities.User.filter({ id: user.id });
    
    if (users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    await base44.asServiceRole.entities.User.update(users[0].id, { user_type });
    
    return Response.json({ success: true, user_type });
  } catch (error) {
    console.error('Failed to update user type:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});