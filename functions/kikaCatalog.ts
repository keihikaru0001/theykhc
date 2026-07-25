// きかくん catalog API — IP保護ゲート付き
// 未決済ユーザーにはコードネーム+V値のみ返す。事業の中身は伏せる。
// 決済確認（access_key or user_id with hikari_balance >= 100,000）で全文開放。

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY_2') || '';
const STRIPE_API = 'https://api.stripe.com/v1';
const HIKARI_THRESHOLD = 100000;

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function verifyAccessKey(accessKey) {
  if (!accessKey || !STRIPE_SECRET) return false;
  try {
    const resp = await fetch(`${STRIPE_API}/checkout/sessions/${accessKey}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
    });
    const session = await resp.json();
    return session.payment_status === 'paid';
  } catch {
    return false;
  }
}

async function verifyHikariBalance(base44, userId) {
  if (!userId) return false;
  try {
    const fans = await base44.asServiceRole.entities.FanProfile.list({
      filter: { user_id: userId }
    });
    if (fans && fans.length > 0) {
      return (fans[0].data?.hikari_balance || 0) >= HIKARI_THRESHOLD;
    }
    return false;
  } catch {
    return false;
  }
}

function toCodename(index) {
  return `TYKHC-${String(index + 1).padStart(3, '0')}`;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') return ok({ error: 'POST/GET only' }, 405);

    const base44 = createClientFromRequest(req);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : Object.fromEntries(new URL(req.url).searchParams);
    const action = body.action || 'list';
    const accessKey = body.access_key;
    const userId = body.user_id;

    let isAuthorized = false;
    if (accessKey) {
      isAuthorized = await verifyAccessKey(accessKey);
    }
    if (!isAuthorized && userId) {
      isAuthorized = await verifyHikariBalance(base44, userId);
    }

    // --- LIST: paginated GO ideas (全件取得→JSフィルタ→JSページネーション) ---
    if (action === 'list') {
      const page = parseInt(body.page || '1');
      const limitNum = Math.min(parseInt(body.limit || '20'), 100);
      const offset = (page - 1) * limitNum;
      const { industry, query, vnd_min } = body;

      // 全件取得（status=answeredのみ）
      const results = await base44.asServiceRole.entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });

      // GO判定でフィルタ
      let goIdeas = (results || []).filter(q => {
        const tags = q.data?.tags || q.tags || [];
        return tags.includes('verdict:go');
      });

      // 追加フィルタ
      if (industry && industry !== 'all') {
        goIdeas = goIdeas.filter(q => {
          const qInd = q.data?.industry || q.industry;
          return qInd && qInd.includes(industry);
        });
      }

      if (vnd_min) {
        goIdeas = goIdeas.filter(q => {
          const vndTag = (q.data?.tags || q.tags || []).find(t => t.startsWith('vnd:'));
          if (vndTag) return parseFloat(vndTag.split(':')[1]) >= parseFloat(vnd_min);
          return false;
        });
      }

      if (query) {
        const qLower = query.toLowerCase();
        goIdeas = goIdeas.filter(q => {
          const text = (q.data?.text || q.text || '').toLowerCase();
          const insight = (q.data?.insight || q.insight || '').toLowerCase();
          return text.includes(qLower) || insight.includes(qLower);
        });
      }

      // V値降順ソート
      goIdeas.sort((a, b) => {
        const aVnd = parseFloat((a.data?.tags || a.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        const bVnd = parseFloat((b.data?.tags || b.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        return bVnd - aVnd;
      });

      const total = goIdeas.length;
      const paged = goIdeas.slice(offset, offset + limitNum);

      const formatted = paged.map((q, i) => {
        const tags = q.data?.tags || q.tags || [];
        const vndTag = tags.find(t => t.startsWith('vnd:'));
        const qIndustry = q.data?.industry || q.industry || '未分類';

        const baseData = {
          codename: toCodename(offset + i),
          v_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          industry: qIndustry,
          _locked: !isAuthorized
        };

        if (isAuthorized) {
          return {
            ...baseData,
            id: q.id,
            text: q.data?.text || q.text,
            insight: q.data?.insight || q.insight,
            answer: q.data?.answer || q.answer,
            source_doi: q.data?.source_doi || q.source_doi,
            source_title: q.data?.source_title || q.source_title,
            verdict: 'go',
            tags: tags,
            _locked: false
          };
        }
        return baseData;
      });

      return ok({
        status: 'ok',
        page,
        limit: limitNum,
        total,
        count: formatted.length,
        ideas: formatted,
        authorized: isAuthorized,
        _message: isAuthorized ? null : '事業の詳細は光貨購入（¥30,000=100,000光貨）後に開放されます'
      });
    }

    // --- STATS: aggregate summary ---
    if (action === 'stats') {
      const all = await base44.asServiceRole.entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });

      const goIdeas = (all || []).filter(q => {
        const tags = q.data?.tags || q.tags || [];
        return tags.includes('verdict:go');
      });

      const industryCounts = {};
      let totalVnd = 0;

      goIdeas.forEach(q => {
        const ind = q.data?.industry || q.industry || 'unknown';
        industryCounts[ind] = (industryCounts[ind] || 0) + 1;
        const vndTag = (q.data?.tags || q.tags || []).find(t => t.startsWith('vnd:'));
        if (vndTag) totalVnd += parseFloat(vndTag.split(':')[1]);
      });

      return ok({
        status: 'ok',
        total_go: goIdeas.length,
        avg_vnd: goIdeas.length > 0 ? (totalVnd / goIdeas.length).toFixed(2) : 0,
        industries: industryCounts,
        market_totals: {
          tam_trillion_yen: 203.92,
          sam_trillion_yen: 22.43,
          som_trillion_yen: 2.20
        }
      });
    }

    // --- DETAIL: single idea by ID ---
    if (action === 'detail') {
      const { id } = body;
      if (!id) return ok({ status: 'error', message: 'id required' }, 400);

      const q = await base44.asServiceRole.entities.Question.get(id);
      if (!q) return ok({ status: 'error', message: 'not found' }, 404);

      const tags = q.data?.tags || q.tags || [];
      const vndTag = tags.find(t => t.startsWith('vnd:'));
      const qIndustry = q.data?.industry || q.industry || '未分類';

      const all = await base44.asServiceRole.entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });
      const goIdeas = (all || []).filter(item => {
        const t = item.data?.tags || item.tags || [];
        return t.includes('verdict:go');
      });
      goIdeas.sort((a, b) => {
        const aVnd = parseFloat((a.data?.tags || a.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        const bVnd = parseFloat((b.data?.tags || b.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        return bVnd - aVnd;
      });
      const idx = goIdeas.findIndex(item => item.id === id);

      const baseData = {
        codename: idx >= 0 ? toCodename(idx) : 'TYKHC-???',
        v_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
        industry: qIndustry,
        _locked: !isAuthorized
      };

      if (isAuthorized) {
        return ok({
          status: 'ok',
          idea: {
            ...baseData,
            id: q.id,
            text: q.data?.text || q.text,
            insight: q.data?.insight || q.insight,
            answer: q.data?.answer || q.answer,
            source_doi: q.data?.source_doi || q.source_doi,
            source_title: q.data?.source_title || q.source_title,
            tags: tags,
            depth: q.data?.depth || q.depth,
            type: q.data?.type || q.type,
            _locked: false
          }
        });
      }

      return ok({
        status: 'ok',
        idea: {
          ...baseData,
          _message: '事業の詳細は光貨購入（¥30,000=100,000光貨）後に開放されます'
        }
      });
    }

    return ok({ status: 'error', message: 'unknown action' }, 400);

  } catch (err) {
    console.error('kikaCatalog error:', err);
    return ok({ status: 'error', message: err.message }, 500);
  }
});
