import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function callOpenAI(messages: any[], responseFormat?: any) {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  const body: any = {
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.1,
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
    const { user_identifier, emotional_tags, resonance_depth, valence } = body;

    if (!user_identifier) {
      return Response.json({ error: 'user_identifier is required' }, { status: 400 });
    }

    // Get current state
    const emotionalStates = await base44.asServiceRole.entities.EmotionalState.filter({ user_identifier });
    const existingState = emotionalStates[0];

    // Determine declining flag
    let declining_flag = false;

    // Fetch last 3 LunaConversations of role 'user'
    const conversations = await base44.asServiceRole.entities.LunaConversation.filter({ user_identifier, role: 'user' });
    const sortedConversations = conversations.sort((a: any, b: any) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());

    if (sortedConversations.length >= 2 && valence !== undefined) {
      const messagesToAnalyze = [
        sortedConversations[1]?.content || '',
        sortedConversations[0]?.content || '',
      ].filter(Boolean);

      if (messagesToAnalyze.length >= 2) {
        // Analyze emotional trend
        const prompt = `Analyze if there is a declining trend in emotional valence (user is becoming more negative, sad, isolated, or depressed) across these user messages, ordered from oldest to newest:
${messagesToAnalyze.map((msg, i) => `${i + 1}. "${msg}"`).join('\n')}
Current valence input: ${valence} (range: -1.0 to 1.0, where lower is more negative)

Return a JSON object:
{ "is_declining": true/false }`;

        const analysisRaw = await callOpenAI(
          [{ role: 'user', content: prompt }],
          { type: 'json_object' }
        );
        try {
          const parsed = JSON.parse(analysisRaw);
          declining_flag = !!parsed.is_declining;
        } catch (e) {
          console.error('Failed to parse declining analysis:', e);
        }
      }
    }

    let updatedState;
    if (existingState) {
      const mergedThemes = Array.from(new Set([...(existingState.dominant_themes || []), ...(emotional_tags || [])])).slice(0, 5);
      updatedState = await base44.asServiceRole.entities.EmotionalState.update(existingState.id, {
        valence: valence !== undefined ? valence : existingState.valence,
        resonance_depth: resonance_depth !== undefined ? resonance_depth : existingState.resonance_depth,
        dominant_themes: mergedThemes,
        declining_flag,
        updated_at: new Date().toISOString()
      });
    } else {
      updatedState = await base44.asServiceRole.entities.EmotionalState.create({
        user_identifier,
        valence: valence !== undefined ? valence : 0.5,
        resonance_depth: resonance_depth !== undefined ? resonance_depth : 0.1,
        dominant_themes: emotional_tags || [],
        declining_flag,
        updated_at: new Date().toISOString()
      });
    }

    return Response.json(updatedState);

  } catch (error) {
    console.error('trackEmotionalState error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
