"""
TheYKHC EA — Backtest Simulator v3
通貨強弱マトリックス × V=N/D 観測者効果
+ 逆転防止ロジック（微分フィルター + トレンド確認）
"""

import yfinance as yf
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

#--- ペア定義 ---
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

#--- EA パラメータ v3 ---
LOOKBACK = 20
STRENGTH_THRESHOLD = 0.3
CLOSE_THRESHOLD = 0.1
V_LOT_MULTIPLIER = 0.5
BASE_LOT = 0.01
MAX_POSITIONS = 3
D_MAX_MULT = 1.5

# 逆転防止ロジック パラメータ
MOMENTUM_BARS = 5          # モメンタム計算バー数
MOMENTUM_THRESHOLD = 0.0  # モメンタムが正（上昇中）のみエントリー
PEAK_DECAY_BARS = 3        # ピーク後Nバーはエントリー抑制
TREND_CONFIRM_BARS = 3     # トレンド確認に必要な連続方向バー数
REVERSAL_EXIT_SPEED = 0.15 # 強弱逆転の速度閾値（スコア変化/バー）

print("=" * 60)
print("TheYKHC EA — Backtest Simulator v3")
print("通貨強弱マトリックス × V=N/D + 逆転防止ロジック")
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
            if isinstance(close, pd.DataFrame):
                close = close.iloc[:, 0]
            high = raw['High']
            if isinstance(high, pd.DataFrame):
                high = high.iloc[:, 0]
            low = raw['Low']
            if isinstance(low, pd.DataFrame):
                low = low.iloc[:, 0]
            
            pair_data[pair_name] = pd.DataFrame({
                'Close': close,
                'High': high,
                'Low': low,
                'Volume': raw['Volume'].iloc[:, 0] if isinstance(raw['Volume'], pd.DataFrame) else raw['Volume']
            })
            print(f"  ✓ {pair_name:12s} — {len(pair_data[pair_name])} bars")
        else:
            print(f"  ✗ {pair_name:12s} — データ不足")
    except Exception as e:
        print(f"  ✗ {pair_name:12s} — {e}")

print(f"\n  取得成功: {len(pair_data)}/28 ペア")

#--- 共通インデックス構築 ---
print("\n[2/5] 共通期間の構築...")

all_closes = {}
for pn, df in pair_data.items():
    all_closes[pn] = df['Close']

common_idx = None
for pn, s in all_closes.items():
    if common_idx is None:
        common_idx = s.index
    else:
        common_idx = common_idx.intersection(s.index)

if common_idx.tz is not None:
    common_idx = common_idx.tz_convert('UTC')

for pn in pair_data:
    if pair_data[pn].index.tz is not None:
        pair_data[pn] = pair_data[pn].tz_convert('UTC')

for pn in pair_data:
    pair_data[pn] = pair_data[pn].reindex(common_idx)

print(f"  共通期間: {common_idx[0]} ~ {common_idx[-1]} ({len(common_idx)} bars)")

#--- 通貨強弱スコア計算 ---
print("\n[3/5] 通貨強弱スコア計算（モメンタム付き）...")

strength_history = []
for i in range(LOOKBACK, len(common_idx)):
    scores = {c: 0.0 for c in CURRENCIES}
    d_values = []
    
    for pn, df in pair_data.items():
        current_close = float(df['Close'].iloc[i])
        past_close = float(df['Close'].iloc[i - LOOKBACK])
        
        if past_close == 0:
            continue
        
        change_rate = ((current_close - past_close) / past_close) * 100.0
        
        my_base, my_quote = PAIR_BASE_QUOTE[pn]
        yf_base, yf_quote = YF_ACTUAL_ORDER[pn]
        
        if my_base != yf_base:
            change_rate = -change_rate
        
        scores[my_base] += change_rate
        scores[my_quote] -= change_rate
        
        recent_high = float(df['High'].iloc[i])
        recent_low = float(df['Low'].iloc[i])
        if current_close > 0:
            d_values.append((recent_high - recent_low) / current_close * 100)
    
    for c in scores:
        scores[c] /= 3.5
    
    D = np.mean(d_values) if d_values else 1.0
    
    vol_changes = []
    for pn, df in pair_data.items():
        v = df['Volume'].iloc[i-LOOKBACK:i]
        if v.mean() > 0:
            vol_changes.append(float(v.iloc[-1]) / float(v.mean()))
    
    N = np.mean(vol_changes) * 50 if vol_changes else 50.0
    V = N / D if D > 0 else 0.0
    
    scores['_d'] = D
    scores['_n'] = N
    scores['_v'] = V
    scores['_timestamp'] = common_idx[i]
    strength_history.append(scores)

print(f"  強弱スコア履歴: {len(strength_history)} bars")

#--- モメンタム & ピーク検知 計算 ---
print("\n[4/5] モメンタム・ピーク検知 計算中...")

# 各通貨のスコア時系列
score_series = {c: [] for c in CURRENCIES}
for s in strength_history:
    for c in CURRENCIES:
        score_series[c].append(s[c])

