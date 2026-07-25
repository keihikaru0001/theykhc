import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import OpenAI from 'npm:openai@4.28.0';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY_2') || Deno.env.get('OPENAI_API_KEY') });

function stripMarkdown(raw) {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  return s.trim();
}

function extractJson(raw) {
  const cleaned = stripMarkdown(raw);
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  return jsonMatch ? jsonMatch[0] : cleaned;
}

//===============================================
// Question Harvest Engine — 1,034 DOIから問いを収穫 → 5層診断 → 市場規模算出
// 会長の論文 "Question Harvest Engine v1-v6" の実装
//===============================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action, batch_size = 5, skip = 0 } = body;

    // ============================================
    // ACTION: harvest — DOI種から問いを収穫
    // ============================================
    if (action === 'harvest') {
      const allSeeds = await base44.asServiceRole.entities.SeedRecord.list();
      const existingQuestions = await base44.asServiceRole.entities.Question.list();
      const existingDOIs = new Set(existingQuestions.map(q => q.source_doi));
      const unprocessedSeeds = allSeeds.filter(s => !existingDOIs.has(s.doi));
      const batch = unprocessedSeeds.slice(skip, skip + batch_size);
      
      if (batch.length === 0) {
        return Response.json({
          action: 'harvest',
          status: 'complete',
          total_seeds: allSeeds.length,
          processed: existingDOIs.size,
          remaining: 0,
          message: '全DOIの問い収穫が完了'
        });
      }

      const seedSummaries = batch.map((s, i) => 
        `[${i+1}] タイトル: ${s.title}\n    要旨: ${(s.abstract || '').slice(0, 300)}\n    キーワード: ${(s.keywords || []).join(', ')}`
      ).join('\n\n');

      const prompt = `以下の${batch.length}件の学術論文から、それぞれ2つずつ新しい問いを生成してください。
各問いは異なる角度（技術的、経済的、倫理的、社会的、実装的）からアプローチし、
事業化や商品化につながる可能性を含む問いを優先してください。

【論文リスト】
${seedSummaries}

各論文につき2つの問いを、以下のJSON配列形式で返してください:
[
  {
    "seed_index": 1,
    "text": "問いの本文（日本語、具体的で深い問い）",
    "industry": "仕事とビジネス / 科学と技術 / 社会と倫理 / 生活と健康 / 教育と学習",
    "insight": "この問いがなぜ重要か（日本語、一言）",
    "business_potential": "high / medium / low"
  },
  ...
]

JSONのみ返してください。マークダウン不要。`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 2000,
      });

      let newQuestions = [];
      try {
        const raw = completion.choices[0].message.content || '';
        newQuestions = JSON.parse(extractJson(raw));
      } catch (e) {
        return Response.json({
          action: 'harvest',
          status: 'parse_error',
          raw: (completion.choices[0].message.content || '').slice(0, 500),
          error: e.message
        });
      }

      const created = [];
      for (const q of newQuestions) {
        const seedIdx = (q.seed_index || 1) - 1;
        const seed = batch[seedIdx] || batch[0];
        try {
          const record = await base44.asServiceRole.entities.Question.create({
            text: q.text,
            type: 'question',
            status: 'open',
            industry: q.industry || '科学と技術',
            insight: q.insight || null,
            source_doi: seed.doi,
            source_title: seed.title,
            depth: 2,
            parent_id: seed.id,
            root_id: seed.id,
            tags: q.business_potential ? [`business:${q.business_potential}`] : [],
          });
          created.push(record);
        } catch (e) { /* skip errors */ }
      }

      return Response.json({
        action: 'harvest',
        status: 'processing',
        total_seeds: allSeeds.length,
        already_processed: existingDOIs.size,
        batch_processed: batch.length,
        questions_generated: created.length,
        remaining: unprocessedSeeds.length - batch.length - skip,
        next_skip: skip + batch_size,
        sample_questions: created.slice(0, 3).map(q => ({
          id: q.id,
          text: q.text,
          industry: q.industry,
          source: q.source_title?.slice(0, 60),
          business_potential: q.tags?.find(t => t.startsWith('business:'))?.replace('business:', '')
        }))
      });
    }

    // ============================================
    // ACTION: diagnose — high問いを5層リスク診断へ流す
    // GPT-4o-mini使用、コスト最小化（低D化）
    // ============================================
    if (action === 'diagnose') {
      const batchSize = body.batch_size || 10;
      const allQuestions = await base44.asServiceRole.entities.Question.list();
      
      const highOpen = allQuestions.filter(q => {
        const bp = q.tags?.find(t => t.startsWith('business:'));
        return bp === 'business:high' && q.status === 'open';
      });

      if (highOpen.length === 0) {
        const diagnosed = allQuestions.filter(q => q.status === 'answered').length;
        return Response.json({
          action: 'diagnose',
          status: 'complete',
          total_high: allQuestions.filter(q => q.tags?.find(t => t === 'business:high')).length,
          diagnosed: diagnosed,
          remaining: 0,
          message: '全high問いの5層診断が完了'
        });
      }

      const batch = highOpen.slice(0, batchSize);

      const questionList = batch.map((q, i) => 
        `[${i+1}] ID:${q.id}\n    問い: ${q.text}\n    業界: ${q.industry || '不明'}`
      ).join('\n');

      const diagnosePrompt = `V=N/Dリスクマネージメント専門家として、以下の${batch.length}件の事業化候補問いに5層診断を実行してください。

【問いリスト】
${questionList}

各問いについてJSON配列で返答してください。各項目は1文で簡潔に:
[
  {
    "question_id": "上記のID",
    "research_layer": "研究の層（1文）",
    "emotion_layer": "感情の層（1文）",
    "wisdom_layer": "知恵の層（1文）",
    "market_layer": "市場の層: TAM概算（1文）",
    "risk_layer": "リスクの層（1文）",
    "vnd_score": 7.5,
    "verdict": "go/hold/pivot",
    "one_line_answer": "結論（1文）"
  }
]
JSONのみ。マークダウン不要。`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: diagnosePrompt }],
        temperature: 0.7,
        max_tokens: 4000,
      });

      let diagnoses = [];
      try {
        const raw = completion.choices[0].message.content || '';
        diagnoses = JSON.parse(extractJson(raw));
      } catch (e) {
        return Response.json({
          action: 'diagnose',
          status: 'parse_error',
          raw: (completion.choices[0].message.content || '').slice(0, 500),
          error: e.message
        });
      }

      let updated = 0;
      for (const d of diagnoses) {
        try {
          const answerText = [
            `【研究の層】${d.research_layer}`,
            `【感情の層】${d.emotion_layer}`,
            `【知恵の層】${d.wisdom_layer}`,
            `【市場の層】${d.market_layer}`,
            `【リスクの層】${d.risk_layer}`,
            `【V=N/Dスコア】${d.vnd_score}/10`,
            `【判定】${d.verdict}`,
            `【結論】${d.one_line_answer}`
          ].join('\n');

          await base44.asServiceRole.entities.Question.update(d.question_id, {
            status: 'answered',
            answer: answerText,
            insight: d.one_line_answer,
            cross_note: `V=N/D: ${d.vnd_score} | ${d.verdict}`,
            tags: ['business:high', `vnd:${d.vnd_score}`, `verdict:${d.verdict}`]
          });
          updated++;
        } catch (e) { /* skip errors */ }
      }

      return Response.json({
        action: 'diagnose',
        status: 'processing',
        total_high: highOpen.length + (allQuestions.filter(q => q.status === 'answered').length),
        diagnosed: allQuestions.filter(q => q.status === 'answered').length + updated,
        batch_processed: updated,
        remaining: highOpen.length - updated,
        sample_diagnoses: diagnoses.slice(0, 3).map(d => ({
          id: d.question_id,
          vnd_score: d.vnd_score,
          verdict: d.verdict,
          one_line: d.one_line_answer
        }))
      });
    }

    // ============================================
    // ACTION: market_size — go判定の問いにTAM/SAM/SOMを算出
    // GPT-4o-mini使用、コスト最小化（低D化）
    // ============================================
    if (action === 'market_size') {
      const batchSize = body.batch_size || 10;
      const allQuestions = await base44.asServiceRole.entities.Question.list();
      
      // go判定の問いを抽出（verdict:go タグあり）
      const goQuestions = allQuestions.filter(q => {
        return q.tags?.some(t => t === 'verdict:go');
      });

      // TAM未算出のものを抽出（cross_noteに"TAM:"が無いもの）
      const needsMarketSize = goQuestions.filter(q => {
        return !q.cross_note || !q.cross_note.includes('TAM:');
      });

      if (needsMarketSize.length === 0) {
        // 全体の市場規模集計
        let totalTAM = 0;
        let totalSAM = 0;
        let totalSOM = 0;
        const calculated = goQuestions.filter(q => q.cross_note && q.cross_note.includes('TAM:'));
        
        for (const q of calculated) {
          const tamMatch = q.cross_note.match(/TAM:\s*([\d.]+)\s*(億|兆|万)?/);
          const samMatch = q.cross_note.match(/SAM:\s*([\d.]+)\s*(億|兆|万)?/);
          const somMatch = q.cross_note.match(/SOM:\s*([\d.]+)\s*(億|兆|万)?/);
          if (tamMatch) totalTAM += parseMarketNumber(tamMatch);
          if (samMatch) totalSAM += parseMarketNumber(samMatch);
          if (somMatch) totalSOM += parseMarketNumber(somMatch);
        }

        return Response.json({
          action: 'market_size',
          status: 'complete',
          total_go: goQuestions.length,
          calculated: calculated.length,
          remaining: 0,
          summary: {
            total_TAM_jpy: totalTAM,
            total_SAM_jpy: totalSAM,
            total_SOM_jpy: totalSOM,
            total_TAM_display: formatYen(totalTAM),
            total_SAM_display: formatYen(totalSAM),
            total_SOM_display: formatYen(totalSOM)
          },
          message: '全go判定問いの市場規模算出が完了'
        });
      }

      const batch = needsMarketSize.slice(0, batchSize);

      const questionList = batch.map((q, i) => 
        `[${i+1}] ID:${q.id}\n    問い: ${q.text}\n    業界: ${q.industry || '不明'}\n    診断: ${(q.insight || '').slice(0, 100)}`
      ).join('\n');

      const marketPrompt = `市場分析専門家として、以下の${batch.length}件の事業化候補問いの市場規模を算出してください。

各問いについて、対応する産業分野の現実的な市場規模を推定し、TAM/SAM/SOMを日本円で算出してください。

【問いリスト】
${questionList}

各問いについて以下のJSON配列で返答してください:
[
  {
    "question_id": "上記のID",
    "tam": 5000,
    "tam_unit": "億円",
    "sam": 500,
    "sam_unit": "億円",
    "som": 50,
    "som_unit": "億円",
    "growth_rate": 12.5,
    "market_description": "市場の概要（1文）",
    "target_segment": "ターゲット層（1文）",
    "competitive_landscape": "競合状況（1文）"
  }
]

※TAM = Total Addressable Market（参入可能な全市場）
※SAM = Serviceable Addressable Market（対応可能な市場）
※SOM = Serviceable Obtainable Market（獲得可能な市場）
※数値は日本円ベースで、単位は「兆円」「億円」「万円」のいずれか
※成長率は年率%（CAGR）

JSONのみ。マークダウン不要。`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: marketPrompt }],
        temperature: 0.5,
        max_tokens: 4000,
      });

      let marketData = [];
      try {
        const raw = completion.choices[0].message.content || '';
        marketData = JSON.parse(extractJson(raw));
      } catch (e) {
        return Response.json({
          action: 'market_size',
          status: 'parse_error',
          raw: (completion.choices[0].message.content || '').slice(0, 500),
          error: e.message
        });
      }

      // 各問いを更新
      let updated = 0;
      for (const m of marketData) {
        try {
          const existing = batch.find(q => q.id === m.question_id);
          if (!existing) continue;

          const marketText = [
            `【TAM】${m.tam}${m.tam_unit}`,
            `【SAM】${m.sam}${m.sam_unit}`,
            `【SOM】${m.som}${m.som_unit}`,
            `【成長率(CAGR)】${m.growth_rate}%`,
            `【市場概要】${m.market_description}`,
            `【ターゲット】${m.target_segment}`,
            `【競合状況】${m.competitive_landscape}`
          ].join('\n');

          // 既存のanswerに市場規模セクションを追加
          const existingAnswer = existing.answer || '';
          const updatedAnswer = existingAnswer 
            ? existingAnswer + '\n\n--- 市場規模 ---\n' + marketText 
            : marketText;

          // cross_noteにTAM/SAM/SOMを追加
          const existingCrossNote = existing.cross_note || '';
          const updatedCrossNote = `${existingCrossNote} | TAM:${m.tam}${m.tam_unit} SAM:${m.sam}${m.sam_unit} SOM:${m.som}${m.som_unit}`;

          // tagsにmarket_sizedを追加
          const existingTags = existing.tags || [];
          const updatedTags = [...existingTags, 'market_sized'];

          await base44.asServiceRole.entities.Question.update(m.question_id, {
            answer: updatedAnswer,
            cross_note: updatedCrossNote,
            tags: updatedTags
          });
          updated++;
        } catch (e) { /* skip errors */ }
      }

      // 進捗の集計
      const alreadyCalculated = goQuestions.length - needsMarketSize.length;
      
      return Response.json({
        action: 'market_size',
        status: 'processing',
        total_go: goQuestions.length,
        calculated: alreadyCalculated + updated,
        batch_processed: updated,
        remaining: needsMarketSize.length - updated,
        sample_results: marketData.slice(0, 3).map(m => ({
          id: m.question_id,
          tam: `${m.tam}${m.tam_unit}`,
          sam: `${m.sam}${m.sam_unit}`,
          som: `${m.som}${m.som_unit}`,
          growth: `${m.growth_rate}%`
        }))
      });
    }

    // ============================================
    // ACTION: stats — 収穫・診断・市場規模の統計
    // ============================================
    if (action === 'stats') {
      const allSeeds = await base44.asServiceRole.entities.SeedRecord.list();
      const allQuestions = await base44.asServiceRole.entities.Question.list();
      
      const sourceDOIs = new Set(allQuestions.map(q => q.source_doi).filter(Boolean));
      const processedSeeds = allSeeds.filter(s => sourceDOIs.has(s.doi));
      
      const industryCounts = {};
      for (const q of allQuestions) {
        const ind = q.industry || '未分類';
        industryCounts[ind] = (industryCounts[ind] || 0) + 1;
      }
      
      const businessCounts = { high: 0, medium: 0, low: 0, unknown: 0 };
      for (const q of allQuestions) {
        const bp = q.tags?.find(t => t.startsWith('business:'));
        if (bp) {
          const level = bp.replace('business:', '');
          businessCounts[level] = (businessCounts[level] || 0) + 1;
        } else {
          businessCounts.unknown++;
        }
      }
      
      const open = allQuestions.filter(q => q.status === 'open').length;
      const answered = allQuestions.filter(q => q.status === 'answered').length;

      // V=N/Dスコア分布
      const vndScores = [];
      for (const q of allQuestions) {
        if (q.cross_note) {
          const match = q.cross_note.match(/V=N\/D:\s*([\d.]+)/);
          if (match) vndScores.push(parseFloat(match[1]));
        }
      }
      const avgVnd = vndScores.length > 0 
        ? (vndScores.reduce((a,b) => a+b, 0) / vndScores.length).toFixed(2)
        : null;

      // verdict集計
      const verdicts = { go: 0, hold: 0, pivot: 0 };
      for (const q of allQuestions) {
        const v = q.tags?.find(t => t.startsWith('verdict:'));
        if (v) {
          const verdict = v.replace('verdict:', '');
          if (verdicts[verdict] !== undefined) verdicts[verdict]++;
        }
      }

      // 市場規模集計
      let totalTAM = 0;
      let totalSAM = 0;
      let totalSOM = 0;
      let marketSized = 0;
      for (const q of allQuestions) {
        if (q.cross_note && q.cross_note.includes('TAM:')) {
          marketSized++;
          const tamMatch = q.cross_note.match(/TAM:\s*([\d.]+)\s*(億|兆|万)?/);
          const samMatch = q.cross_note.match(/SAM:\s*([\d.]+)\s*(億|兆|万)?/);
          const somMatch = q.cross_note.match(/SOM:\s*([\d.]+)\s*(億|兆|万)?/);
          if (tamMatch) totalTAM += parseMarketNumber(tamMatch);
          if (samMatch) totalSAM += parseMarketNumber(samMatch);
          if (somMatch) totalSOM += parseMarketNumber(somMatch);
        }
      }
      
      return Response.json({
        action: 'stats',
        seeds: {
          total: allSeeds.length,
          processed: processedSeeds.length,
          remaining: allSeeds.length - processedSeeds.length
        },
        questions: {
          total: allQuestions.length,
          open: open,
          answered: answered,
          by_industry: industryCounts,
          by_business_potential: businessCounts
        },
        diagnosis: {
          diagnosed: answered,
          remaining_high: businessCounts.high - answered,
          avg_vnd_score: avgVnd,
          verdicts: verdicts
        },
        market_size: {
          go_total: verdicts.go,
          market_sized: marketSized,
          remaining: verdicts.go - marketSized,
          total_TAM_jpy: totalTAM,
          total_SAM_jpy: totalSAM,
          total_SOM_jpy: totalSOM,
          total_TAM_display: formatYen(totalTAM),
          total_SAM_display: formatYen(totalSAM),
          total_SOM_display: formatYen(totalSOM)
        },
        progress_pct: allSeeds.length > 0 ? Math.round(processedSeeds.length / allSeeds.length * 100) : 0
      });
    }

    return Response.json({ error: 'Unknown action. Use: harvest, diagnose, market_size, stats' }, { status: 400 });

  } catch (error) {
    console.error('questionHarvest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ============================================
// Helper functions
// ============================================
function parseMarketNumber(match) {
  const num = parseFloat(match[1]);
  const unit = match[2] || '';
  if (unit === '兆') return num * 1000000000000;
  if (unit === '億') return num * 100000000;
  if (unit === '万') return num * 10000;
  return num;
}

function formatYen(amount) {
  if (amount >= 1000000000000) {
    return `${(amount / 1000000000000).toFixed(2)}兆円`;
  }
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(1)}億円`;
  }
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(0)}万円`;
  }
  return `${amount}円`;
}
