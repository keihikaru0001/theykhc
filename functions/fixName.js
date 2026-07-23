export default async function(req) {
  const { createClientFromRequest } = await import('npm:@base44/sdk@0.8.23');
  const base44 = createClientFromRequest(req);
  
  const db = base44.asServiceRole;
  
  const results = {
    businessProfiles: 0,
    consultationSessions: 0,
    details: []
  };
  
  // Fix BusinessProfile
  try {
    const profiles = await db.entities.BusinessProfile.list({ limit: 100 });
    for (const p of profiles) {
      if (p.founder_name && p.founder_name.includes('義光')) {
        const fixed = p.founder_name.replace(/義光/g, '佳光');
        await db.entities.BusinessProfile.update(p.id, { founder_name: fixed });
        results.businessProfiles++;
        results.details.push(`BusinessProfile ${p.id}: ${p.founder_name} → ${fixed}`);
      }
    }
  } catch (e) {
    results.details.push(`BusinessProfile error: ${e.message}`);
  }
  
  // Fix ConsultationSession
  try {
    const sessions = await db.entities.ConsultationSession.list({ limit: 500 });
    for (const s of sessions) {
      const updates = {};
      let changed = false;
      
      if (s.emotion_layer && s.emotion_layer.includes('義光')) {
        updates.emotion_layer = s.emotion_layer.replace(/義光/g, '佳光');
        changed = true;
      }
      if (s.synthesized_response && s.synthesized_response.includes('義光')) {
        updates.synthesized_response = s.synthesized_response.replace(/義光/g, '佳光');
        changed = true;
      }
      if (s.wisdom_layer && s.wisdom_layer.includes('義光')) {
        updates.wisdom_layer = s.wisdom_layer.replace(/義光/g, '佳光');
        changed = true;
      }
      if (s.research_layer && s.research_layer.includes('義光')) {
        updates.research_layer = s.research_layer.replace(/義光/g, '佳光');
        changed = true;
      }
      if (s.market_layer && s.market_layer.includes('義光')) {
        updates.market_layer = s.market_layer.replace(/義光/g, '佳光');
        changed = true;
      }
      if (s.risk_layer && s.risk_layer.includes('義光')) {
        updates.risk_layer = s.risk_layer.replace(/義光/g, '佳光');
        changed = true;
      }
      if (s.user_message && s.user_message.includes('義光')) {
        updates.user_message = s.user_message.replace(/義光/g, '佳光');
        changed = true;
      }
      
      if (changed) {
        await db.entities.ConsultationSession.update(s.id, updates);
        results.consultationSessions++;
        results.details.push(`ConsultationSession ${s.id}: updated fields [${Object.keys(updates).join(', ')}]`);
      }
    }
  } catch (e) {
    results.details.push(`ConsultationSession error: ${e.message}`);
  }
  
  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
