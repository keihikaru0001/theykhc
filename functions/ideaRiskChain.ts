import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ============================================
// ブレストのルール:
// 1. 量を重視する — 多くのアイデアを生み出す
// 2. 批判しない — 生成段階では判断・評価を一切行わない
// 3. 自由なアイデア — 常識に縛られないWildな案を歓迎
// 4. アイデアを組み合わせる — 既存の案を発展・融合させる
// 5. 全件保存 — 捨てない。種として残す
// ============================================

async function callOpenAI(messages: any[], temperature = 0.9, maxTokens = 2000) {
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

async function safeCreate(entities: any, entityName: string, data: any) {
  try {
    const record = await entities[entityName].create(data);
    return { ok: true, id: record?.id || null };
  } catch (e) {
    return { ok: false, error: e.message || String(e), entity: entityName };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      user = { id: 'anonymous_founder' };
    }

    const body = await req.json().catch(() => ({}));
    const {
      topic,
      company_name = '（未設定）',
      industry = 'その他',
      stage = 'アイデア',
      founder_name = '',
      challenge_summary = '',
      idea_count = 10
    } = body;

    if (!topic && !challenge_summary) {
      return Response.json({ error: 'topic or challenge_summary is required' }, { status: 400 });
    }

    const theme = topic || challenge_summary;

    // ============================================
    // PHASE 1: ブレスト — 10案を純粋生成（批判なし）
    // ============================================
    const brainstormPrompt = `あなたは創造的なブレスト・ファシリテーターです。
以下のルールに従って、事業アイデアを${idea_count}個生成してください。

【ブレストのルール】
1. 量を重視 — 多くのアイデアを生み出す
2. 批判しない — 実現可能性や収益性の判断は一切しない
3. 自由なアイデア — 常識に縛られないWildな案を歓迎
4. アイデアを組み合わせる — 前の案を発展・融合させて新しい案を作る
5. 全件保存 — 捨てない

【テーマ】
${theme}

【事業コンテキスト】
- 会社: ${company_name}
- 業界: ${industry}
- ステージ: ${stage}
- 代表: ${founder_name}
- 課題: ${challenge_summary || theme}

【出力形式】
JSON配列で${idea_count}個のアイデアを返してください。各アイデアには以下を含む:
- name: アイデア名（日本語、簡潔に）
- one_liner: 一言で説明（3文以内。これが語れればDが低い）
- description: 詳細説明
- target_market: 想定ターゲット
- wild_factor: この案のWildな要素（常識をどこまで外しているか）
- builds_on: どの既存技術/概念を組み合わせたか

純粋なブレストです。実現可能性を心配しないでください。Wildな案を歓迎します。
必ず${idea_count}個生成してください。`;

    const brainstormResult = await callOpenAI([
      { role: 'system', content: 'あなたは創造性の化身です。制限を設けず、自由にアイデアを生成してください。' },
      { role: 'user', content: brainstormPrompt }
    ], 0.95, 4000);

    // JSONをパース
    let ideas: any[] = [];
    try {
      const jsonMatch = brainstormResult.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        ideas = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      ideas = [{ name: 'ブレスト結果', description: brainstormResult, one_liner: 'パースエラー' }];
    }

    // ============================================
    // PHASE 1.5: 市場規模算出 — 全アイデア一括
    // ============================================
    const marketSizePrompt = `あなたは市場規模推定の専門アナリストです。以下の${ideas.length}個の事業アイデアそれぞれについて、予想市場規模を算出してください。

【アイデア一覧】
${ideas.map((idea, i) => `${i+1}. ${idea.name || `アイデア${i+1}`}: ${idea.one_liner || ''} (ターゲット: ${idea.target_market || '未設定'})`).join('\n')}

【各アイデアについて以下を算出】
- tam: Total Addressable Market（最大潜在市場規模、円/年）
- sam: Serviceable Available Market（参入可能市場規模、円/年）
- som: Serviceable Obtainable Market（初期獲得可能市場規模、円/年）
- tam_label: TAMを「X兆円」「X億円」など分かりやすく表記
- growth_rate: 市場の年間成長率（%）
- time_to_market: 想定市場参入までの期間（年）
- key_drivers: 市場拡大の要因（3つまで）
- competition_level: 競合の激しさ（低/中/高/極高）

推定根拠を簡潔に添えてください。日本の市場データ、グローバル市場データを参考に、現実的な範囲で算出する。

JSON配列で返答:
[
  {
    "idea_index": 0,
    "tam": 数値,
    "sam": 数値,
    "som": 数値,
    "tam_label": "X兆円",
    "growth_rate": 数値,
    "time_to_market": 数値,
    "key_drivers": ["要因1", "要因2", "要因3"],
    "competition_level": "低/中/高/極高",
    "rationale": "推定根拠（100字程度）"
  },
  ...
]`;

    let marketSizes: any[] = [];
    try {
      const marketResult = await callOpenAI([
        { role: 'system', content: 'あなたは市場規模推定の専門アナリストです。現実的かつ保守的な数値を出す。' },
        { role: 'user', content: marketSizePrompt }
      ], 0.5, 4000);

      const marketJsonMatch = marketResult.match(/\[[\s\S]*\]/);
      if (marketJsonMatch) {
        marketSizes = JSON.parse(marketJsonMatch[0]);
      }
    } catch (e) {
      // 市場規模算出失敗時は空配列
    }

    // 市場規模データをアイデアに統合
    ideas = ideas.map((idea, i) => {
      const ms = marketSizes.find(m => m.idea_index === i) || marketSizes[i] || {};
      return {
        ...idea,
        market_size: {
          tam: ms.tam || 0,
          sam: ms.sam || 0,
          som: ms.som || 0,
          tam_label: ms.tam_label || '未算出',
          growth_rate: ms.growth_rate || 0,
          time_to_market: ms.time_to_market || 0,
          key_drivers: ms.key_drivers || [],
          competition_level: ms.competition_level || '不明',
          rationale: ms.rationale || ''
        }
      };
    });

    // ============================================
    // PHASE 2: 全件保存（種として残す — 捨てない）
    // ============================================
    const savedRecords: any[] = [];
    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];
      const ms = idea.market_size;
      const saveResult = await safeCreate(base44.asServiceRole.entities, 'IdeaSynthetixEntry', {
        question: theme,
        perspective_text: `【${idea.name || `アイデア${i+1}`}】\n${idea.one_liner || ''}\n\n${idea.description || ''}\n\nターゲット: ${idea.target_market || '未設定'}\nWild要素: ${idea.wild_factor || '未設定'}\n組み合わせ元: ${idea.builds_on || '未設定'}\n\n【市場規模】\nTAM: ${ms.tam_label} (¥${ms.tam}/年)\nSAM: ¥${ms.sam}/年\nSOM: ¥${ms.som}/年\n成長率: ${ms.growth_rate}%\n参入まで: ${ms.time_to_market}年\n競合: ${ms.competition_level}\n推定根拠: ${ms.rationale}`,
        source_agent: 'ideaRiskChain_brainstorm',
        emotional_resonance_score: 0,
        linked_neutrino_event_id: ''
      });
      savedRecords.push({ ...saveResult, idea_name: idea.name });
    }

    // ============================================
    // PHASE 3: 5層リスク診断（評価は生成の後に）
    // ============================================
    const assessedIdeas: any[] = [];

    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];
      const ms = idea.market_size;
      const ideaText = `【事業アイデア】${idea.name || `アイデア${i+1}`}
一言で: ${idea.one_liner || ''}
詳細: ${idea.description || ''}
ターゲット: ${idea.target_market || '未設定'}
Wild要素: ${idea.wild_factor || '未設定'}
組み合わせ元: ${idea.builds_on || '未設定'}

【予想市場規模】
TAM（最大潜在市場）: ${ms.tam_label} (¥${ms.tam}/年)
SAM（参入可能市場）: ¥${ms.sam}/年
SOM（初期獲得可能）: ¥${ms.som}/年
市場成長率: ${ms.growth_rate}%/年
参入まで: ${ms.time_to_market}年
競合レベル: ${ms.competition_level}
市場拡大要因: ${(ms.key_drivers || []).join(', ')}
推定根拠: ${ms.rationale}

【事業コンテキスト】
会社: ${company_name} / 業界: ${industry} / ステージ: ${stage}
代表: ${founder_name}
課題: ${challenge_summary || theme}`;

      // 5層プロンプト
      const layerPrompt = `以下の事業アイデアに対して、5層構造で分析してください。

${ideaText}

以下の5つの層それぞれについて、200字程度で分析してください:

1. **研究の層**: 学術・技術的な裏付け、既存研究との接点、TRL（技術成熟度）
2. **感情の層**: 起業家の心理状態、熱量、自己認識、無常観
3. **知恵の層**: 歴史的視点、長期持久性、100年後に残るか
4. **市場の層**: 市場規模の妥当性、競合の動向、タイミング、観測者効果。提供されたTAM/SAM/SOMの数値を踏まえて評価
5. **リスクの層**: V=N/D評価 — 5つのD要因（財務D/市場D/時代D/経営者D/道徳D）を0-10で採点し、総合V=N/Dスコアを算出

最後に:
- vnd_score: 総合V=N/Dスコア (0-10)
- risk_label: リスクレベル（低/中/高/極高）
- one_word: この事業を一言で表現

JSON形式で返答:
{
  "layers": {
    "research": "分析文",
    "emotion": "分析文",
    "wisdom": "分析文",
    "market": "分析文",
    "risk": "分析文"
  },
  "vnd_score": 数値,
  "risk_label": "レベル",
  "one_word": "一言"
}`;

      try {
        const assessmentResult = await callOpenAI([
          { role: 'system', content: 'あなたはV=N/D Katayama Formulaに基づく事業リスク診断の専門家です。TheYKHC Tower（1,466 DOI on Zenodo）の理論的基盤を持つ。5層構造で冷静に分析する。' },
          { role: 'user', content: layerPrompt }
        ], 0.7, 2500);

        let assessment: any = {};
        try {
          const jsonMatch = assessmentResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            assessment = JSON.parse(jsonMatch[0]);
          } else {
            assessment = { layers: {}, vnd_score: 0, risk_label: '不明', one_word: '', raw: assessmentResult };
          }
        } catch (e) {
          assessment = { layers: {}, vnd_score: 0, risk_label: 'パースエラー', one_word: '', raw: assessmentResult };
        }

        // ConsultationSessionに保存
        const sessionResult = await safeCreate(base44.asServiceRole.entities, 'ConsultationSession', {
          business_profile_id: '',
          user_message: `【ブレスト案${i+1}】${idea.name}: ${idea.one_liner || ''}`,
          research_layer: assessment.layers?.research || '',
          emotion_layer: assessment.layers?.emotion || '',
          wisdom_layer: assessment.layers?.wisdom || '',
          market_layer: assessment.layers?.market || '',
          risk_layer: assessment.layers?.risk || '',
          synthesized_response: assessmentResult,
          emotion_state: '',
          hikari_earned: 0,
          company_name: company_name,
          layers: assessment.layers || {},
          vnd_score: assessment.vnd_score || 0,
          risk_label: assessment.risk_label || '',
          one_word: assessment.one_word || ''
        });

        assessedIdeas.push({
          index: i + 1,
          name: idea.name || `アイデア${i+1}`,
          one_liner: idea.one_liner || '',
          description: idea.description || '',
          target_market: idea.target_market || '',
          wild_factor: idea.wild_factor || '',
          builds_on: idea.builds_on || '',
          market_size: ms,
          vnd_score: assessment.vnd_score || 0,
          risk_label: assessment.risk_label || '不明',
          one_word: assessment.one_word || '',
          layers: assessment.layers || {},
          session_saved: sessionResult.ok,
          session_id: sessionResult.id
        });
      } catch (e) {
        assessedIdeas.push({
          index: i + 1,
          name: idea.name || `アイデア${i+1}`,
          one_liner: idea.one_liner || '',
          error: e.message || String(e),
          market_size: ms,
          vnd_score: 0,
          risk_label: '診断エラー'
        });
      }
    }

    // ============================================
    // PHASE 4: 比較レポート
    // ============================================
    const ranking = [...assessedIdeas].sort((a, b) => (b.vnd_score || 0) - (a.vnd_score || 0));

    // 市場規模ランキングも作成
    const marketRanking = [...assessedIdeas].sort((a, b) => {
      const aSom = a.market_size?.som || 0;
      const bSom = b.market_size?.som || 0;
      return bSom - aSom;
    });

    const reportPrompt = `以下の${assessedIdeas.length}つの事業アイデアとV=N/Dスコアを比較し、レポートを作成してください。

テーマ: ${theme}
会社: ${company_name} (${industry}, ${stage})

アイデア一覧（V=N/Dスコア順）:
${ranking.map((a, i) => `${i+1}位: ${a.name} — V=N/D ${a.vnd_score}/10 (${a.risk_label}) — SOM: ${a.market_size?.tam_label || '未算出'} — ${a.one_liner || a.one_word || ''}`).join('\n')}

市場規模順（SOM順）:
${marketRanking.map((a, i) => `${i+1}位: ${a.name} — SOM: ¥${(a.market_size?.som || 0).toLocaleString()}/年 (成長率${a.market_size?.growth_rate || 0}%/年) — 競合${a.market_size?.competition_level || '不明'}`).join('\n')}

以下を含む比較レポートを作成:
1. ランキング表（スコア順 + 市場規模順の2軸）
2. 各アイデアの一言評価 + 市場規模の妥当性
3. 推奨案（V=N/Dが高く、かつ市場規模が現実的な案）とその理由
4. 組み合わせ可能性（複数案を融合すべきか）
5. KRI（継続監視指標）— 3つ
6. 総括: ブレスト全体の傾向と次の一手

簡潔に、日本語で。`;

    let comparisonReport = '';
    try {
      comparisonReport = await callOpenAI([
        { role: 'system', content: 'あなたはV=N/Dリスクマネージメントの専門アナリストです。市場規模とV=N/Dスコアの両軸で評価する。' },
        { role: 'user', content: reportPrompt }
      ], 0.7, 2500);
    } catch (e) {
      comparisonReport = `比較レポート生成エラー: ${e.message}`;
    }

    return Response.json({
      success: true,
      topic: theme,
      brainstorm_rules: ['量を重視', '批判しない', '自由なアイデア', '組み合わせる', '全件保存'],
      idea_count: ideas.length,
      ideas: assessedIdeas,
      ranking: ranking.map((a, i) => ({
        rank: i + 1,
        name: a.name,
        vnd_score: a.vnd_score,
        risk_label: a.risk_label,
        one_liner: a.one_liner || a.one_word || '',
        market_size: a.market_size
      })),
      market_ranking: marketRanking.map((a, i) => ({
        rank: i + 1,
        name: a.name,
        som: a.market_size?.som || 0,
        som_label: a.market_size?.tam_label || '未算出',
        growth_rate: a.market_size?.growth_rate || 0,
        competition_level: a.market_size?.competition_level || '不明',
        vnd_score: a.vnd_score
      })),
      comparison_report: comparisonReport,
      saved_records: savedRecords.length,
      message: `ブレスト${ideas.length}案生成完了。市場規模算出済み。全件IdeaSynthetixEntryに保存。各案の5層診断をConsultationSessionに保存。`
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message || String(error)
    }, { status: 500 });
  }
});
