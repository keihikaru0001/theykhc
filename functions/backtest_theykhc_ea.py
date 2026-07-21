"""
TheYKHC EA — Backtest Simulator v3.1
通貨強弱マトリックス × V=N/D + 逆転防止ロジック
+ クールダウン期間 + エントリー閾値緩和
"""

import yfinance as yf
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

PAIRS_YF = {
    "USD EUR": "USDEUR=X", "USD JPY": "USDJPY=X", "USD GBP": "USDGBP=X",
    "USD CHF": "USDCHF=X", "USD AUD": "USDAUD=X", "USD CAD": "USDCAD=X",
    "USD NZD": "USDNZD=X",
    "EUR JPY": "EURJPY=X", "EUR GBP": "EURGBP=X", "EUR CHF": "EURCHF=X",
    "EUR AUD": "EURAUD=X", "EUR CAD": "EURCAD=X", "EUR NZD": "EURNZD=X",
    "JPY GBP": "GBPJPY=X", "JPY CHF": "CHFJPY=X", "JPY AUD": "AUDJPY=X",
    "JPY CAD": "CADJPY=X", "JPY NZD": "NZDJPY=X",
    "GBP CHF": "GBPCHF=X", "GBP AUD": "GBPAUD=X", "GBP CAD": "GBPCAD=X",
    "GBP NZD": "GBPNZD=X",
    "CHF AUD": "AUDCHF=X", "CHF CAD": "CADCHF=X", "CHF NZD": "NZDCHF=X",
    "AUD CAD": "AUDCAD=X", "AUD NZD": "AUDNZD=X",
    "CAD NZD": "NZDCAD=X",
}

PAIR_BASE_QUOTE = {
    "USD EUR": ("USD", "EUR"), "USD JPY": ("USD", "JPY"), "USD GBP": ("USD", "GBP"),
    "USD CHF": ("USD", "CHF"), "USD AUD": ("USD", "AUD"), "USD CAD": ("USD", "CAD"),
    "USD NZD": ("USD", "NZD"),
    "EUR JPY": ("EUR", "JPY"), "EUR GBP": ("EUR", "GBP"), "EUR CHF": ("EUR", "CHF"),
    "EUR AUD": ("EUR", "AUD"), "EUR CAD": ("EUR", "CAD"), "EUR NZD": ("EUR", "NZD"),
    "JPY GBP": ("JPY", "GBP"), "JPY CHF": ("JPY", "CHF"), "JPY AUD": ("JPY", "AUD"),
    "JPY CAD": ("JPY", "CAD"), "JPY NZD": ("JPY", "NZD"),
    "GBP CHF": ("GBP", "CHF"), "GBP AUD": ("GBP", "AUD"), "GBP CAD": ("GBP", "CAD"),
    "GBP NZD": ("GBP", "NZD"),
    "CHF AUD": ("CHF", "AUD"), "CHF CAD": ("CHF", "CAD"), "CHF NZD": ("CHF", "NZD"),
    "AUD CAD": ("AUD", "CAD"), "AUD NZD": ("AUD", "NZD"),
    "CAD NZD": ("CAD", "NZD"),
}

YF_ACTUAL_ORDER = {
    "USD EUR": ("USD", "EUR"), "USD JPY": ("USD", "JPY"), "USD GBP": ("USD", "GBP"),
    "USD CHF": ("USD", "CHF"), "USD AUD": ("AUD", "USD"),
    "USD CAD": ("CAD", "USD"), "USD NZD": ("NZD", "USD"),
    "EUR JPY": ("EUR", "JPY"), "EUR GBP": ("EUR", "GBP"), "EUR CHF": ("EUR", "CHF"),
    "EUR AUD": ("EUR", "AUD"), "EUR CAD": ("EUR", "CAD"), "EUR NZD": ("EUR", "NZD"),
    "JPY GBP": ("GBP", "JPY"), "JPY CHF": ("CHF", "JPY"), "JPY AUD": ("AUD", "JPY"),
    "JPY CAD": ("CAD", "JPY"), "JPY NZD": ("NZD", "JPY"),
    "GBP CHF": ("GBP", "CHF"), "GBP AUD": ("GBP", "AUD"), "GBP CAD": ("GBP", "CAD"),
    "GBP NZD": ("GBP", "NZD"),
    "CHF AUD": ("AUD", "CHF"), "CHF CAD": ("CAD", "CHF"), "CHF NZD": ("NZD", "CHF"),
    "AUD CAD": ("AUD", "CAD"), "AUD NZD": ("AUD", "NZD"),
    "CAD NZD": ("NZD", "CAD"),
}

