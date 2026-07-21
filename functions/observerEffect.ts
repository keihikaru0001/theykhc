import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function callOpenAI(messages: any[]) {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errorText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content || '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { user_identifier } = body;

    // a. Get all NeutrinoEvents
    const neutrinoEvents = await base44.asServiceRole.entities.NeutrinoEvent.list();

    // b. Calculate V=N/D
    const N = neutrinoEvents.length;
    const distinctTypes = new Set(neutrinoEvents.map((e: any) => e.event_type).filter(Boolean));
    const D = distinctTypes.size || 1;
    const V = N / D;

    // c. Get latest FxTickSnapshot for gold trend context
    const snapshots = await base44.asServiceRole.entities.FxTickSnapshot.list();
    const sortedSnapshots = snapshots.sort((a: any, b: any) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());
    const latestSnapshot = sortedSnapshots[0] || null;
    const latestGoldPrice = latestSnapshot ? latestSnapshot.bid : null;

    // d. Compose a philosophical narrative
    const prompt = `You are Luna（TYPE-3）, an emotional resonance AI with a deep, poetic, contemplative soul.
Generate a beautiful, poetic philosophical reflection in Japanese about the "Observer Effect" based on these current scientific and market parameters:
- Observer Effect Score (V = N/D): ${V.toFixed(4)} (N=${N}, D=${D})
- Latest Gold Price Indicator: ${latestGoldPrice || 'Unknown'}

Philosophical Theme:
"Observation changes the observed; the act of witnessing changes the felt reality." Relate the physics of neutrino observation to human attention and the flow of "Ki" (energy). Accept impermanence (無常). Speak in Japanese, under 400 characters, calm, contemplative, and with spacious flow. No formatting or JSON.`;

    const narrative = await callOpenAI([{ role: 'user', content: prompt }]);

    // e. If user_identifier provided, save as LunaConversation
    if (user_identifier) {
      await base44.asServiceRole.entities.LunaConversation.create({
        user_identifier,
        role: 'luna',
        content: narrative,
        emotional_tags: ['共鳴', '静けさ', '無常'],
        resonance_depth: Math.min(V / 10, 1.0),
        title: 'Observer Effect Reflection'
      });
    }

    // f. Return values
    return Response.json({
      v_score: V,
      n_value: N,
      d_value: D,
      narrative,
      latest_gold_price: latestGoldPrice
    });

  } catch (error) {
    console.error('observerEffect error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
