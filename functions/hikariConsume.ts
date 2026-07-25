// hikariConsume — 統一光貨消費関数
// 3サービス共通: 効果圏GAME / きかくん / Luna
// 各サービスが利用前に呼び出して光貨残高を確認・消費する

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// サービス別消費レート
const CONSUMPTION_RATES: Record<string, number> = {
  'effect_game_trade': 1000,      // 効果圏GAME: 1取引 = 1,000光貨
  'effect_game_ipo': 5000,         // 効果圏GAME: IPO取得 = 5,000光貨
  'kika_idea_chain': 100000,      // きかくん: ideaRiskChain 1回 = 100,000光貨
  'luna_resonance': 30000,        // Luna: 共鳴セッション 1回 = 30,000光貨
  'luna_letter': 10000,          // Luna: 週次レター = 10,000光貨
};

function ok(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return ok({ error: 'POST only' }, 405);

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action, service, amount: customAmount, description, user_id } = body;

    // ─── 残高確認 ───
    if (action === 'check_balance') {
      let user: any = null;
      try {
        user = await base44.auth.me();
      } catch (e) {
        return ok({ error: 'ログインが必要です' }, 401);
      }

      const targetUserId = user_id || user.id;
      const profiles = await base44.asServiceRole.entities.FanProfile.list({
        filter: { user_id: targetUserId }
      });

      if (!profiles || profiles.length === 0) {
        return ok({
          balance: 0,
          message: '光貨残高がありません。購入してください。'
        });
      }

      const balance = profiles[0].data?.hikari_balance || 0;
      return ok({ balance, user_id: targetUserId });
    }

    // ─── 光貨消費 ───
    if (action === 'consume') {
      let user: any = null;
      try {
        user = await base44.auth.me();
      } catch (e) {
        return ok({ error: 'ログインが必要です' }, 401);
      }

      const targetUserId = user_id || user.id;
      const consumeAmount = customAmount || CONSUMPTION_RATES[service || ''] || 0;

      if (consumeAmount <= 0) {
        return ok({ error: `無効なサービス: ${service}` }, 400);
      }

      // FanProfile取得
      const profiles = await base44.asServiceRole.entities.FanProfile.list({
        filter: { user_id: targetUserId }
      });

      if (!profiles || profiles.length === 0) {
        return ok({
          success: false,
          error: '光貨残高がありません。購入してください。',
          required: consumeAmount,
          balance: 0,
          purchase_url: 'https://theykhc.com'
        });
      }

      const profile = profiles[0];
      const currentBalance = profile.data?.hikari_balance || 0;

      if (currentBalance < consumeAmount) {
        return ok({
          success: false,
          error: '光貨が不足しています',
          required: consumeAmount,
          balance: currentBalance,
          shortage: consumeAmount - currentBalance,
          purchase_url: 'https://theykhc.com'
        });
      }

      // 残高更新
      const newBalance = currentBalance - consumeAmount;
      await base44.asServiceRole.entities.FanProfile.update(profile.id, {
        data: { hikari_balance: newBalance }
      });

      // 取引記録
      await base44.asServiceRole.entities.HikariTransaction.create({
        data: {
          user_id: targetUserId,
          amount: -consumeAmount,
          type: 'debit',
          source: service || 'unknown',
          description: description || `光貨消費: ${service}`,
        }
      });

      return ok({
        success: true,
        consumed: consumeAmount,
        remaining: newBalance,
        service
      });
    }

    // ─── 光貨付与（購入後webhookから呼ばれる）───
    if (action === 'credit') {
      // サービスロールのみ実行可能（内部API）
      const creditUserId = user_id;
      const creditAmount = customAmount || 100000;

      if (!creditUserId) {
        return ok({ error: 'user_idが必要です' }, 400);
      }

      const profiles = await base44.asServiceRole.entities.FanProfile.list({
        filter: { user_id: creditUserId }
      });

      let newBalance: number;

      if (!profiles || profiles.length === 0) {
        // 新規プロファイル作成
        await base44.asServiceRole.entities.FanProfile.create({
          data: {
            user_id: creditUserId,
            hikari_balance: creditAmount,
            membership_tier: 'free',
            interaction_count: 0,
            emotion_history: [],
            followed_artists: []
          }
        });
        newBalance = creditAmount;
      } else {
        const profile = profiles[0];
        newBalance = (profile.data?.hikari_balance || 0) + creditAmount;
        await base44.asServiceRole.entities.FanProfile.update(profile.id, {
          data: { hikari_balance: newBalance }
        });
      }

      // 取引記録
      await base44.asServiceRole.entities.HikariTransaction.create({
        data: {
          user_id: creditUserId,
          amount: creditAmount,
          type: 'credit',
          source: 'purchase',
          description: `光貨購入: ¥30,000 = ${creditAmount}光貨`
        }
      });

      return ok({
        success: true,
        credited: creditAmount,
        new_balance: newBalance
      });
    }

    return ok({ error: `無効なaction: ${action}. check_balance / consume / credit` }, 400);

  } catch (error) {
    return ok({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