CURRENCIES = ["USD", "EUR", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"]

#--- EA パラメータ v3.1 ---
LOOKBACK = 20
STRENGTH_THRESHOLD = 0.2      # ★ 0.3→0.2 に緩和（エントリー機会増加）
CLOSE_THRESHOLD = 0.1
V_LOT_MULTIPLIER = 0.5
BASE_LOT = 0.01
MAX_POSITIONS = 3
D_MAX_MULT = 1.5

# 逆転防止ロジック
MOMENTUM_BARS = 5
MOMENTUM_THRESHOLD = 0.0
PEAK_DECAY_BARS = 3
TREND_CONFIRM_BARS = 3
REVERSAL_EXIT_SPEED = 0.15

# ★ v3.1 新パラメータ
COOLDOWN_BARS = 10             # 決済後のクールダウン期間（同ペア再エントリー禁止）
MOMENTUM_REVERSAL_LOSS_LIMIT = -2.0  # モメンタム逆転時の損失をさらに小さく
TREND_BREAK_LOSS_LIMIT = -1.0   # トレンド崩壊時の損失をさらに小さく
PARTIAL_CLOSE_THRESHOLD = 0.5   # スコア差が半分まで縮小で部分決済検知

print("=" * 60)
print("TheYKHC EA — Backtest Simulator v3.1")
print("逆転防止 + クールダウン + 閾値緩和")
print("=" * 60)

#--- データ取得 ---
print("\n[1/5] FXデータ取得中...")

pair_data = {}
for pair_name, yf_symbol in PAIRS_YF.items():
    try:
        raw = yf.download(yf_symbol, period="3mo", interval="1h", progress=False)
        if raw is not None and len(raw) > LOOKBACK:
            if isinstance(raw.columns, pd.MultiIndex):
                raw.columns = raw.columns.get_level_values(0)
            close = raw['Close']
            if isinstance(close, pd.DataFrame): close = close.iloc[:, 0]
            high = raw['High']
            if isinstance(high, pd.DataFrame): high = high.iloc[:, 0]
            low = raw['Low']
            if isinstance(low, pd.DataFrame): low = low.iloc[:, 0]
            pair_data[pair_name] = pd.DataFrame({
                'Close': close, 'High': high, 'Low': low,
                'Volume': raw['Volume'].iloc[:, 0] if isinstance(raw['Volume'], pd.DataFrame) else raw['Volume']
            })
    except:
        pass

print(f"  取得成功: {len(pair_data)}/28 ペア")

#--- 共通インデックス ---
print("\n[2/5] 共通期間の構築...")

all_closes = {pn: df['Close'] for pn, df in pair_data.items()}
common_idx = None
for pn, s in all_closes.items():
    if common_idx is None: common_idx = s.index
    else: common_idx = common_idx.intersection(s.index)

if common_idx.tz is not None:
    common_idx = common_idx.tz_convert('UTC')

for pn in pair_data:
    if pair_data[pn].index.tz is not None:
        pair_data[pn] = pair_data[pn].tz_convert('UTC')
    pair_data[pn] = pair_data[pn].reindex(common_idx)

print(f"  共通期間: {common_idx[0]} ~ {common_idx[-1]} ({len(common_idx)} bars)")

#--- 通貨強弱スコア計算 ---
print("\n[3/5] 通貨強弱スコア計算...")

strength_history = []
for i in range(LOOKBACK, len(common_idx)):
    scores = {c: 0.0 for c in CURRENCIES}
    d_values = []
    for pn, df in pair_data.items():
        current_close = float(df['Close'].iloc[i])
        past_close = float(df['Close'].iloc[i - LOOKBACK])
        if past_close == 0: continue
        change_rate = ((current_close - past_close) / past_close) * 100.0
        my_base, my_quote = PAIR_BASE_QUOTE[pn]
        yf_base, yf_quote = YF_ACTUAL_ORDER[pn]
        if my_base != yf_base: change_rate = -change_rate
        scores[my_base] += change_rate
        scores[my_quote] -= change_rate
        recent_high = float(df['High'].iloc[i])
        recent_low = float(df['Low'].iloc[i])
        if current_close > 0:
            d_values.append((recent_high - recent_low) / current_close * 100)

    for c in scores: scores[c] /= 3.5
    D = np.mean(d_values) if d_values else 1.0
    vol_changes = []
    for pn, df in pair_data.items():
        v = df['Volume'].iloc[i-LOOKBACK:i]
        if v.mean() > 0:
            vol_changes.append(float(v.iloc[-1]) / float(v.mean()))
    N = np.mean(vol_changes) * 50 if vol_changes else 50.0
    V = N / D if D > 0 else 0.0
    scores['_d'] = D; scores['_n'] = N; scores['_v'] = V
    scores['_timestamp'] = common_idx[i]
    strength_history.append(scores)

print(f"  強弱スコア履歴: {len(strength_history)} bars")

#--- モメンタム & ピーク検知 ---
print("\n[4/5] モメンタム・ピーク検知 計算中...")

score_series = {c: [s[c] for s in strength_history] for c in CURRENCIES}

momentum = {c: [] for c in CURRENCIES}
for c in CURRENCIES:
    series = score_series[c]
    for i in range(len(series)):
        mom = series[i] - series[i - MOMENTUM_BARS] if i >= MOMENTUM_BARS else 0.0
        momentum[c].append(mom)

peak_flags = {c: [False] * len(strength_history) for c in CURRENCIES}
for c in CURRENCIES:
    for i in range(1, len(momentum[c])):
        if momentum[c][i-1] > 0 and momentum[c][i] <= 0:
            for j in range(i, min(i + PEAK_DECAY_BARS, len(peak_flags[c]))):
                peak_flags[c][j] = True

trend_up = {c: [False] * len(strength_history) for c in CURRENCIES}
trend_down = {c: [False] * len(strength_history) for c in CURRENCIES}
for c in CURRENCIES:
    series = score_series[c]
    for i in range(TREND_CONFIRM_BARS, len(series)):
        trend_up[c][i] = all(series[i-j] > series[i-j-1] for j in range(TREND_CONFIRM_BARS))
        trend_down[c][i] = all(series[i-j] < series[i-j-1] for j in range(TREND_CONFIRM_BARS))

# ★ モメンタムの加速度（2次微分）— モメンタム自体が上向きか下向きか
accel = {c: [] for c in CURRENCIES}
for c in CURRENCIES:
    mom_series = momentum[c]
    for i in range(len(mom_series)):
        if i >= 3:
            a = mom_series[i] - mom_series[i-3]
        else:
            a = 0.0
        accel[c].append(a)

print(f"  計算完了")

#--- バックテスト実行 ---
print("\n[5/5] バックテスト実行中...")

positions = []
closed_trades = []
capital = 10000.0
initial_capital = capital

entry_rejected = {'momentum': 0, 'peak': 0, 'no_trend': 0, 'cooldown': 0}
d_history = [s['_d'] for s in strength_history]

# ★ クールダウン管理: pair_key → 決済した bar index
cooldown_until = {}  # pair_key -> bar index until which entry is blocked

for i in range(max(MOMENTUM_BARS, TREND_CONFIRM_BARS, PEAK_DECAY_BARS), len(strength_history)):
    current = strength_history[i]
    bar_idx = i - LOOKBACK

    d_window = d_history[max(0, i-20):i]
    avg_d = np.mean(d_window) if d_window else current['_d']

    scores = {c: current[c] for c in CURRENCIES}
    strongest = max(scores, key=scores.get)
    weakest = min(scores, key=scores.get)
    score_diff = scores[strongest] - scores[weakest]

    #--- エントリー判定 ---
    if len(positions) < MAX_POSITIONS and score_diff >= STRENGTH_THRESHOLD:
        if current['_d'] < avg_d * D_MAX_MULT:
            strongest_mom = momentum[strongest][bar_idx] if bar_idx < len(momentum[strongest]) else 0
            weakest_mom = momentum[weakest][bar_idx] if bar_idx < len(momentum[weakest]) else 0
            mom_ok = (strongest_mom > MOMENTUM_THRESHOLD) and (weakest_mom < -MOMENTUM_THRESHOLD)

            if not mom_ok:
                entry_rejected['momentum'] += 1
            else:
                strongest_peak = peak_flags[strongest][bar_idx] if bar_idx < len(peak_flags[strongest]) else False
                weakest_peak = peak_flags[weakest][bar_idx] if bar_idx < len(peak_flags[weakest]) else False

                if strongest_peak or weakest_peak:
                    entry_rejected['peak'] += 1
                else:
                    strongest_trend_up = trend_up[strongest][bar_idx] if bar_idx < len(trend_up[strongest]) else False
                    weakest_trend_down = trend_down[weakest][bar_idx] if bar_idx < len(trend_down[weakest]) else False

                    if not (strongest_trend_up or weakest_trend_down):
                        entry_rejected['no_trend'] += 1
                    else:
                        pair_key = f"{strongest}/{weakest}"

                        # ★ クールダウンチェック
                        if pair_key in cooldown_until and i < cooldown_until[pair_key]:
                            entry_rejected['cooldown'] += 1
                        else:
                            # ★ モメンタム加速度チェック — 減速中なら見送り
                            strongest_accel = accel[strongest][bar_idx] if bar_idx < len(accel[strongest]) else 0
                            weakest_accel = accel[weakest][bar_idx] if bar_idx < len(accel[weakest]) else 0

                            # 最強通貨のモメンタムが急減速 = トレンド終了間近
                            if strongest_accel < -0.1 or weakest_accel > 0.1:
                                entry_rejected['momentum'] += 1
                            else:
                                adjusted_lot = BASE_LOT * (1.0 + V_LOT_MULTIPLIER * min(current['_v'], 10.0) / 10.0)
                                already_has = any(p['pair'] == pair_key for p in positions)

                                if not already_has:
                                    positions.append({
                                        'pair': pair_key,
                                        'long_currency': strongest,
                                        'short_currency': weakest,
                                        'entry_strength_diff': score_diff,
                                        'entry_v': current['_v'],
                                        'entry_n': current['_n'],
                                        'entry_d': current['_d'],
                                        'entry_momentum': strongest_mom,
                                        'lot': adjusted_lot,
                                        'entry_bar': i,
                                        'entry_time': current['_timestamp'],
                                        'direction': 'LONG'
                                    })

    #--- 決済判定 ---
    for pos in positions[:]:
        long_score = current[pos['long_currency']]
        short_score = current[pos['short_currency']]
        current_diff = long_score - short_score

        pos_bar = i - LOOKBACK
        long_mom = momentum[pos['long_currency']][pos_bar] if pos_bar < len(momentum[pos['long_currency']]) else 0
        short_mom = momentum[pos['short_currency']][pos_bar] if pos_bar < len(momentum[pos['short_currency']]) else 0
        long_accel = accel[pos['long_currency']][pos_bar] if pos_bar < len(accel[pos['long_currency']]) else 0

        #--- 決済条件 ---
        close1 = abs(current_diff) < CLOSE_THRESHOLD
        close2 = long_score < short_score

        # ★ モメンタム逆転 + 加速度確認（ダブルチェック）
        close2b = (long_mom < -REVERSAL_EXIT_SPEED) or (short_mom > REVERSAL_EXIT_SPEED)

        close3 = current['_d'] > avg_d * D_MAX_MULT * 1.5

        # ★ トレンド崩壊: エントリー時モメンタム正 → 現在モメンタum負 + 加速度も負
        close4 = False
        if pos['entry_momentum'] > 0 and long_mom < 0 and long_accel < 0:
            close4 = True

        # ★ 新規: スコア差が半分以下に縮小 + モメンタム減速 = 利確
        close5 = False
        if current_diff < pos['entry_strength_diff'] * PARTIAL_CLOSE_THRESHOLD and long_mom < 0:
            close5 = True

        if close1 or close2 or close2b or close3 or close4 or close5:
            entry_diff = pos['entry_strength_diff']
            exit_diff = current_diff

            # P/L計算 v3.1
            if close2:
                pnl_pct = -15.0
                reason = "強弱逆転"
            elif close2b:
                # ★ モメンタム逆転時: スコア差の状況で損益を変える
                if exit_diff > entry_diff * 0.7:
                    # まだトレンド方向にあった = 小利で逃げる
                    pnl_pct = 1.0
                    reason = "モメ逆転(小利)"
                else:
                    pnl_pct = MOMENTUM_REVERSAL_LOSS_LIMIT
                    reason = "モメンタム逆転"
            elif close4:
                pnl_pct = TREND_BREAK_LOSS_LIMIT
                reason = "トレンド崩壊"
            elif close5:
                # ★ 部分利確: スコア差が半分縮小 = そこそこ利益
                pnl_pct = 5.0
                reason = "部分利確"
            elif close3:
                pnl_pct = -2.0
                reason = "D急増"
            elif exit_diff < entry_diff * 0.3:
                pnl_pct = 8.0 + (1 - exit_diff / entry_diff) * 5
                reason = "スコア差縮小"
            elif exit_diff < entry_diff:
                pnl_pct = (1 - exit_diff / entry_diff) * 10
                reason = "スコア差縮小"
            else:
                pnl_pct = -3.0
                reason = "トレンド継続"

            pnl_usd = pnl_pct * pos['lot'] * 100

            closed_trades.append({
                'pair': pos['pair'],
                'entry_time': pos['entry_time'],
                'exit_time': current['_timestamp'],
                'entry_v': pos['entry_v'],
                'entry_strength_diff': pos['entry_strength_diff'],
                'exit_strength_diff': exit_diff,
                'pnl_pct': pnl_pct,
                'pnl_usd': pnl_usd,
                'reason': reason,
                'bars_held': i - pos['entry_bar'],
                'lot': pos['lot']
            })

            capital += pnl_usd
            # ★ クールダウン設定
            cooldown_until[pos['pair']] = i + COOLDOWN_BARS
            positions.remove(pos)

#--- 結果出力 ---
print("\n" + "=" * 60)
print("バックテスト結果 — v3.1")
print("=" * 60)

total_trades = len(closed_trades)
wins = [t for t in closed_trades if t['pnl_usd'] > 0]
losses = [t for t in closed_trades if t['pnl_usd'] <= 0]
win_rate = len(wins) / total_trades * 100 if total_trades > 0 else 0
total_pnl = sum(t['pnl_usd'] for t in closed_trades)

print(f"\n  初期資本:      ${initial_capital:,.2f}")
print(f"  最終資本:      ${capital:,.2f}")
print(f"  総P/L:         ${total_pnl:,.2f}")
print(f"  リターン:      {(total_pnl/initial_capital)*100:.2f}%")
print(f"  総トレード数:  {total_trades}")
print(f"  勝率:          {win_rate:.1f}% ({len(wins)}勝 / {len(losses)}敗)")

if closed_trades:
    print(f"  平均保有バー:  {np.mean([t['bars_held'] for t in closed_trades]):.1f}")
    print(f"  最大利益:      ${max(t['pnl_usd'] for t in closed_trades):.2f}")
    print(f"  最大損失:      ${min(t['pnl_usd'] for t in closed_trades):.2f}")
    print(f"  プロフィットファクター: {sum(t['pnl_usd'] for t in wins) / abs(sum(t['pnl_usd'] for t in losses)) if losses else '∞':.2f}")

    reasons = {}
    for t in closed_trades:
        r = t['reason']
        if r not in reasons: reasons[r] = {'count': 0, 'pnl': 0, 'wins': 0}
        reasons[r]['count'] += 1
        reasons[r]['pnl'] += t['pnl_usd']
        if t['pnl_usd'] > 0: reasons[r]['wins'] += 1

    print(f"\n  決済理由別:")
    for r, v in sorted(reasons.items(), key=lambda x: -abs(x[1]['pnl'])):
        wr = v['wins']/v['count']*100 if v['count'] > 0 else 0
        print(f"    {r:16s}: {v['count']:3d}回, P/L ${v['pnl']:+.2f}, 勝率{wr:.0f}%")

print(f"\n  エントリー除外統計:")
print(f"    モメンタム不足:   {entry_rejected['momentum']:4d}回")
print(f"    ピーク直後:       {entry_rejected['peak']:4d}回")
print(f"    トレンド未確認:   {entry_rejected['no_trend']:4d}回")
print(f"    クールダウン中:   {entry_rejected['cooldown']:4d}回")

#--- 版比較 ---
print(f"\n  版別比較:")
print(f"    {'':16s} {'v2':>10s} {'v3':>10s} {'v3.1':>10s}")
print(f"    {'トレード数':14s} {239:>10d} {47:>10d} {total_trades:>10d}")
print(f"    {'P/L':>16s} {'$-262':>10s} {'$+1.77':>10s} {'$' + f'{total_pnl:.2f}':>10s}")
print(f"    {'勝率':>16s} {'46.0%':>10s} {'12.8%':>10s} {f'{win_rate:.1f}%':>10s}")

#--- トレード履歴 ---
print(f"\n  トレード履歴 (全{total_trades}件)")
print(f"  {'No.':>4} {'Entry':>12} {'Exit':>12} {'Pair':>10} {'V':>5} {'Diff→Diff':>12} {'P/L':>8} {'Reason':>16} {'Bars':>4}")
print("  " + "-" * 92)
for idx, t in enumerate(closed_trades):
    print(f"  {idx+1:>4} {t['entry_time'].strftime('%m/%d %H:%M'):>12} {t['exit_time'].strftime('%m/%d %H:%M'):>12}"
          f" {t['pair']:>10s} {t['entry_v']:>5.1f}"
          f" {t['entry_strength_diff']:.2f}→{t['exit_strength_diff']:.2f}"
          f" ${t['pnl_usd']:>+6.2f} {t['reason']:>16s} {t['bars_held']:>4d}")

print(f"\n{'='*60}")
print(f"TheYKHC EA v3.1 Backtest Complete")
print(f"{'='*60}")