# モメンタム（スコアの1次微分 = 現在スコア - Nバー前のスコア）
momentum = {c: [] for c in CURRENCIES}
for c in CURRENCIES:
    series = score_series[c]
    for i in range(len(series)):
        if i >= MOMENTUM_BARS:
            mom = series[i] - series[i - MOMENTUM_BARS]
        else:
            mom = 0.0
        momentum[c].append(mom)

# ピーク検知: モメンタムが正→負に転じた点
peak_flags = {c: [False] * len(strength_history) for c in CURRENCIES}
for c in CURRENCIES:
    for i in range(1, len(momentum[c])):
        if i > 0 and momentum[c][i-1] > 0 and momentum[c][i] <= 0:
            # ピーク検知後 PEAK_DECAY_BARS バーはフラグ
            for j in range(i, min(i + PEAK_DECAY_BARS, len(peak_flags[c]))):
                peak_flags[c][j] = True

# トレンド確認: 直近 TREND_CONFIRM_BARS バーのスコアが同方向
trend_up = {c: [False] * len(strength_history) for c in CURRENCIES}
trend_down = {c: [False] * len(strength_history) for c in CURRENCIES}
for c in CURRENCIES:
    series = score_series[c]
    for i in range(TREND_CONFIRM_BARS, len(series)):
        # 直近 N バーがすべて上昇
        increasing = all(series[i-j] > series[i-j-1] for j in range(TREND_CONFIRM_BARS))
        decreasing = all(series[i-j] < series[i-j-1] for j in range(TREND_CONFIRM_BARS))
        trend_up[c][i] = increasing
        trend_down[c][i] = decreasing

print(f"  モメンタム計算完了")
print(f"  ピーク検知: {sum(sum(peak_flags[c]) for c in CURRENCIES)} フラグ")

#--- バックテスト実行 ---
print("\n[5/5] バックテスト実行中...")

positions = []
closed_trades = []
capital = 10000.0
initial_capital = capital

# 統計用
entry_rejected = {'momentum': 0, 'peak': 0, 'no_trend': 0}
d_history = [s['_d'] for s in strength_history]

for i in range(max(MOMENTUM_BARS, TREND_CONFIRM_BARS, PEAK_DECAY_BARS), len(strength_history)):
    current = strength_history[i]
    bar_idx = i - LOOKBACK  # strength_historyのインデックス調整
    
    d_window = d_history[max(0, i-20):i]
    avg_d = np.mean(d_window) if d_window else current['_d']
    
    scores = {c: current[c] for c in CURRENCIES}
    strongest = max(scores, key=scores.get)
    weakest = min(scores, key=scores.get)
    score_diff = scores[strongest] - scores[weakest]
    
    #--- エントリー判定 ---
    if len(positions) < MAX_POSITIONS and score_diff >= STRENGTH_THRESHOLD:
        if current['_d'] < avg_d * D_MAX_MULT:
            # ★ 逆転防止ロジック 1: モメンタム確認
            # 最強通貨のモメンタムが正（上昇中）かつ最弱通貨のモメンタムが負（下落中）
            strongest_mom = momentum[strongest][i - LOOKBACK] if i - LOOKBACK < len(momentum[strongest]) else 0
            weakest_mom = momentum[weakest][i - LOOKBACK] if i - LOOKBACK < len(momentum[weakest]) else 0
            
            mom_ok = (strongest_mom > MOMENTUM_THRESHOLD) and (weakest_mom < -MOMENTUM_THRESHOLD)
            
            if not mom_ok:
                entry_rejected['momentum'] += 1
                # モメンタム条件を満たさない場合はスキップ
            else:
                # ★ 逆転防止ロジック 2: ピーク後抑制
                # 最強通貨がピーク直後でないことを確認
                peak_bar = i - LOOKBACK
                strongest_peak = peak_flags[strongest][peak_bar] if peak_bar < len(peak_flags[strongest]) else False
                weakest_peak = peak_flags[weakest][peak_bar] if peak_bar < len(peak_flags[weakest]) else False
                
                # 最強がピーク後 = 上昇トレンド終了の可能性 → スキップ
                # 最弱がピーク後（=底打ちの可能性）→ スキップ
                if strongest_peak or weakest_peak:
                    entry_rejected['peak'] += 1
                else:
                    # ★ 逆転防止ロジック 3: トレンド確認
                    # 最強通貨が上昇トレンド、最弱通貨が下落トレンド
                    trend_s_bar = i - LOOKBACK
                    strongest_trend_up = trend_up[strongest][trend_s_bar] if trend_s_bar < len(trend_up[strongest]) else False
                    weakest_trend_down = trend_down[weakest][trend_s_bar] if trend_s_bar < len(trend_down[weakest]) else False
                    
                    if not (strongest_trend_up or weakest_trend_down):
                        entry_rejected['no_trend'] += 1
                    else:
                        adjusted_lot = BASE_LOT * (1.0 + V_LOT_MULTIPLIER * min(current['_v'], 10.0) / 10.0)
                        pair_key = f"{strongest}/{weakest}"
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
                                'exit_momentum': 0,
                                'lot': adjusted_lot,
                                'entry_bar': i,
                                'entry_time': current['_timestamp'],
                                'direction': 'LONG',
                                'entry_capital': capital
                            })
    
    #--- 決済判定 ---
    for pos in positions[:]:
        long_score = current[pos['long_currency']]
        short_score = current[pos['short_currency']]
        current_diff = long_score - short_score
        
        # 現在のモメンタム
        pos_bar = i - LOOKBACK
        long_mom = momentum[pos['long_currency']][pos_bar] if pos_bar < len(momentum[pos['long_currency']]) else 0
        short_mom = momentum[pos['short_currency']][pos_bar] if pos_bar < len(momentum[pos['short_currency']]) else 0
        
        #--- 決済条件 ---
        close1 = abs(current_diff) < CLOSE_THRESHOLD
        close2 = long_score < short_score  # 強弱逆転
        
        # ★ 逆転防止ロジック 4: モメンタム逆転による早期決済
        # ロング通貨のモメンタムが負になった = 上昇が止まった
        # OR ショート通貨のモメンタムが正になった = 下落が止まった
        close2b = (long_mom < -REVERSAL_EXIT_SPEED) or (short_mom > REVERSAL_EXIT_SPEED)
        
        close3 = current['_d'] > avg_d * D_MAX_MULT * 1.5
        
        # ★ 逆転防止ロジック 5: トレンド崩壊検知
        # エントリー時のトレンド方向が崩れた
        close4 = False
        if pos['entry_momentum'] > 0 and long_mom < 0:
            # 最強通貨のモメンタムが正→負に転じた
            close4 = True
        
        if close1 or close2 or close2b or close3 or close4:
            entry_diff = pos['entry_strength_diff']
            exit_diff = current_diff
            
            # P/L計算（改良版）
            if close2:  # 強弱逆転 = 大損
                pnl_pct = -15.0
                reason = "強弱逆転"
            elif close2b:  # モメンタム逆転 = 小損で逃げる
                pnl_pct = -2.0
                reason = "モメンタム逆転"
            elif close4:  # トレンド崩壊
                pnl_pct = -1.0
                reason = "トレンド崩壊"
            elif close3:  # D急増
                pnl_pct = -2.0
                reason = "D急増"
            elif exit_diff < entry_diff * 0.3:  # ほぼ収束
                pnl_pct = 8.0 + (1 - exit_diff / entry_diff) * 5
                reason = "スコア差縮小"
            elif exit_diff < entry_diff:  # 縮小傾向
                pnl_pct = (1 - exit_diff / entry_diff) * 10
                reason = "スコア差縮小"
            else:  # 拡大
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
            positions.remove(pos)

