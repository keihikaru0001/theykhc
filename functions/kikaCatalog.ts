// きかくん catalog API — serves 748 GO ideas from Ikoi's Question entity
// Called by きかくん app (6a5fa5bb08588e511ecfd2ce) via HTTP

import { entities } from '@base44/sdk';

export default async function kikaCatalog(req, res) {
  try {
    const { action = 'list', industry, page = '1', limit = '20', query, vnd_min } = req.body || req.query || {};

    // --- LIST: paginated GO ideas with optional filters ---
    if (action === 'list') {
      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100);
      const skip = (pageNum - 1) * limitNum;

      const results = await entities.Question.list({
        filter: { status: 'answered' },
        skip,
        limit: limitNum,
        sort: '-updated_date'
      });

      // Filter GO verdict + optional filters in-memory
      let filtered = results.filter(q => {
        const tags = q.tags || [];
        const isGo = tags.some(t => t === 'verdict:go');
        if (!isGo) return false;
        
        if (industry && q.industry !== industry) return false;
        
        if (vnd_min) {
          const vndTag = tags.find(t => t.startsWith('vnd:'));
          if (vndTag) {
            const vnd = parseFloat(vndTag.split(':')[1]);
            if (vnd < parseFloat(vnd_min)) return false;
          }
        }
        
        if (query) {
          const qLower = query.toLowerCase();
          const text = (q.text || '').toLowerCase();
          const insight = (q.insight || '').toLowerCase();
          if (!text.includes(qLower) && !insight.includes(qLower)) return false;
        }
        
        return true;
      });

      const formatted = filtered.map(q => {
        const tags = q.tags || [];
        const vndTag = tags.find(t => t.startsWith('vnd:'));
        return {
          id: q.id,
          text: q.text,
          industry: q.industry,
          insight: q.insight,
          answer: q.answer,
          vnd: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          source_doi: q.source_doi,
          source_title: q.source_title,
          verdict: 'go',
          tags: q.tags
        };
      });

      return res.json({
        status: 'ok',
        page: pageNum,
        limit: limitNum,
        count: formatted.length,
        ideas: formatted
      });
    }

    // --- STATS: aggregate summary ---
    if (action === 'stats') {
      const all = await entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });

      const goIdeas = all.filter(q => (q.tags || []).includes('verdict:go'));
      
      const industryCounts = {};
      const vndDistribution = {};
      let totalVnd = 0;
      
      goIdeas.forEach(q => {
        const ind = q.industry || 'unknown';
        industryCounts[ind] = (industryCounts[ind] || 0) + 1;
        
        const vndTag = (q.tags || []).find(t => t.startsWith('vnd:'));
        if (vndTag) {
          const vnd = vndTag.split(':')[1];
          vndDistribution[vnd] = (vndDistribution[vnd] || 0) + 1;
          totalVnd += parseFloat(vnd);
        }
      });

      return res.json({
        status: 'ok',
        total_go: goIdeas.length,
        avg_vnd: goIdeas.length > 0 ? (totalVnd / goIdeas.length).toFixed(2) : 0,
        industries: industryCounts,
        vnd_distribution: vndDistribution,
        market_totals: {
          tam_trillion_yen: 203.92,
          sam_trillion_yen: 22.43,
          som_trillion_yen: 2.20
        }
      });
    }

    // --- DETAIL: single idea by ID ---
    if (action === 'detail') {
      const { id } = req.body || req.query || {};
      if (!id) {
        return res.status(400).json({ status: 'error', message: 'id required' });
      }

      const q = await entities.Question.get(id);
      if (!q) {
        return res.status(404).json({ status: 'error', message: 'not found' });
      }

      const tags = q.tags || [];
      const vndTag = tags.find(t => t.startsWith('vnd:'));

      return res.json({
        status: 'ok',
        idea: {
          id: q.id,
          text: q.text,
          industry: q.industry,
          insight: q.insight,
          answer: q.answer,
          vnd: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          source_doi: q.source_doi,
          source_title: q.source_title,
          tags: q.tags,
          depth: q.depth,
          type: q.type
        }
      });
    }

    return res.status(400).json({ status: 'error', message: 'unknown action' });

  } catch (err) {
    console.error('kikaCatalog error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
