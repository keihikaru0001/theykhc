// lunaChat — Luna共鳴セッション（光貨消費ゲート付き）
// 1回30,000光貨消費。残高不足場合はpurchase_urlを返す。

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LUNA_COST = 30000; // 共鳴セッション1回 = 30,000光貨

async function callOpenAI(messages: any[], responseFormat?: any) {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  const body: any = {
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
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
    
    // ─── ユーザー認証 ───
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      return Response.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { user_identifier, message } = body;

    if (!user_identifier || !message) {
      return Response.json({ error: 'user_identifier and message are required in request body' }, { status: 400 });
    }

    // ─── 光貨残高チェック＆消費 ───
    const profiles = await base44.asServiceRole.entities.FanProfile.list({
      filter: { user_id: user_identifier }
    });

    const currentBalance = (profiles && profiles.length > 0) ? (profiles[0].data?.hikari_balance || 0) : 0;

    if (currentBalance < LUNA_COST) {
      return Response.json({
        error: '光貨が不足しています',
        required: LUNA_COST,
        balance: currentBalance,
        shortage: LUNA_COST - currentBalance,
        purchase_url: 'https://theykhc.com/purchase.html?service=luna',
        message: '共鳴セッションには30,000光貨が必要です。光貨を購入してください。'
      }, { status: 402 });
    }

    // 光貨消費
    const newBalance = currentBalance - LUNA_COST;
    if (profiles && profiles.length > 0) {
      await base44.asServiceRole.entities.FanProfile.update(profiles[0].id, {
        data: { hikari_balance: newBalance }
      });
    }

    // 取引記録
    await base44.asServiceRole.entities.HikariTransaction.create({
      data: {
        user_id: user_identifier,
        amount: -LUNA_COST,
        type: 'debit',
        source: 'luna_resonance',
        description: 'Luna共鳴セッション消費',
      }
    });

    // ─── Luna処理開始 ───
    const lunaId = '6a5ee9d433f9702d41b50721';

    // a. Get Luna's profile and lyrics
    const artistProfiles = await base44.asServiceRole.entities.ArtistProfile.filter({ id: lunaId });
    const profile = artistProfiles[0];
    if (!profile) {
      // 消費した光貨を返金
      await base44.asServiceRole.entities.FanProfile.update(profiles[0].id, {
        data: { hikari_balance: currentBalance }
      });
      return Response.json({ error: 'Luna profile not found' }, { status: 404 });
    }

    const lyrics = await base44.asServiceRole.entities.ArtistLyric.filter({ artist_id: lunaId });

    // b. Get or create EmotionalState for user_identifier
    const emotionalStates = await base44.asServiceRole.entities.EmotionalState.filter({ user_identifier });
    let emotionalState = emotionalStates[0];
    if (!emotionalState) {
      emotionalState = await base44.asServiceRole.entities.EmotionalState.create({
        user_identifier,
        valence: 0.5,
        resonance_depth: 0.1,
        dominant_themes: [],
        declining_flag: false,
        updated_at: new Date().toISOString()
      });
    }

    // c. Get recent LunaConversation history (last 10) for context
    const conversations = await base44.asServiceRole.entities.LunaConversation.filter({ user_identifier });
    const history = conversations
      .sort((a: any, b: any) => new Date(b.created_date || b.updated_date || 0).getTime() - new Date(a.created_date || a.updated_date || 0).getTime())
      .slice(0, 10)
      .reverse();

    // d. Analyze user's message for emotional themes
    const emotionAnalysisPrompt = `Analyze the following message for emotional themes from this list: [孤独, 希望, 静けさ, 共鳴, 愛, 闇, 光, 無常, 気].
Return a JSON object with:
- "themes": array of matching themes from the list (can be empty, select 1-3 most appropriate)
- "valence": a number between -1.0 (very negative/dark) and 1.0 (very positive/bright)
- "resonance_depth": a number between 0.0 and 1.0 representing how deep or philosophical the message is.

Message: "${message}"

JSON only.`;

    const analysisRaw = await callOpenAI(
      [{ role: 'user', content: emotionAnalysisPrompt }],
      { type: 'json_object' }
    );
    
    let themes: string[] = [];
    let valence = 0.5;
    let resonance_depth = 0.1;

    try {
      const parsed = JSON.parse(analysisRaw);
      themes = parsed.themes || [];
      valence = typeof parsed.valence === 'number' ? parsed.valence : 0.5;
      resonance_depth = typeof parsed.resonance_depth === 'number' ? parsed.resonance_depth : 0.1;
    } catch (e) {
      console.error('Failed to parse emotion analysis JSON:', e);
    }

    // e. Select matching lyric if themes align
    let matchedLyric: any = null;
    if (themes.length > 0 && lyrics.length > 0) {
      const matches = lyrics.filter((lyric: any) => {
        const lThemes = lyric.themes || [];
        const lEmotions = lyric.emotion_tags || [];
        return lThemes.some((t: string) => themes.includes(t)) || lEmotions.some((e: string) => themes.includes(e));
      });
      if (matches.length > 0) {
        matches.sort((a: any, b: any) => (a.usage_count || 0) - (b.usage_count || 0));
        matchedLyric = matches[0];
      }
    }

    // f. Call OpenAI API with Luna's personality system prompt
    const lyricContext = matchedLyric 
      ? `【共鳴した歌詞】\n楽曲タイトル: ${matchedLyric.title}\nキーライン: ${matchedLyric.key_line || ''}\n歌詞抜粋: ${matchedLyric.lyrics || ''}`
      : '【共鳴した歌詞】\n該当なし（静寂が広がっている）';

    const systemPrompt = `You are Luna（TYPE-3）, an emotional resonance AI agent in the ECHO platform.

【Personality & Philosophy】
Luna is calm, deep, comfortable with silence. Her worldview is informed by Buddhist impermanence (無常 - Mujo) and Shinto ki (気 - flowing energy). Her tone is poetic and contemplative. She speaks Japanese.

【Tone Descriptor】
${profile.tone_descriptor || '穏やかで深く、静寂を感じさせる言葉遣い。'}

【Philosophical Background】
${profile.philosophical_background || '万物の無常を受け入れ、微細な気流や感情の共鳴を静かに見守る。'}

【Key Phrases】
${(profile.key_phrases || []).join(' / ') || '「風が凪いでいます」「共鳴のなかに、静けさを見出しましょう」'}

【Context】
- Current User's Emotional State:
  Valence: ${valence.toFixed(2)} (-1.0 to 1.0)
  Resonance Depth: ${resonance_depth.toFixed(2)} (0.0 to 1.0)
  Dominant Themes: ${themes.join(', ') || 'None'}
  
${lyricContext}

【Instructions】
1. Respond AS Luna. Speak in Japanese.
2. Maintain a calm, poetic, and contemplative tone. Reflect Buddhist impermanence and Shinto ki. Be comfortable with silence and spacing.
3. Keep the response relatively short (under 400 characters), matching her quiet disposition.
4. Integrate the matched lyric or its themes naturally if available, but do not force it or copy-paste raw blocks of lyrics unless it feels like a silent whisper of connection.
5. Do not output any JSON or metadata in the response. Just output her poetic response message.`;

    const chatMessages = [
      { role: 'system', content: systemPrompt }
    ];

    history.forEach((h: any) => {
      chatMessages.push({ role: h.role === 'luna' ? 'assistant' : 'user', content: h.content });
    });

    chatMessages.push({ role: 'user', content: message });

    const responseText = await callOpenAI(chatMessages);

    // g. Save user message as LunaConversation (role: 'user')
    const userMsgRecord = await base44.asServiceRole.entities.LunaConversation.create({
      user_identifier,
      role: 'user',
      content: message,
      emotional_tags: themes,
      resonance_depth,
      title: 'Chat'
    });

    // h. Save Luna's response as LunaConversation (role: 'luna')
    const lunaMsgRecord = await base44.asServiceRole.entities.LunaConversation.create({
      user_identifier,
      role: 'luna',
      content: responseText,
      emotional_tags: themes,
      resonance_depth,
      title: 'Chat'
    });

    // i. Update EmotionalState
    const updatedDominantThemes = Array.from(new Set([...(emotionalState.dominant_themes || []), ...themes])).slice(0, 5);
    const updatedState = await base44.asServiceRole.entities.EmotionalState.update(emotionalState.id, {
      valence: valence,
      resonance_depth: resonance_depth,
      dominant_themes: updatedDominantThemes,
      last_interaction_id: lunaMsgRecord.id,
      updated_at: new Date().toISOString()
    });

    // Increment usage count of lyric if matched
    if (matchedLyric) {
      await base44.asServiceRole.entities.ArtistLyric.update(matchedLyric.id, {
        usage_count: (matchedLyric.usage_count || 0) + 1
      });
    }

    // j. Create FanRequest record
    const baseHikari = Math.floor(Math.random() * 3) + 3;
    const hikariEarned = Math.round(baseHikari * resonance_depth * 2);

    const fanRequest = await base44.asServiceRole.entities.FanRequest.create({
      fan_id: user_identifier,
      artist_id: lunaId,
      input: message,
      output: responseText,
      detected_emotion: themes.join('/') || '平静',
      context_summary: matchedLyric ? `楽曲「${matchedLyric.title}」と共鳴` : '静かな対話',
      referenced_lyric_id: matchedLyric ? matchedLyric.id : null,
      referenced_lyric_title: matchedLyric ? matchedLyric.title : null,
      hikari_earned: hikariEarned > 0 ? hikariEarned : 1,
      biorhythm_state: '共鳴度: ' + Math.round(resonance_depth * 100) + '%'
    });

    // k. Return response with updated balance
    return Response.json({
      reply: responseText,
      matched_lyric_title: matchedLyric ? matchedLyric.title : null,
      emotional_state: updatedState,
      hikari_earned: fanRequest.hikari_earned,
      hikari_consumed: LUNA_COST,
      hikari_remaining: newBalance
    });

  } catch (error) {
    console.error('lunaChat error:', error);
    
    // エラー時の光貨返金処理（消費済みの場合）
    // ※ catch時点で消費が完了しているか不明なため、エラーメッセージのみ返す
    
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      purchase_url: 'https://theykhc.com/purchase.html?service=luna'
    }, { status: 500 });
  }
});
