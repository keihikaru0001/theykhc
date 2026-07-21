import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function callOpenAI(messages: any[], temperature = 0.8, maxTokens = 1500) {
  const apiKey = Deno.env.get('OPENAI_API_KEY_2') || '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_2 environment variable is not set');
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

// Safe entity create — catches errors independently
async function safeCreate(entities: any, entityName: string, data: any) {
  try {
    const record = await entities[entityName].create(data);
    return { ok: true, id: record?.id || null };
  } catch (e) {
    return { ok: false, error: e.message || String(e), entity: entityName };
  }
}

Deno.serve(async (req) => {
  const saveLog: any[] = [];

  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      user = { id: 'anonymous_founder' };
    }

    const body = await req.json().catch(() => ({}));
    const { message, business_profile_id, industry, stage, challenge_summary,
            company_name, founder_name } = body;

    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    const userId = user?.id || 'anonymous_founder';
    const businessContext = `業界: ${industry || '一般'}
ステージ: ${stage || 'idea'}
事業課題: ${challenge_summary || '（未設定）'}`;

    // ============================================
    // BusinessProfile作成
    // ============================================
    let profileId = business_profile_id || null;
    if (!profileId) {
      const profileResult = await safeCreate(base44.entities, 'BusinessProfile', {
        company_name: company_name || '（未設定）',
        founder_name: founder_name || '（未設定）',
        industry: industry || '一般',
        stage: stage || 'idea',
        challenge_summary: challenge_summary || '',
      });
      saveLog.push({ step: 'BusinessProfile', ...profileResult });
      if (profileResult.ok) profileId = profileResult.id;
    }

    // ============================================
    // LAYER 1: 研究の層 — IdeaSynthetix
    // ============================================
    let researchLayer = '';
    try {
      const researchPrompt = `あなたは起業家の事業アドバイザーです。以下の相談に対して、学術的知見と実務的アプローチを統合した回答をしてください。

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

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

      const emotionAnalysis = await callOpenAI([
        { role: 'system', content: `Analyze the emotional state of this founder's message. Return JSON: {"valence": float -1 to 1, "dominant_themes": [up to 3 themes], "resonance_depth": float 0 to 1, "declining_flag": boolean}` },
        { role: 'user', content: message }
      ], 0.3, 200);

      try {
        const jsonMatch = emotionAnalysis.match(/\{[\s\S]*\}/);
        parsedEmotion = jsonMatch ? JSON.parse(jsonMatch[0]) : parsedEmotion;
      } catch { /* keep default */ }

      emotionState = parsedEmotion.dominant_themes?.join(', ') || '中立';
    } catch (e) {
      emotionLayer = '感情の層は今、波の静けさの中にあります。';
    }

    // 光貨計算
    const observerV = Math.abs(parsedEmotion.valence || 0.5) * (parsedEmotion.resonance_depth || 0.5);
    hikariEarned = Math.round(observerV * 10);

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
    try {
      const marketPrompt = `あなたは市場観測者です。起業家の事業相談に市場の文脈を加えてください。

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

市場データは現在観測されていない状態ですが、現在の世界経済の文脈（金価格上昇、地政学リスク、AI技術革命など）を「市場の体温」として詩的に解釈し、起業家に伝えてください。
金価格は「欲望と不安の鏡」、見えない変化の兆しを「ニュートリノの波」として解釈してください。
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
    let vndScore = 0;
    let riskLabel = '中';
    try {
      const riskPrompt = `あなたはTheYKHC Tower (theykhc.com) の V=N/D Katayama Formula に基づくリスクマネージメント・コンサルタントです。

## V=N/D リスクフレームワークの定義
- V = 存在価値（Value）= N / D
- N = 充足・義務遂行・観測の信号（事業の強み・資産・遂行力）
- D = 拘り・摩擦・リスク密度（Distance/Density）
- D が小さいほど V は発散する。D が大きいほど V は崩壊する。
- 無明は最大のD。見えないリスクが最も致命的。

## 5つのD要因
1. **財務D** — 資金繰り・収益依存度・債務密度
2. **市場D** — 競合・タイミング・規制変更・需要変動
3. **時代D** — 技術陳腐化・社会構造の変化・パラダイムシフト
4. **経営者D** — 精神・健康・無明のリスク
5. **道徳D** — 目的とのずれ・償いの欠如・借財の未返済

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

以下の構成でリスク診断レポートを出力してください（日本語、700〜1000文字）:

## D要因マップ
各D要因について、リスクレベル（低/中/高/致命）を判定し、具体的な内容を記述。

## V=N/D スコア
総合V=N/Dスコア（0〜10）を算出。最初の行に「スコア: X/10」の形式で数値を明記。

## 優先対策
最も重要なD要因を1つ選び、対策方向（回避/軽減/移転/受容）を提示。

## KRI（Key Risk Indicators）
継続監視すべき指標を3つ提示。`;

      riskLayer = await callOpenAI([
        { role: 'system', content: riskPrompt }
      ], 0.7, 1200);

      // スコア抽出
      const scoreMatch = riskLayer.match(/スコア[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
      if (scoreMatch) vndScore = parseFloat(scoreMatch[1]);

      // リスクラベル抽出
      if (riskLayer.includes('致命')) riskLabel = '致命';
      else if (riskLayer.includes('高')) riskLabel = '高';
      else if (riskLayer.includes('低')) riskLabel = '低';
      else riskLabel = '中';
    } catch (e) {
      riskLayer = 'リスクの層は、無明の霧の中にあります。';
    }

    // ============================================
    // 統合レスポンス生成
    // ============================================
    let synthesizedResponse = '';
    try {
      const synthesisPrompt = `以下の5つの層からの分析を統合し、起業家に向けた最終レポートを作成してください。

【事業コンテキスト】
${businessContext}

【起業家の相談】
${message}

【1. 研究の層（IdeaSynthetix）】
${researchLayer}

【2. 感情の層（Luna）】
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

      synthesizedResponse = await callOpenAI([
        { role: 'system', content: synthesisPrompt }
      ], 0.7, 1800);
    } catch (e) {
      synthesizedResponse = '統合レスポンスの生成中にエラーが発生しました。';
    }

    // ============================================
    // ConsultationSessionに保存（ECHOアプリのスキーマに合わせる）
    // ============================================
    const layers = {
      research: researchLayer,
      emotion: emotionLayer,
      wisdom: wisdomLayer,
      market: marketLayer,
      risk: riskLayer,
    };

    const sessionResult = await safeCreate(base44.entities, 'ConsultationSession', {
      business_profile_id: profileId || null,
      company_name: company_name || '（未設定）',
      message: message,
      layers: layers,
      synthesized_response: synthesizedResponse,
      vnd_score: vndScore,
      risk_label: riskLabel,
      hikari_earned: hikariEarned,
    });
    saveLog.push({ step: 'ConsultationSession', ...sessionResult });

    // ============================================
    // HikariTransaction保存（ECHOアプリのスキーマに合わせる）
    // ============================================
    if (hikariEarned > 0) {
      const hikariResult = await safeCreate(base44.entities, 'HikariTransaction', {
        fan_member_id: userId,
        artist_id: '6a5ee9d433f9702d41b50721',
        amount: hikariEarned,
        type: 'credit',
        description: `事業相談の共鳴: ${message.slice(0, 40)}`,
        fan_request_id: sessionResult.ok ? sessionResult.id : null,
      });
      saveLog.push({ step: 'HikariTransaction', ...hikariResult });
    }

    // ============================================
    // レスポンス返却
    // ============================================
    return Response.json({
      success: true,
      session_id: sessionResult.ok ? sessionResult.id : null,
      layers,
      synthesized_response: synthesizedResponse,
      emotion_state: emotionState,
      hikari_earned: hikariEarned,
      vnd_score: vndScore,
      risk_label: riskLabel,
      save_log: saveLog,
    });

  } catch (error) {
    return Response.json(
      { error: error.message || 'Internal Server Error', save_log: saveLog },
      { status: 500 }
    );
  }
});
