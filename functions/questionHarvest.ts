import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import OpenAI from 'npm:openai@4.28.0';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY_2') || Deno.env.get('OPENAI_API_KEY') });

//===============================================
// Question Harvest Engine — 1,020 DOIから問いを収穫する再帰ループ
// 會長の論文 "Question Harvest Engine v1-v6" の実装
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
      // 全SeedRecordを取得
      const allSeeds = await base44.asServiceRole.entities.SeedRecord.list();
      
      // 既存の問いを取得（重複回避用）
      const existingQuestions = await base44.asServiceRole.entities.Question.list();
      const existingDOIs = new Set(existingQuestions.map(q => q.source_doi));
      
      // まだ問いが生成されていないDOIを特定
      const unprocessedSeeds = allSeeds.filter(s => !existingDOIs.has(s.doi));
      
      // バッチ処理
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

      // 5件ずつGPT-4oに送信して問いを生成
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

JSONのみ返してください。`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 2000,
      });

      let newQuestions = [];
      try {
        const raw = completion.choices[0].message.content || '';
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        newQuestions = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      } catch (e) {
        return Response.json({
          action: 'harvest',
          status: 'parse_error',
          raw: (completion.choices[0].message.content || '').slice(0, 500),
          error: e.message
        });
      }

      // 問いをDBに保存
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
        } catch (e) {
          // skip errors
        }
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
    // ACTION: stats — 収穫状況の統計
    // ============================================
    if (action === 'stats') {
      const allSeeds = await base44.asServiceRole.entities.SeedRecord.list();
      const allQuestions = await base44.asServiceRole.entities.Question.list();
      
      const sourceDOIs = new Set(allQuestions.map(q => q.source_doi).filter(Boolean));
      const processedSeeds = allSeeds.filter(s => sourceDOIs.has(s.doi));
      
      // 業界別集計
      const industryCounts = {};
      for (const q of allQuestions) {
        const ind = q.industry || '未分類';
        industryCounts[ind] = (industryCounts[ind] || 0) + 1;
      }
      
      // ビジネスポテンシャル別集計
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
      
      // ステータス別
      const open = allQuestions.filter(q => q.status === 'open').length;
      const answered = allQuestions.filter(q => q.status === 'answered').length;
      
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
        progress_pct: allSeeds.length > 0 ? Math.round(processedSeeds.length / allSeeds.length * 100) : 0
      });
    }

    return Response.json({ error: 'Unknown action. Use: harvest, stats' }, { status: 400 });

  } catch (error) {
    console.error('questionHarvest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
