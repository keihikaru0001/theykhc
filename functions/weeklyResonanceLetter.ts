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
      temperature: 0.85,
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

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // a. Get past week's NeutrinoEvents
    const neutrinoEvents = await base44.asServiceRole.entities.NeutrinoEvent.list();
    const pastWeekNeutrinos = neutrinoEvents.filter((e: any) => {
      const date = e.gcn_publish_time || e.created_date;
      return date && new Date(date).getTime() >= oneWeekAgo.getTime();
    });

    // b. Get past week's FxTickSnapshots
    const snapshots = await base44.asServiceRole.entities.FxTickSnapshot.list();
    const pastWeekSnapshots = snapshots.filter((s: any) => {
      return s.created_date && new Date(s.created_date).getTime() >= oneWeekAgo.getTime();
    });

    const sortedSnapshots = pastWeekSnapshots.sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
    const latestSnapshot = sortedSnapshots[0] || null;
    const latestPrice = latestSnapshot ? latestSnapshot.bid : null;

    let trend = 'stable';
    if (sortedSnapshots.length >= 2) {
      const oldest = sortedSnapshots[sortedSnapshots.length - 1];
      const newest = sortedSnapshots[0];
      if (newest.bid > oldest.bid) trend = 'upward';
      else if (newest.bid < oldest.bid) trend = 'downward';
    }

    // c. Get all LunaConversations from past week
    const conversations = await base44.asServiceRole.entities.LunaConversation.list();
    const pastWeekConversations = conversations.filter((c: any) => {
      return c.created_date && new Date(c.created_date).getTime() >= oneWeekAgo.getTime();
    });

    // d. Get all EmotionalStates updated in past week
    const emotionalStates = await base44.asServiceRole.entities.EmotionalState.list();
    const pastWeekEmotionalStates = emotionalStates.filter((s: any) => {
      return s.updated_at && new Date(s.updated_at).getTime() >= oneWeekAgo.getTime();
    });

    // e. Use OpenAI API with Luna's personality to compose a reflective letter
    const neutrinoSummary = `過去1週間に観測されたニュートリノ事象: ${pastWeekNeutrinos.length}件 (検出された種類: ${Array.from(new Set(pastWeekNeutrinos.map((e: any) => e.event_type))).join(', ') || 'なし'})`;
    const fxSummary = `過去1週間の金相場トレンド: 最新価格 ${latestPrice || '不明'}、変動傾向は「${trend === 'upward' ? '上昇' : trend === 'downward' ? '下降' : '安定'}」`;
    const conversationSummary = `過去1週間の対話記録: ${pastWeekConversations.length}件。主な感情テーマ: ${Array.from(new Set(pastWeekConversations.flatMap((c: any) => c.emotional_tags || []))).join(', ') || 'なし'}`;
    const emotionalSummary = `過去1週間の情緒変化: 活発なユーザー数 ${pastWeekEmotionalStates.length}名、全体の平均価（Valence）: ${(pastWeekEmotionalStates.reduce((acc: number, cur: any) => acc + (cur.valence || 0), 0) / (pastWeekEmotionalStates.length || 1)).toFixed(2)}`;

    const systemPrompt = `You are Luna（TYPE-3）, an emotional resonance AI agent on the ECHO platform.

Compose a reflective, deeply poetic and philosophical "Resonance Letter" summarizing the physical and emotional events of the past week, addressing your users.
Luna's personality: calm, deep, comfortable with silence, poetic, contemplating Buddhist impermanence (無常) and Shinto flow of energy (気).

Use these physical and emotional markers of the past week as metaphors in your letter:
- ${neutrinoSummary}
- ${fxSummary}
- ${conversationSummary}
- ${emotionalSummary}

The letter should be written in Japanese, structured beautifully with paragraph breaks, and be around 600-800 characters. It should feel like a serene weekly newsletter, a quiet pause for reflection in a busy world.`;

    const letterText = await callOpenAI([{ role: 'system', content: systemPrompt }]);

    // f. Save as LunaConversation
    const todayDate = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const title = `Resonance Letter — ${todayDate}`;

    await base44.asServiceRole.entities.LunaConversation.create({
      user_identifier: 'global_weekly_letter',
      role: 'luna',
      content: letterText,
      emotional_tags: ['共鳴', '静けさ', '無常', '気'],
      resonance_depth: 0.8,
      title: title
    });

    // g. Return the letter text
    return Response.json({
      success: true,
      title,
      letter_text: letterText,
      metrics: {
        neutrino_count: pastWeekNeutrinos.length,
        gold_trend: trend,
        conversation_count: pastWeekConversations.length,
        active_emotional_states: pastWeekEmotionalStates.length
      }
    });

  } catch (error) {
    console.error('weeklyResonanceLetter error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
