import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lunaId = '6a5ee9d433f9702d41b50721';
    
    // Get Luna's ArtistProfile
    const profiles = await base44.asServiceRole.entities.ArtistProfile.filter({ id: lunaId });
    const profile = profiles[0];
    if (!profile) {
      return Response.json({ error: 'Luna profile not found' }, { status: 404 });
    }

    // Get all her lyrics
    const lyrics = await base44.asServiceRole.entities.ArtistLyric.filter({ artist_id: lunaId });

    return Response.json({
      profile,
      lyrics
    });
  } catch (error) {
    console.error('getLunaProfile error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
