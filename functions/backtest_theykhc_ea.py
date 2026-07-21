"""
TheYKHC EA — Backtest Simulator v2
通貨強弱マトリックス × V=N/D 観測者効果
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
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

# yfinanceの実際の表示順序（上がbase）
YF_ACTUAL_ORDER = {
    "USD EUR": ("USD", "EUR"), "USD JPY": ("USD", "JPY"), "USD GBP": ("USD", "GBP"),
    "USD CHF": ("USD", "CHF"), "USD AUD": ("AUD", "USD"),  # USDAUD=X は AUD/USD
    "USD CAD": ("CAD", "USD"),  # USDCAD=X は CAD/USD (実際はUSD/CADとして表示される場合あり)
    "USD NZD": ("NZD", "USD"),  # USDNZD=X は NZD/USD
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

#--- EA パラメータ ---
LOOKBACK = 20
STRENGTH_THRESHOLD = 0.3
CLOSE_THRESHOLD = 0.1
V_LOT_MULTIPLIER = 0.5
BASE_LOT = 0.01
MAX_POSITIONS = 3
D_MAX_MULT = 1.5

print("=" * 60)
print("TheYKHC EA — Backtest Simulator v2")
print("通貨強弱マトリックス × V=N/D 観測者効果")
print("=" * 60)

#--- データ取得 ---
print("\n[1/5] FXデータ取得中...")

pair_data = {}  # pair_name -> DataFrame with Close, High, Low, Volume

for pair_name, yf_symbol in PAIRS_YF.items():
    try:
        raw = yf.download(yf_symbol, period="3mo", interval="1h", progress=False)
        if raw is not None and len(raw) > LOOKBACK:
            # MultiIndexカラムを平坦化
            if isinstance(raw.columns, pd.MultiIndex):
                raw.columns = raw.columns.get_level_values(0)
            
            # Closeを単一Seriesに変換
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

# タイムゾーン統一
if common_idx.tz is not None:
    common_idx = common_idx.tz_convert('UTC')

# 各ペアのインデックスもUTC化
for pn in pair_data:
    if pair_data[pn].index.tz is not None:
        pair_data[pn] = pair_data[pn].tz_convert('UTC')

# 共通インデックスで再構築
for pn in pair_data:
    pair_data[pn] = pair_data[pn].reindex(common_idx)

print(f"  共通期間: {common_idx[0]} ~ {common_idx[-1]} ({len(common_idx)} bars)")

#--- 通貨強弱スコア計算 ---
print("\n[3/5] 通貨強弱スコア計算 & バックテスト...")

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
        
        # 我々の定義のbase/quote
        my_base, my_quote = PAIR_BASE_QUOTE[pn]
        # yfinanceの実際の順序
        yf_base, yf_quote = YF_ACTUAL_ORDER[pn]
        
        # yfinanceの表示と我々の定義が逆の場合、符号反転
        if my_base != yf_base:
            change_rate = -change_rate
        
        scores[my_base] += change_rate
        scores[my_quote] -= change_rate
        
        # D計算用: レンジ/価格
        recent_high = float(df['High'].iloc[i])
        recent_low = float(df['Low'].iloc[i])
        if current_close > 0:
            d_values.append((recent_high - recent_low) / current_close * 100)
    
    # 正規化
    for c in scores:
        scores[c] /= 3.5
    
    # D値
    D = np.mean(d_values) if d_values else 1.0
    
    # N値（ボラティリティの変動を代替として使用）
    # 直近20バーの出来高変動率
    vol_changes = []
    for pn, df in pair_data.items():
        v = df['Volume'].iloc[i-LOOKBACK:i]
        if v.mean() > 0:
            vol_changes.append(float(v.iloc[-1]) / float(v.mean()))
    
    N = np.mean(vol_changes) * 50 if vol_changes else 50.0
    
    # V = N / D
    V = N / D if D > 0 else 0.0
    
    scores['_d'] = D
    scores['_n'] = N
    scores['_v'] = V
    scores['_timestamp'] = common_idx[i]
    strength_history.append(scores)

print(f"  強弱スコア履歴: {len(strength_history)} bars")

#--- バックテスト実行 ---
print("\n[4/5] バックテスト実行中...")

positions = []
closed_trades = []
capital = 10000.0
initial_capital = capital
equity_curve = []

# D平均用の履歴
d_history = [s['_d'] for s in strength_history]

for i in range(1, len(strength_history)):
    current = strength_history[i]
    
    # D平均
    d_window = d_history[max(0, i-20):i]
    avg_d = np.mean(d_window) if d_window else current['_d']
    
    # 通貨強弱ランキング
    scores = {c: current[c] for c in CURRENCIES}
    strongest = max(scores, key=scores.get)
    weakest = min(scores, key=scores.get)
    score_diff = scores[strongest] - scores[weakest]
    
    #--- エントリー判定 ---
    if len(positions) < MAX_POSITIONS and score_diff >= STRENGTH_THRESHOLD:
        # Dフィルター
        if current['_d'] < avg_d * D_MAX_MULT:
            # ロット計算
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
        
        close1 = abs(current_diff) < CLOSE_THRESHOLD
        close2 = long_score < short_score  # 強弱逆転
        close3 = current['_d'] > avg_d * D_MAX_MULT * 1.5
        
        if close1 or close2 or close3:
            # P/L計算（強弱差の変化を利益の代理）
            entry_diff = pos['entry_strength_diff']
            exit_diff = current_diff
            
            # 強弱差が縮小 → 利益（トレンドが収束した = 予測的中）
            # 強弱差が拡大 → 損失（トレンドが継続 = まだ収束してない）
            # 強弱逆転 → 大損
            
            if close2:  # 強弱逆転 = 大損
                pnl_pct = -15.0
            elif exit_diff < entry_diff * 0.3:  # ほぼ収束
                pnl_pct = 8.0 + (1 - exit_diff / entry_diff) * 5
            elif exit_diff < entry_diff:  # 縮小傾向
                pnl_pct = (1 - exit_diff / entry_diff) * 10
            else:  # 拡大 = まだトレンド中
                pnl_pct = -3.0
            
            if close3:  # D急増による強制決済
                pnl_pct = min(pnl_pct, -2.0)  # 損益関係なく小さくマイナス
            
            pnl_usd = pnl_pct * pos['lot'] * 100
            
            reason = "スコア差縮小" if close1 else ("強弱逆転" if close2 else "D急増")
            
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
    
    equity_curve.append({
        'timestamp': current['_timestamp'],
        'capital': capital,
        'open_positions': len(positions),
        'v_score': current['_v'],
        'n_value': current['_n'],
        'd_value': current['_d'],
        'strongest': strongest,
        'weakest': weakest,
        'score_diff': score_diff
    })

#--- 結果出力 ---
print("\n[5/5] バックテスト結果")
print("=" * 60)

total_trades = len(closed_trades)
wins = [t for t in closed_trades if t['pnl_usd'] > 0]
losses = [t for t in closed_trades if t['pnl_usd'] <= 0]
win_rate = len(wins) / total_trades * 100 if total_trades > 0 else 0
total_pnl = sum(t['pnl_usd'] for t in closed_trades)
avg_v = np.mean([t['entry_v'] for t in closed_trades]) if closed_trades else 0

print(f"\n  初期資本:      ${initial_capital:,.2f}")
print(f"  最終資本:      ${capital:,.2f}")
print(f"  総P/L:         ${total_pnl:,.2f}")
print(f"  リターン:      {(total_pnl/initial_capital)*100:.2f}%")
print(f"  総トレード数:  {total_trades}")
print(f"  勝率:          {win_rate:.1f}% ({len(wins)}勝 / {len(losses)}敗)")
print(f"  平均V=N/D:     {avg_v:.2f}")
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
    for r, v in sorted(reasons.items(), key=lambda x: -x[1]['count']):
        print(f"    {r:12s}: {v['count']:3d}回, P/L ${v['pnl']:+.2f}")

#--- トレード履歴 ---
print(f"\n  トレード履歴 (全{total_trades}件)")
print(f"  {'No.':>4} {'Entry':>12} {'Exit':>12} {'Pair':>10} {'V':>5} {'Diff→Diff':>12} {'P/L':>8} {'Reason':>10} {'Bars':>4}")
print("  " + "-" * 80)
for idx, t in enumerate(closed_trades):
    print(f"  {idx+1:>4} {t['entry_time'].strftime('%m/%d %H:%M'):>12} {t['exit_time'].strftime('%m/%d %H:%M'):>12}"
          f" {t['pair']:>10s} {t['entry_v']:>5.1f}"
          f" {t['entry_strength_diff']:.2f}→{t['exit_strength_diff']:.2f}"
          f" ${t['pnl_usd']:>+6.2f} {t['reason']:>10s} {t['bars_held']:>4d}")

#--- V=N/D 統計 ---
print(f"\n{'='*60}")
print(f"V=N/D 統計サマリー")
print(f"{'='*60}")
if equity_curve:
    v_scores = [e['v_score'] for e in equity_curve]
    d_vals = [e['d_value'] for e in equity_curve]
    n_vals = [e['n_value'] for e in equity_curve]
    
    print(f"  V (N/D)  — 平均: {np.mean(v_scores):.2f}, 最大: {np.max(v_scores):.2f}, 最小: {np.min(v_scores):.2f}")
    print(f"  N        — 平均: {np.mean(n_vals):.2f}, 最大: {np.max(n_vals):.2f}")
    print(f"  D        — 平均: {np.mean(d_vals):.4f}, 最大: {np.max(d_vals):.4f}")
    
    strongest_count = {}
    weakest_count = {}
    for e in equity_curve:
        strongest_count[e['strongest']] = strongest_count.get(e['strongest'], 0) + 1
        weakest_count[e['weakest']] = weakest_count.get(e['weakest'], 0) + 1
    
    print(f"\n  最強通貨ランキング（3ヶ月）:")
    for c, cnt in sorted(strongest_count.items(), key=lambda x: -x[1]):
        bar = "█" * (cnt // 10)
        print(f"    {c}: {cnt:>4d} {bar}")
    
    print(f"\n  最弱通貨ランキング（3ヶ月）:")
    for c, cnt in sorted(weakest_count.items(), key=lambda x: -x[1]):
        bar = "█" * (cnt // 10)
        print(f"    {c}: {cnt:>4d} {bar}")

print(f"\n{'='*60}")
print(f"TheYKHC EA Backtest Complete — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
print(f"{'='*60}")
