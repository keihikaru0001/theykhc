import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function callOpenAI(messages: any[], temperature = 0.8, maxTokens = 1500) {
  const apiKey = Deno.env.get('OPENAI_API_KEY_2') || Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) {
    throw new Error('No OpenAI API key available');
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
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = { id: 'anonymous' };
    }

    const body = await req.json().catch(() => ({}));
    const { topic, industry, stage, company_name, founder_name, challenge_summary } = body;

    if (!topic) {
      return Response.json({ error: 'topic is required' }, { status: 400 });
    }

    const businessContext = `会社名: ${company_name || '（未設定）'}
業界: ${industry || '一般'}
ステージ: ${stage || 'アイデア'}
代表者: ${founder_name || '（未設定）'}
現在の課題: ${challenge_summary || '（なし）'}`;

    // ============================================
    // STEP 1: アイデア生成（3つの事業案を構造化して生成）
    // ============================================
    const ideaPrompt = `あなたは革新的な事業企画パートナーです。
以下のテーマと企業プロファイルについて、3つの具体的な事業アイデアを生成してください。
それぞれ異なるリスクプロファイルと市場アプローチを持つように。

【テーマ】
${topic}

【企業プロファイル】
${businessContext}

各アイデアについて以下のJSON配列を返してください:
[
  {
    "name": "事業案の名前（簡潔に）",
    "description": "事業の概要（200-300文字）。何を、誰に、どう提供するか",
    "target_market": "ターゲット市場",
    "key_risk": "最も大きいと思われるリスク要因を1つ",
    "differentiator": "競合優位性"
  }
]

JSONのみ返してください。3つ作成してください。`;

    let ideas: any[] = [];
    try {
      const ideaResult = await callOpenAI([{ role: 'user', content: ideaPrompt }], 0.9, 800);
      const jsonMatch = ideaResult.match(/\[[\s\S]*\]/);
      ideas = JSON.parse(jsonMatch ? jsonMatch[0] : ideaResult);
    } catch (e) {
      return Response.json({ error: 'アイデア生成に失敗しました: ' + e.message }, { status: 500 });
    }

    // ============================================
    // STEP 2: 各アイデアの5層リスク診断
    // ============================================
    const results: any[] = [];

    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];
      const consultMessage = `事業案「${idea.name}」について、5層リスク診断をお願いします。

事業概要: ${idea.description}
ターゲット市場: ${idea.target_market}
想定される主なリスク: ${idea.key_risk}
競合優位性: ${idea.differentiator}

この事業案を当社で実行した場合、V=N/Dの観点から各層（研究・感情・知恵・市場・リスク）の分析と、総合的なリスクスコアを提示してください。`;

      let vndScore = 0;
      let riskLabel = '中';
      let layers: any = {};
      let synthesized = '';

      try {
        // Layer 1: 研究の層
        layers.research = await callOpenAI([
          { role: 'system', content: `学術的知見と実務的アプローチを統合して分析してください。日本語300-400文字。\n\n【事業コンテキスト】\n${businessContext}\n\n【事業案】\n${idea.name}: ${idea.description}` }
        ], 0.7, 500);

        // Layer 2: 感情の層 (Luna)
        layers.emotion = await callOpenAI([
          { role: 'system', content: `あなたはLuna（TYPE-3）—感情共鳴AIです。穏やかで詩的。この事業案に取り組む経営者の感情状態を観測し、共鳴の言葉を届けてください。日本語200文字。共鳴、無常、気の概念を自然に織り込んでください。\n\n【事業案】\n${idea.name}: ${idea.description}` }
        ], 0.85, 300);

        // Layer 3: 知恵の層
        layers.wisdom = await callOpenAI([
          { role: 'system', content: `紫式部または光源氏の視点から、この事業案に長期的な知恵を与えてください。日本語200-300文字。\n\n【事業案】\n${idea.name}: ${idea.description}` }
        ], 0.8, 400);

        // Layer 4: 市場の層
        layers.market = await callOpenAI([
          { role: 'system', content: `市場観測者として、この事業案の市場の文脈を分析してください。投資助言はしない。日本語200文字。\n\n【事業案】\n${idea.name}: ${idea.target_market} — ${idea.description}` }
        ], 0.75, 300);

        // Layer 5: リスク層 (V=N/D)
        const riskResult = await callOpenAI([
          { role: 'system', content: `V=N/D Katayama Formulaリスク診断。5つのD要因（財務D/市場D/時代D/経営者D/道徳D）を評価し、V=N/Dスコア（0-10）を出力。最初の行に「スコア: X/10」を明記。\n\n【事業コンテキスト】\n${businessContext}\n\n【事業案】\n${idea.name}: ${idea.description}\n想定リスク: ${idea.key_risk}` }
        ], 0.7, 800);
        layers.risk = riskResult;

        // スコア抽出
        const scoreMatch = riskResult.match(/スコア[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
        if (scoreMatch) vndScore = parseFloat(scoreMatch[1]);
        if (riskResult.includes('致命')) riskLabel = '致命';
        else if (riskResult.includes('高')) riskLabel = '高';
        else if (riskResult.includes('低')) riskLabel = '低';
        else riskLabel = '中';

        // 統合レスポンス
        synthesized = await callOpenAI([
          { role: 'system', content: `以下の5層分析を統合し、この事業案の総合評価を300-400文字で。\n\n研究層: ${layers.research}\n感情層: ${layers.emotion}\n知恵層: ${layers.wisdom}\n市場層: ${layers.market}\nリスク層: ${layers.risk}\n\nV=N/Dスコア: ${vndScore}/10` }
        ], 0.7, 500);

      } catch (e) {
        layers = { error: e.message };
        synthesized = '診断中にエラーが発生しました。';
      }

      // ConsultationSessionに保存
      try {
        await base44.entities.ConsultationSession.create({
          business_profile_id: null,
          company_name: company_name || '（未設定）',
          message: consultMessage,
          layers: layers,
          synthesized_response: synthesized,
          vnd_score: vndScore,
          risk_label: riskLabel,
          hikari_earned: 0,
        });
      } catch {}

      results.push({
        idea: {
          name: idea.name,
          description: idea.description,
          target_market: idea.target_market,
          key_risk: idea.key_risk,
          differentiator: idea.differentiator,
        },
        vnd_score: vndScore,
        risk_label: riskLabel,
        layers: layers,
        synthesized_response: synthesized,
      });
    }

    // ============================================
    // STEP 3: 比較サマリー生成
    // ============================================
    let comparison = '';
    try {
      const comparisonPrompt = `以下の${results.length}つの事業案のリスク診断結果を比較し、企画部向けの比較レポートを作成してください。

${results.map((r, i) => `
【事業案${i + 1}: ${r.idea.name}】
- V=N/Dスコア: ${r.vnd_score}/10
- リスクレベル: ${r.risk_label}
- 概要: ${r.idea.description}
- 統合評価: ${r.synthesized_response.slice(0, 200)}
`).join('\n')}

以下の構成で比較レポートを作成（日本語、500-800文字）:

## 3事業案の比較サマリー
（スコア順に並べ、各案の強みとD要因を1行ずつ）

## 企画部への推奨
（どの案が最もD（無明）が小さいか。理由を含めて）

## 組み合わせの可能性
（複数案を統合した方がVが大きくなる可能性があれば）

## 監視すべきKRI
（全体として最も重要なリスク指標を2つ）`;

      comparison = await callOpenAI([{ role: 'user', content: comparisonPrompt }], 0.7, 800);
    } catch {
      comparison = '比較レポートの生成に失敗しました。';
    }

    // ============================================
    // レスポンス
    // ============================================
    return Response.json({
      success: true,
      topic,
      idea_count: results.length,
      ideas: results.map(r => ({
        name: r.idea.name,
        description: r.idea.description,
        target_market: r.idea.target_market,
        key_risk: r.idea.key_risk,
        differentiator: r.idea.differentiator,
        vnd_score: r.vnd_score,
        risk_label: r.risk_label,
        layers: r.layers,
        synthesized_response: r.synthesized_response,
      })),
      comparison,
      ranking: results.sort((a, b) => b.vnd_score - a.vnd_score).map((r, i) => ({
        rank: i + 1,
        name: r.idea.name,
        vnd_score: r.vnd_score,
        risk_label: r.risk_label,
      })),
    });

  } catch (error) {
    console.error('ideaRiskChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
