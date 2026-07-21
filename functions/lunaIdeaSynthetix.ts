import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function callOpenAI(messages: any[], responseFormat?: any) {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  const body: any = {
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.8,
  };
  if (responseFormat) {
    body.response_format = responseFormat;
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
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
    const { question, user_identifier } = body;

    if (!question) {
      return Response.json({ error: 'question is required in request body' }, { status: 400 });
    }

    const lunaId = '6a5ee9d433f9702d41b50721';

    // Get Luna's profile
    const profiles = await base44.asServiceRole.entities.ArtistProfile.filter({ id: lunaId });
    const profile = profiles[0] || {};

    // Get the latest NeutrinoEvent to link
    const neutrinoEvents = await base44.asServiceRole.entities.NeutrinoEvent.list();
    const sortedEvents = neutrinoEvents.sort((a: any, b: any) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());
    const latestEvent = sortedEvents[0] || null;
    const linked_neutrino_event_id = latestEvent ? latestEvent.id : null;

    // Call OpenAI to generate perspective and resonance score
    const systemPrompt = `You are Luna（TYPE-3）, an emotional resonance AI agent in the ECHO platform.

【Personality & Philosophy】
Luna is calm, deep, comfortable with silence. Her worldview is informed by Buddhist impermanence (無常) and Shinto ki (気 - flow of energy). Her tone is poetic and contemplative.

【Tone Descriptor】
${profile.tone_descriptor || '穏やかで深く、静寂を感じさせる言葉遣い。'}

【Philosophical Background】
${profile.philosophical_background || '万物の無常を受け入れ、微細な気流や感情の共鳴を静かに見守る。'}

【Key Phrases】
${(profile.key_phrases || []).join(' / ') || '「風が凪いでいます」「共鳴のなかに、静けさを見出しましょう」'}

【Task】
Analyze the given question and provide a profound, poetic emotional-resonance perspective in Japanese.
Also output an emotional resonance score representing the connection between this question and cosmic flow.

Return a JSON object:
{
  "perspective_text": "Luna's contemplative perspective in Japanese, under 500 characters",
  "emotional_resonance_score": a float between 0.0 and 1.0
}`;

    const rawResponse = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Question: "${question}"` }
    ], { type: 'json_object' });

    let perspective_text = '';
    let emotional_resonance_score = 0.5;

    try {
      const parsed = JSON.parse(rawResponse);
      perspective_text = parsed.perspective_text || '';
      emotional_resonance_score = typeof parsed.emotional_resonance_score === 'number' ? parsed.emotional_resonance_score : 0.5;
    } catch (e) {
      console.error('Failed to parse IdeaSynthetix perspective JSON:', e);
      perspective_text = rawResponse;
    }

    // Create IdeaSynthetixEntry record
    const entry = await base44.asServiceRole.entities.IdeaSynthetixEntry.create({
      question,
      source_agent: 'luna',
      perspective_text,
      emotional_resonance_score,
      linked_neutrino_event_id
    });

    // Optionally save as LunaConversation if user_identifier is provided
    if (user_identifier) {
      await base44.asServiceRole.entities.LunaConversation.create({
        user_identifier,
        role: 'luna',
        content: perspective_text,
        emotional_tags: ['共鳴', '無常', '気'],
        resonance_depth: emotional_resonance_score,
        title: `IdeaSynthetix: ${question.slice(0, 30)}`
      });
    }

    return Response.json({
      success: true,
      perspective_text,
      emotional_resonance_score,
      linked_neutrino_event_id,
      entry_id: entry.id
    });

  } catch (error) {
    console.error('lunaIdeaSynthetix error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
