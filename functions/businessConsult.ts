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
    let parsedEmotion: any = { valence: 0, dominant_themes: [], resonance_depth: 0.5, declining_flag: false };
    try {
      const lunaId = '6a5ee9d433f9702d41b50721';

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

      try {
        const jsonMatch = emotionAnalysis.match(/\{[\s\S]*\}/);
        parsedEmotion = jsonMatch ? JSON.parse(jsonMatch[0]) : parsedEmotion;
      } catch { /* keep default */ }

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
    let goldPrice: number | null = null;
    let recentNeutrino: any = null;
    try {
      const snapshots = await base44.asServiceRole.entities.FxTickSnapshot.list();
      const sorted = snapshots.sort((a: any, b: any) =>
        new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime()
      );
      const latest = sorted[0];
      goldPrice = latest ? latest.bid : null;
      const goldVolatility = snapshots.length > 0
        ? Math.max(...snapshots.slice(0, 10).map((s: any) => s.anomaly_score || 0))
        : 0;

      const neutrinos = await base44.asServiceRole.entities.NeutrinoEvent.list();
      recentNeutrino = neutrinos[0];

      const marketPrompt = `あなたは市場観測者です。以下のデータを「市場の体温」として解釈し、起業家の事業相談に市場の文脈を加えてください。

【市場データ】
- 金相場（最新）: ${goldPrice || '観測なし'} USD
- 金相場ボラティリティ異常スコア: ${goldVolatility}
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
    // LAYER 5: リスクの層 — V=N/D Risk Assessment
    // ============================================
    let riskLayer = '';
    try {
      // 経営者感情軌跡データを取得
      const emotions = await base44.asServiceRole.entities.EmotionalState.list();
      const recentEmotions = emotions.slice(0, 5);
      const decliningCount = recentEmotions.filter((e: any) => e.declining_flag).length;
      const avgValence = recentEmotions.length > 0
        ? recentEmotions.reduce((sum: number, e: any) => sum + (e.valence || 0), 0) / recentEmotions.length
        : 0;

      // 市場ボラティリティ
      const allSnapshots = await base44.asServiceRole.entities.FxTickSnapshot.list();
      const marketAnomaly = allSnapshots.length > 0
        ? Math.max(...allSnapshots.slice(0, 10).map((s: any) => s.anomaly_score || 0))
        : 0;

      const riskPrompt = `あなたはTheYKHC Tower (theykhc.com) の V=N/D Katayama Formula に基づくリスクマネージメント・コンサルタントです。

## V=N/D リスクフレームワークの定義
- V = 存在価値（Value）= N / D
- N = 充足・義務遂行・観測の信号（事業の強み・資産・遂行力）
- D = 拘り・摩擦・リスク密度（Distance/Density）
- D が小さいほど V は発散する。D が大きいほど V は崩壊する。
- 無明は最大のD。見えないリスクが最も致命的。

## TheYKHC Tower の階層別リスク知見
- 1F Foundation: V=N/D がリスク評価の核。Dの崩壊＝精神リスク（High-Rate Syndrome）
- 2F Tendo Economics: ニュートリノ×市場相関で市場リスクの先行指標を観測
- 3F Hikari Currency: Nの記録・還元システム。記録の欠落は信用リスク
- 4F Cardiac Spiral: 生命リスク・経営者の身体・気の状態
- 6F Build Seeds: Dゼロ設計流通。リスク軽減策の公開モデル

## 5つのD要因（リスク特定）
以下の5つのD要因を、起業家の事業について評価してください:

1. **財務D** — 資金繰り・収益依存度・債務密度
2. **市場D** — 競合・タイミング・規制変更・需要変動
3. **時代D** — 技術陳腐化・社会構造の変化・パラダイムシフト
4. **経営者D** — 精神・健康・無明のリスク（観測データ参照）
5. **道徳D** — 目的とのずれ・償いの欠如・借財の未返済

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

【観測データ】
- 経営者感情軌跡: 直近${recentEmotions.length}件、平均valence=${avgValence.toFixed(2)}、低下傾向=${decliningCount}件
- 市場ボラティリティ異常スコア: ${marketAnomaly}
- ニュートリノ観測: ${recentNeutrino ? `種類=${recentNeutrino.event_type}, エネルギー=${recentNeutrino.energy_tev}TeV` : '観測なし'}

以下の構成でリスク診断レポートを出力してください（日本語、700〜1000文字）:

## D要因マップ
各D要因について:
- リスク内容（1〜2文）
- 発生確率（高/中/低）
- 影響度（致命/重大/軽微）
- リスクレベル（🔴/🟡/🟢）

## V=N/D スコア
現在のN（強み）とD（リスク）を総合評価し、V値を0〜10で算出。
算出根拠を簡潔に示す。

## 対策優先順位
最もDを下げる対策を3つ提示。各対策に以下の分類を付記:
- 回避（事業からの撤退・変更）
- 軽減（プロセス改良・内部統制）
- 移転（保険・委託・共同）
- 受容（モニタリングのみ）

## KRI（継続監視指標）
今後継続的に監視すべき重要リスク指標を2つ提示。`;

      riskLayer = await callOpenAI([
        { role: 'system', content: riskPrompt }
      ], 0.6, 1200);
    } catch (e) {
      riskLayer = 'リスクの層は、観測の静寂の中にあります。';
    }

    // ============================================
    // 5層統合レスポンス
    // ============================================
    const synthesisPrompt = `以下は5つの異なる視点からの事業相談への回答です。これらを統合し、起業家にとって最も有用な形式でまとめてください。

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

【1. 研究の層（学術知見 — IdeaSynthetix）】
${researchLayer}

【2. 感情の層（Lunaの共鳴）】
${emotionLayer}

【3. 知恵の層（歴史上の偉人）】
${wisdomLayer}

【4. 市場の層（観測者効果 — Tendo Economics）】
${marketLayer}

【5. リスクの層（V=N/D Risk Assessment）】
${riskLayer}

以下の構成で統合回答を作成してください（日本語、1000〜1500文字）:

## 統合ビジョン
（5つの視点を統合した全体像。リスクの層のD要因と、他層の知見を交差させて読む）

## 今すぐやること
（具体的な3つのアクション。各アクションにどの層の知見に基づくかを明記）

## リスク・アラート
（リスク層から最も優先度の高いD要因を1つ。対策の方向性を1文で）

## 深掘りすべき問い
（この相談から派生する、さらに深い問いを1つ）

## 共鳴メモ
（Lunaの視点からの一言リマインダー。事業の重さと、その重さを持つ人の価値を認める言葉）`;

    const synthesizedResponse = await callOpenAI([
      { role: 'system', content: synthesisPrompt }
    ], 0.7, 1800);

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
      risk_layer: riskLayer,
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
          text: newQ.text || '未生成',
          industry: newQ.industry || industry || '一般',
          insight: newQ.insight || '',
          type: 'open',
          status: 'open',
          source_doi: 'businessConsult',
          source_title: `事業相談: ${message.slice(0, 40)}`,
          depth: 1,
          tags: parsedEmotion.dominant_themes || ['事業相談'],
        });
      }
    } catch (e) {
      // Question保存失敗は全体処理に影響しない
    }

    // ============================================
    // レスポンス返却
    // ============================================
    return Response.json({
      success: true,
      session_id: session.id,
      layers: {
        research: researchLayer,
        emotion: emotionLayer,
        wisdom: wisdomLayer,
        market: marketLayer,
        risk: riskLayer,
      },
      synthesized_response: synthesizedResponse,
      emotion_state: emotionState,
      hikari_earned: hikariEarned,
    });

  } catch (error) {
    return Response.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
});
