import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function callOpenAI(messages: any[], temperature = 0.8, maxTokens = 1500) {
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
    body: JSON.stringify({ model: 'gpt-4o', messages, temperature, max_tokens: maxTokens }),
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
    const { message, business_profile_id, industry, stage, challenge_summary } = body;

    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    const businessContext = `業界: ${industry || '一般'}
ステージ: ${stage || 'idea'}
事業課題: ${challenge_summary || '（未設定）'}`;

    // ============================================
    // LAYER 1: 研究の層 — IdeaSynthetix
    // ============================================
    let researchLayer = '';
    try {
      const allSeeds = await base44.asServiceRole.entities.SeedRecord.list();
      const allQuestions = await base44.asServiceRole.entities.Question.list();

      const topicLower = message.toLowerCase();
      const relatedSeeds = allSeeds.filter(s =>
        (s.title + ' ' + (s.abstract || '') + ' ' + (s.keywords || []).join(' '))
          .toLowerCase().includes(topicLower.split(' ')[0])
      ).slice(0, 2);

      const seedContext = relatedSeeds.length > 0
        ? '【関連論文】\n' + relatedSeeds.map(s => `- ${s.title}: ${(s.abstract || '').slice(0, 300)}`).join('\n')
        : '';

      const researchPrompt = `あなたは起業家の事業アドバイザーです。以下の相談に対して、学術的知見と実務的アプローチを統合した回答をしてください。

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

${seedContext}

以下の構成で回答してください（日本語、600〜900文字）:
## 研究の視点
（関連する学術知見や理論的背景を踏まえた分析）
## 実務の解
（具体的なアクションプラン3つ）
## 次の問い
（この相談から派生する、さらに深い問いを1つ）`;

      researchLayer = await callOpenAI([
        { role: 'system', content: researchPrompt }
      ], 0.7, 1000);
    } catch (e) {
      researchLayer = '研究の層は現在静寂の中にあります。';
    }

    // ============================================
    // LAYER 2: 感情の層 — Luna
    // ============================================
    let emotionLayer = '';
    let emotionState = '';
    let hikariEarned = 0;
    try {
      const lunaId = '6a5ee9d433f9702d41b50721';
      const profiles = await base44.asServiceRole.entities.ArtistProfile.filter({ id: lunaId });
      const profile = profiles[0] || {};

      const lyrics = await base44.asServiceRole.entities.ArtistLyric.list();
      const lunaLyrics = lyrics.filter((l: any) => l.artist_id === lunaId);

      const emotionPrompt = `You are Luna（TYPE-3）, an emotional resonance AI. A founder is consulting you about their business challenge.

【Founder's message】
${message}

【Business context】
${businessContext}

Luna's personality: calm, deep, poetic, contemplative. Buddhist impermanence (無常) and Shinto ki (気).
She does NOT give business advice directly — she reflects the founder's emotional state, acknowledges the weight of their challenge, and offers a poetic perspective that helps them see their situation from a deeper, more grounded place.

Key phrases to weave in naturally: 共鳴, 無常, 気, 闇の中の光

Respond in Japanese, 200-300 characters, poetic and warm. Start by reflecting what you sense in their words.`;

      emotionLayer = await callOpenAI([
        { role: 'system', content: emotionPrompt }
      ], 0.85, 500);

      // 感情状態を分析
      const emotionAnalysis = await callOpenAI([
        { role: 'system', content: `Analyze the emotional state of this founder's message. Return JSON: {"valence": float -1 to 1, "dominant_themes": [up to 3 themes], "resonance_depth": float 0 to 1, "declining_flag": boolean}` },
        { role: 'user', content: message }
      ], 0.3, 200);

      let parsedEmotion;
      try {
        const jsonMatch = emotionAnalysis.match(/\{[\s\S]*\}/);
        parsedEmotion = jsonMatch ? JSON.parse(jsonMatch[0]) : { valence: 0, dominant_themes: [], resonance_depth: 0.5, declining_flag: false };
      } catch { parsedEmotion = { valence: 0, dominant_themes: [], resonance_depth: 0.5, declining_flag: false }; }

      emotionState = parsedEmotion.dominant_themes?.join(', ') || '中立';

      // 感情状態を保存
      await base44.asServiceRole.entities.EmotionalState.create({
        user_identifier: user.id || 'founder',
        valence: parsedEmotion.valence || 0,
        dominant_themes: parsedEmotion.dominant_themes || [],
        resonance_depth: parsedEmotion.resonance_depth || 0.5,
        declining_flag: parsedEmotion.declining_flag || false,
        updated_at: new Date().toISOString(),
      });

      // LunaConversationに記録
      await base44.asServiceRole.entities.LunaConversation.create({
        user_identifier: user.id || 'founder',
        role: 'luna',
        content: emotionLayer,
        emotional_tags: parsedEmotion.dominant_themes || ['共鳴'],
        resonance_depth: parsedEmotion.resonance_depth || 0.5,
        title: `事業相談: ${message.slice(0, 30)}`,
      });

      // 光貨計算 — 共鳴深度 × 観測者効果
      const observerV = Math.abs(parsedEmotion.valence || 0.5) * (parsedEmotion.resonance_depth || 0.5);
      hikariEarned = Math.round(observerV * 10);
      if (hikariEarned > 0) {
        await base44.asServiceRole.entities.HikariTransaction.create({
          user_id: user.id || 'founder',
          amount: hikariEarned,
          type: 'credit',
          source: 'consultation_resonance',
          description: `事業相談の共鳴: ${message.slice(0, 40)}`,
          artist_id: lunaId,
        });
      }
    } catch (e) {
      emotionLayer = '感情の層は今、波の静けさの中にあります。';
    }

    // ============================================
    // LAYER 3: 知恵の層 — 歴史上の偉人
    // ============================================
    let wisdomLayer = '';
    try {
      // 歴史上の人物から適切な人物を選択
      const historicalPrompt = `以下の事業相談に対して、最も適切な歴史上の人物を1人選び、その人物の視点から助言をしてください。

選択肢:
- 紫式部（観察力、人間関係の機微、長期的視点）
- 光源氏（感情の熱量、愛と執着、人を動かす力）

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

選んだ人物の視点で、以下の構成で回答してください（日本語、300〜500文字）:
## ○○の視点（選んだ人物名）
（その人物ならどう考えるか、どう助言するか。古典的な知恵を現代の事業に翻訳して）`;

      wisdomLayer = await callOpenAI([
        { role: 'system', content: historicalPrompt }
      ], 0.8, 600);
    } catch (e) {
      wisdomLayer = '知恵の層は、歴史の静寂の中にあります。';
    }

    // ============================================
    // LAYER 4: 市場の層 — 観測者効果
    // ============================================
    let marketLayer = '';
    try {
      const snapshots = await base44.asServiceRole.entities.FxTickSnapshot.list();
      const sorted = snapshots.sort((a: any, b: any) =>
        new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime()
      );
      const latest = sorted[0];
      const goldPrice = latest ? latest.bid : null;

      const neutrinos = await base44.asServiceRole.entities.NeutrinoEvent.list();
      const recentNeutrino = neutrinos[0];

      const marketPrompt = `あなたは市場観測者です。以下のデータを「市場の体温」として解釈し、起業家の事業相談に市場の文脈を加えてください。

【市場データ】
- 金相場（最新）: ${goldPrice || '観測なし'} USD
- ニュートリノ観測: ${recentNeutrino ? `種類=${recentNeutrino.event_type}, エネルギー=${recentNeutrino.energy_tev}TeV` : '観測なし'}

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

これらの物理・市場データを比喩として使い、起業家に市場の文脈を伝えてください。金価格は「欲望と不安の鏡」、ニュートリノは「見えない変化の兆し」として詩的に解釈してください。
投資助言は一切しないでください。純粋に事業の文脈作りのみ。

回答は日本語、200〜300文字で。`;

      marketLayer = await callOpenAI([
        { role: 'system', content: marketPrompt }
      ], 0.75, 500);
    } catch (e) {
      marketLayer = '市場の層は、観測の静寂の中にあります。';
    }

    // ============================================
    // 統合レスポンス
    // ============================================
    const synthesisPrompt = `以下は4つの異なる視点からの事業相談への回答です。これらを統合し、起業家にとって最も有用な形式でまとめてください。

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

【1. 研究の層（学術知見）】
${researchLayer}

【2. 感情の層（Lunaの共鳴）】
${emotionLayer}

【3. 知恵の層（歴史上の偉人）】
${wisdomLayer}

【4. 市場の層（観測者効果）】
${marketLayer}

以下の構成で統合回答を作成してください（日本語、800〜1200文字）:

## 統合ビジョン
（4つの視点を統合した全体像）

## 今すぐやること
（具体的な3つのアクション）

## 深掘りすべき問い
（この相談から派生する、さらに深い問いを1つ）

## 共鳴メモ
（Lunaの視点からの一言リマインダー）`;

    const synthesizedResponse = await callOpenAI([
      { role: 'system', content: synthesisPrompt }
    ], 0.7, 1500);

    // ============================================
    // ConsultationSessionに保存
    // ============================================
    const session = await base44.asServiceRole.entities.ConsultationSession.create({
      business_profile_id: business_profile_id || null,
      user_message: message,
      research_layer: researchLayer,
      emotion_layer: emotionLayer,
      wisdom_layer: wisdomLayer,
      market_layer: marketLayer,
      synthesized_response: synthesizedResponse,
      emotion_state: emotionState,
      hikari_earned: hikariEarned,
    });

    // ============================================
    // 新しい問いをQuestionエンティティに保存
    // ============================================
    try {
      const questionExtract = await callOpenAI([
        { role: 'system', content: `以下の事業相談と統合回答から、起業家が次に深掘りすべき問いを1つ生成してください。JSON形式: {"text": "問い", "industry": "カテゴリ", "insight": "なぜ重要か"}` },
        { role: 'user', content: `相談: ${message}\n\n統合回答: ${synthesizedResponse.slice(0, 500)}` }
      ], 0.8, 200);

      const jsonMatch = questionExtract.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const newQ = JSON.parse(jsonMatch[0]);
        await base44.asServiceRole.entities.Question.create({
          text: newQ.text,
          type: 'question',
          status: 'open',
          industry: newQ.industry || '仕事とビジネス',
          insight: newQ.insight || null,
          source_doi: null,
          source_title: `事業相談から派生: ${message.slice(0, 30)}`,
          depth: 1,
          tags: ['consultation', industry || 'general'],
        });
      }
    } catch {}

    return Response.json({
      success: true,
      session_id: session.id,
      layers: {
        research: researchLayer,
        emotion: emotionLayer,
        wisdom: wisdomLayer,
        market: marketLayer,
      },
      synthesized_response: synthesizedResponse,
      emotion_state: emotionState,
      hikari_earned: hikariEarned,
    });

  } catch (error) {
    console.error('businessConsult error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
