// きかくん — Tiered Access Control
// CATALOG: 検索・閲覧（サマリーのみ）+ 月次トレンドレポート
// ANALYSIS: + 個別5層分析フルテキスト
// ENTERPRISE: + カスタム生成 + 専用DB

import { entities } from 'npm:@base44/sdk@0.8.31';

export default async function kikaAccess(req, res) {
  try {
    const { action, tier, query, industry, limit, offset, idea_id } = req.body || {};
    
    const TIER_LEVELS = { CATALOG: 1, ANALYSIS: 2, ENTERPRISE: 3 };
    const userTier = TIER_LEVELS[tier] || 0;
    
    if (userTier < 1) {
      return res.json({ 
        status: "error", 
        message: "有効なプランが必要です。資料請求: contact@theykhc.com" 
      });
    }

    if (action === "list") {
      const maxLimit = Math.min(parseInt(limit) || 50, 50);
      const skip = parseInt(offset) || 0;
      
      const results = await entities.Question.list({
        filter: { status: 'answered' },
        limit: maxLimit,
        skip: skip,
        sort: '-updated_date'
      });

      let goIdeas = results.filter(q => (q.tags || []).includes('verdict:go'));
      
      if (industry) {
        goIdeas = goIdeas.filter(q => q.industry && q.industry.includes(industry));
      }
      
      if (query) {
        const qLower = query.toLowerCase();
        goIdeas = goIdeas.filter(q => {
          const text = (q.text || '').toLowerCase();
          return text.includes(qLower);
        });
      }

      if (userTier === 1) {
        const formatted = goIdeas.map(q => {
          const tags = q.tags || [];
          const vndTag = tags.find(t => t.startsWith('vnd:'));
          return {
            id: q.id,
            text: q.text,
            industry: q.industry,
            vnd_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
            verdict: 'go',
            source_title: q.source_title,
            _locked: true,
            _lock_message: "5層分析の全文は ANALYSIS プラン以上でご利用いただけます"
          };
        });
        
        return res.json({
          status: "ok",
          tier: tier,
          count: formatted.length,
          results: formatted,
          max_per_page: 50,
          _note: "CATALOGプラン: サマリー表示中。5層分析はANALYSIS以上で閲覧可能。"
        });
      }
      
      const formatted = goIdeas.map(q => {
        const tags = q.tags || [];
        const vndTag = tags.find(t => t.startsWith('vnd:'));
        return {
          id: q.id,
          text: q.text,
          industry: q.industry,
          insight: q.insight,
          answer: q.answer,
          vnd_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          source_doi: q.source_doi,
          source_title: q.source_title,
          verdict: 'go',
          _locked: false
        };
      });

      return res.json({
        status: "ok",
        tier: tier,
        count: formatted.length,
        results: formatted,
        _note: "全データアクセス可能"
      });
    }

    if (action === "detail") {
      if (!idea_id) {
        return res.json({ status: "error", message: "idea_idが必要です" });
      }

      const q = await entities.Question.get(idea_id);
      if (!q) {
        return res.json({ status: "error", message: "アイデアが見つかりません" });
      }

      const tags = q.tags || [];
      const vndTag = tags.find(t => t.startsWith('vnd:'));

      if (userTier === 1) {
        return res.json({
          status: "ok",
          tier: tier,
          result: {
            id: q.id,
            text: q.text,
            industry: q.industry,
            vnd_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
            verdict: 'go',
            source_title: q.source_title,
            _locked: true,
            _lock_message: "このアイデアの5層分析（研究・感情・知恵・市場・リスク）は ANALYSIS プラン以上でご利用いただけます。"
          }
        });
      }

      return res.json({
        status: "ok",
        tier: tier,
        result: {
          id: q.id,
          text: q.text,
          industry: q.industry,
          insight: q.insight,
          answer: q.answer,
          vnd_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          source_doi: q.source_doi,
          source_title: q.source_title,
          tags: q.tags,
          _locked: false
        }
      });
    }

    if (action === "trend_report") {
      const all = await entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });

      const goIdeas = all.filter(q => (q.tags || []).includes('verdict:go'));
      
      let byIndustry = {};
      let vndDistribution = { "9-10": 0, "7-8": 0, "5-6": 0, "below5": 0 };
      let totalVnd = 0;
      
      goIdeas.forEach(q => {
        const ind = q.industry || '未分類';
        if (!byIndustry[ind]) byIndustry[ind] = { count: 0, avg_vnd: 0, vnd_sum: 0 };
        byIndustry[ind].count++;
        
        const vndTag = (q.tags || []).find(t => t.startsWith('vnd:'));
        if (vndTag) {
          const vnd = parseFloat(vndTag.split(':')[1]);
          byIndustry[ind].vnd_sum += vnd;
          totalVnd += vnd;
          
          if (vnd >= 9) vndDistribution["9-10"]++;
          else if (vnd >= 7) vndDistribution["7-8"]++;
          else if (vnd >= 5) vndDistribution["5-6"]++;
          else vndDistribution["below5"]++;
        }
      });

      Object.keys(byIndustry).forEach(k => {
        byIndustry[k].avg_vnd = +(byIndustry[k].vnd_sum / byIndustry[k].count).toFixed(2);
        delete byIndustry[k].vnd_sum;
      });

      let top10 = goIdeas.map(q => {
        const vndTag = (q.tags || []).find(t => t.startsWith('vnd:'));
        return {
          text: q.text,
          industry: q.industry,
          vnd_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null
        };
      }).sort((a, b) => (b.vnd_score || 0) - (a.vnd_score || 0)).slice(0, 10);

      return res.json({
        status: "ok",
        report_date: new Date().toISOString(),
        total_ideas: goIdeas.length,
        avg_vnd: goIdeas.length > 0 ? +(totalVnd / goIdeas.length).toFixed(2) : 0,
        market_totals: {
          tam_trillion_yen: 203.92,
          sam_trillion_yen: 22.43,
          som_trillion_yen: 2.20
        },
        vnd_distribution: vndDistribution,
        by_industry: byIndustry,
        top_10: top10,
        _note: "月次トレンドレポート — 企画部向け市場動向サマリー"
      });
    }

    if (action === "search") {
      if (!query) {
        return res.json({ status: "error", message: "検索クエリが必要です" });
      }
      
      const maxLimit = Math.min(parseInt(limit) || 20, 20);
      const all = await entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });

      const qLower = query.toLowerCase();
      let goIdeas = all.filter(q => 
        (q.tags || []).includes('verdict:go') &&
        (q.text || '').toLowerCase().includes(qLower)
      );

      if (userTier === 1) {
        const formatted = goIdeas.slice(0, maxLimit).map(q => {
          const vndTag = (q.tags || []).find(t => t.startsWith('vnd:'));
          return {
            id: q.id,
            text: q.text,
            industry: q.industry,
            vnd_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
            _locked: true
          };
        });
        return res.json({ status: "ok", tier, query, count: formatted.length, results: formatted });
      }

      const formatted = goIdeas.slice(0, maxLimit).map(q => {
        const vndTag = (q.tags || []).find(t => t.startsWith('vnd:'));
        return {
          id: q.id,
          text: q.text,
          industry: q.industry,
          insight: q.insight,
          answer: q.answer,
          vnd_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          source_title: q.source_title,
          _locked: false
        };
      });
      return res.json({ status: "ok", tier, query, count: formatted.length, results: formatted });
    }

    if (action === "export_all") {
      return res.json({
        status: "blocked",
        message: "全件エクスポートはいかなるプランでも提供しておりません。",
        reason: "748件のアイデアは戦略的資産であり、一括抽出はお断りしております。",
        alternative: "検索・閲覧はCATALOGプランで無制限にご利用いただけます。個別アイデアの詳細はANALYSISプラン以上でご確認ください。",
        contact: "contact@theykhc.com"
      });
    }

    return res.json({ status: "error", message: "未知のアクションです" });

  } catch (err) {
    console.error('kikaAccess error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