#--- 結果出力 ---
print("\n" + "=" * 60)
print("バックテスト結果 — v3 (逆転防止ロジック付き)")
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
    
    # 決済理由別
    reasons = {}
    for t in closed_trades:
        r = t['reason']
        if r not in reasons:
            reasons[r] = {'count': 0, 'pnl': 0}
        reasons[r]['count'] += 1
        reasons[r]['pnl'] += t['pnl_usd']
    
    print(f"\n  決済理由別:")
    for r, v in sorted(reasons.items(), key=lambda x: -abs(x[1]['pnl'])):
        print(f"    {r:14s}: {v['count']:3d}回, P/L ${v['pnl']:+.2f}")

print(f"\n  エントリー除外統計:")
print(f"    モメンタム不足:   {entry_rejected['momentum']:4d}回")
print(f"    ピーク直後:       {entry_rejected['peak']:4d}回")
print(f"    トレンド未確認:   {entry_rejected['no_trend']:4d}回")

#--- v2との比較 ---
print(f"\n  v2 → v3 改善:")
v2_trades = 239
v2_pnl = -262.34
v2_winrate = 46.0
print(f"    トレード数:  {v2_trades} → {total_trades} ({total_trades - v2_trades:+d})")
print(f"    P/L:         ${v2_pnl:.2f} → ${total_pnl:.2f} ({total_pnl - v2_pnl:+.2f})")
print(f"    勝率:        {v2_winrate:.1f}% → {win_rate:.1f}% ({win_rate - v2_winrate:+.1f}pt)")

#--- トレード履歴 ---
print(f"\n  トレード履歴 (全{total_trades}件)")
print(f"  {'No.':>4} {'Entry':>12} {'Exit':>12} {'Pair':>10} {'V':>5} {'Diff→Diff':>12} {'P/L':>8} {'Reason':>14} {'Bars':>4}")
print("  " + "-" * 90)
for idx, t in enumerate(closed_trades):
    print(f"  {idx+1:>4} {t['entry_time'].strftime('%m/%d %H:%M'):>12} {t['exit_time'].strftime('%m/%d %H:%M'):>12}"
          f" {t['pair']:>10s} {t['entry_v']:>5.1f}"
          f" {t['entry_strength_diff']:.2f}→{t['exit_strength_diff']:.2f}"
          f" ${t['pnl_usd']:>+6.2f} {t['reason']:>14s} {t['bars_held']:>4d}")

print(f"\n{'='*60}")
print(f"TheYKHC EA v3 Backtest Complete")
print(f"{'='*60}")
