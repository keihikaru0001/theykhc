//===================================
// TheYKHC EA — Currency Strength Matrix × V=N/D Observer Effect
// Version: 1.0
// Author: Yoshimitsu Katayama (會長)
// Theory: V=N/D Katayama Formula (Zenodo DOI registered)
// Date: 2026-07-22
//===================================

#property strict
#property version   "1.00"
#property copyright "TheYKHC Tower"
#property link      "https://theykhc.com"
#property description "通貨強弱マトリックス×V=N/D観測者効果によるFX自動売買EA"

//--- 外部パラメータ ---
input string  Prefix       = "TheYKHC";        // マジックナンバー用プレフィックス
input double  LotSize      = 0.01;             // 基本ロット
input int     LookbackBars = 20;               // 強弱計算のバー数
input double  StrengthThreshold = 0.3;        // エントリー閾値（%）
input double  CloseThreshold = 0.1;            // 決済閾値（%）
input int     TickWindow   = 60;              // N計算のウィンドウ（秒）
input int     TickThreshold = 50;             // Nの閾値（ティック数）
input int     SpreadPeriod  = 100;            // D計算用スプレッド平均期間
input double  D_MaxMultiplier = 1.5;          // D最大許容倍率
input double  V_LotMultiplier = 0.5;           // V=N/Dによるロット調整係数
input bool    UseNeutrinoTrigger = true;      // ニュートリノGOLDイベントトリガー使用
input string  NeutrinoMode  = "file";         // "file" or "api" — ニュートリノデータ取得方法
input string  NeutrinoFilePath = "neutrino_events.json"; // ニュートリノイベントファイル
input int     NeutrinoWindowSec = 3600;        // ニュートリノイベント後の有効窓（秒）
input bool    EnableLogging = true;           // ログ出力
input int     MaxPositions  = 3;              // 最大同時ポジション数

//--- 通貨リスト ---
string Currencies[] = {"USD", "EUR", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"};
string Pairs[] = {
    "USD EUR", "USD JPY", "USD GBP", "USD CHF", "USD AUD", "USD CAD", "USD NZD",
    "EUR JPY", "EUR GBP", "EUR CHF", "EUR AUD", "EUR CAD", "EUR NZD",
    "JPY GBP", "JPY CHF", "JPY AUD", "JPY CAD", "JPY NZD",
    "GBP CHF", "GBP AUD", "GBP CAD", "GBP NZD",
    "CHF AUD", "CHF CAD", "CHF NZD",
    "AUD CAD", "AUD NZD",
    "CAD NZD"
};
// 全28ペア

//--- グローバル変数 ---
double StrengthScores[8];      // 8通貨の強弱スコア
double PrevStrength[8];        // 前回のスコア（変化率計算用）
double AvgSpread;              // 平均スプレッド（D計算用）
double CurrentD;               // 現在のD値
double CurrentN;               // 現在のN値
double CurrentV;               // V=N/D スコア
int    TickCount;              // ティックカウント
datetime WindowStart;          // N計算ウィンドウ開始時刻
datetime LastNeutrinoTime;    // 最後のニュートリノイベント時刻
bool   NeutrinoActive;        // ニュートリノトリガー有効フラグ

//===================================
// 初期化
//===================================
int OnInit()
{
    TickCount = 0;
    WindowStart = TimeCurrent();
    NeutrinoActive = false;
    LastNeutrinoTime = 0;
    
    for(int i = 0; i < 8; i++)
    {
        StrengthScores[i] = 0.0;
        PrevStrength[i] = 0.0;
    }
    
    if(EnableLogging)
        Print("TheYKHC EA 初期化完了 — Currency Strength Matrix × V=N/D");
    
    return(INIT_SUCCEEDED);
}

//===================================
// 終了処理
//===================================
void OnDeinit(const int reason)
{
    if(EnableLogging)
        Print("TheYKHC EA 終了 — Reason: ", reason);
}

//===================================
// ティックイベント
//===================================
void OnTick()
{
    //--- N値更新（ティック密度）---
    datetime now = TimeCurrent();
    if(now - WindowStart >= TickWindow)
    {
        // ウィンドウリセット
        WindowStart = now;
        TickCount = 1;
    }
    else
    {
        TickCount++;
    }
    CurrentN = (double)TickCount;
    
    //--- D値計算（スプレッド × ボラティリティ）---
    CalculateD();
    
    //--- V=N/D スコア計算 ---
    if(CurrentD > 0)
        CurrentV = CurrentN / CurrentD;
    else
        CurrentV = 0.0;
    
    //--- 通貨強弱スコア計算 ---
    CalculateStrength();
    
    //--- ニュートリノトリガー確認 ---
    if(UseNeutrinoTrigger)
        CheckNeutrino();
    
    //--- エントリー判定 ---
    if(CountOpenPositions() < MaxPositions)
        CheckEntry();
    
    //--- 決済判定 ---
    CheckExit();
    
    //--- ログ出力 ---
    if(EnableLogging && CurrentN > TickThreshold)
    {
        PrintStrength();
        Print("V=N/D: N=", CurrentN, " D=", DoubleToStr(CurrentD, 4), " V=", DoubleToStr(CurrentV, 2));
    }
}

//===================================
// 通貨強弱スコア計算
// 全28ペアの変動率を各通貨に集計
//===================================
void CalculateStrength()
{
    // 初期化
    for(int i = 0; i < 8; i++)
        StrengthScores[i] = 0.0;
    
    // 各ペアの変動率を計算し、通貨別に集計
    for(int p = 0; p < 28; p++)
    {
        string base = StringSubstr(Pairs[p], 0, 3);
        string quote = StringSubstr(Pairs[p], 4, 3);
        string symbol = base + quote;
        
        // 利用可能シンボルか確認
        if(!SymbolExists(symbol))
            continue;
        
        double changeRate = GetChangeRate(symbol, LookbackBars);
        if(changeRate == 0) continue;
        
        // base通貨のスコアに加算
        int baseIdx = GetCurrencyIndex(base);
        int quoteIdx = GetCurrencyIndex(quote);
        
        if(baseIdx >= 0) StrengthScores[baseIdx] += changeRate;
        if(quoteIdx >= 0) StrengthScores[quoteIdx] -= changeRate;
    }
    
    // 正規化（28ペアの平均的影响を補正）
    for(int i = 0; i < 8; i++)
        StrengthScores[i] = StrengthScores[i] / 3.5; // 7ペア分の平均
}

//===================================
// 変動率計算（%）
//===================================
double GetChangeRate(string symbol, int bars)
{
    double currentPrice = SymbolInfoDouble(symbol, SYMBOL_BID);
    double pastPrice = iClose(symbol, PERIOD_CURRENT, bars);
    
    if(currentPrice == 0 || pastPrice == 0) return 0.0;
    
    return ((currentPrice - pastPrice) / pastPrice) * 100.0;
}

//===================================
// D値計算 — スプレッド × ボラティリティ
// D = (現在スプレッド / 平均スプレッド) × (ATR / 価格)
//===================================
void CalculateD()
{
    double spread = (double)SymbolInfoInteger(Symbol(), SYMBOL_SPREAD);
    
    // 平均スプレッド計算
    double spreadSum = 0;
    int count = 0;
    for(int i = 0; i < SpreadPeriod; i++)
    {
        // ヒストリカルスプレッドの代替としてHigh-Lowを使用
        double h = iHigh(Symbol(), PERIOD_CURRENT, i);
        double l = iLow(Symbol(), PERIOD_CURRENT, i);
        if(h > 0 && l > 0)
        {
            spreadSum += (h - l);
            count++;
        }
    }
    
    if(count > 0)
        AvgSpread = spreadSum / count;
    else
        AvgSpread = 1.0;
    
    // ATR計算
    double atr = iATR(Symbol(), PERIOD_CURRENT, 14, 0);
    double price = SymbolInfoDouble(Symbol(), SYMBOL_BID);
    
    if(atr > 0 && price > 0)
        CurrentD = (spread / AvgSpread) * (atr / price) * 100.0;
    else
        CurrentD = 1.0;
}

//===================================
// ニュートリノイベント確認
// IceCube GOLDイベントを外部トリガーとして使用
//===================================
void CheckNeutrino()
{
    // ニュートリノイベントファイルから最新イベント時刻を取得
    // 実運用時はAPI or fileから読み込み
    
    // ファイルベースの場合
    if(NeutrinoMode == "file")
    {
        int handle = FileOpen(NeutrinoFilePath, FILE_READ | FILE_TXT);
        if(handle != INVALID_HANDLE)
        {
            string line;
            while(!FileIsEnding(handle))
            {
                line = FileReadString(handle);
                // JSONパース簡易版: "gcn_time" を抽出
                int pos = StringFind(line, "gcn_publish_time");
                if(pos >= 0)
                {
                    // 簡易タイムスタンプ抽出
                    string timeStr = StringSubstr(line, pos + 18, 19);
                    // ここでタイムスタンプをパース
                    // 実装例: 2026-05-05T14:18:00Z → datetime変換
                    datetime eventTime = ParseISOTime(timeStr);
                    if(eventTime > LastNeutrinoTime)
                    {
                        LastNeutrinoTime = eventTime;
                        NeutrinoActive = true;
                        if(EnableLogging)
                            Print("ニュートリノGOLDイベント検知: ", TimeToString(eventTime));
                    }
                }
            }
            FileClose(handle);
        }
    }
    
    // 有効窓チェック
    if(NeutrinoActive)
    {
        datetime now = TimeCurrent();
        if(now - LastNeutrinoTime > NeutrinoWindowSec)
        {
            NeutrinoActive = false;
            if(EnableLogging)
                Print("ニュートリノトリガー有効窓終了");
        }
    }
}

//===================================
// ISO8601タイムスタンプ → datetime変換
//===================================
datetime ParseISOTime(string isoStr)
{
    // 簡易パーサー: "2026-05-05T14:18:00Z" → datetime
    // MQL4のStringToTimeは形式が限定的なため手動変換
    string clean = StringReplace(isoStr, "T", " ");
    clean = StringReplace(clean, "Z", "");
    return(StringToTime(clean));
}

//===================================
// エントリー判定
//===================================
void CheckEntry()
{
    // 最強・最弱通貨を特定
    int strongestIdx = 0;
    int weakestIdx = 0;
    
    for(int i = 1; i < 8; i++)
    {
        if(StrengthScores[i] > StrengthScores[strongestIdx])
            strongestIdx = i;
        if(StrengthScores[i] < StrengthScores[weakestIdx])
            weakestIdx = i;
    }
    
    double scoreDiff = StrengthScores[strongestIdx] - StrengthScores[weakestIdx];
    
    //--- エントリー条件 ---
    // 1. スコア差が閾値以上
    bool cond1 = (scoreDiff >= StrengthThreshold);
    
    // 2. N > 閾値（観測者注目度高）
    bool cond2 = (CurrentN >= TickThreshold);
    
    // 3. D < 最大許容値（不確定性低）
    double dThreshold = AvgSpread * D_MaxMultiplier;
    bool cond3 = (CurrentD < dThreshold);
    
    // 4. 同じ方向のポジションがまだない
    string tradePair = Currencies[strongestIdx] + Currencies[weakestIdx];
    bool cond4 = !HasPosition(tradePair);
    
    if(cond1 && cond2 && cond3 && cond4)
    {
        //--- ロット計算（V=N/Dで調整）---
        double adjustedLot = LotSize;
        if(CurrentV > 0)
        {
            // Vが高いほどロット大、低いほどロット小
            adjustedLot = LotSize * (1.0 + V_LotMultiplier * MathMin(CurrentV, 10.0) / 10.0);
        }
        
        // ニュートリノトリガーが有効な場合はロット増加
        if(NeutrinoActive)
        {
            adjustedLot *= 1.5;
            if(EnableLogging)
                Print("ニュートリノGOLDトリガー有効 — ロット1.5倍");
        }
        
        //--- ペア順序判定 ---
        // 最強通貨がbaseの場合はロング、そうでなければショート
        string symbol = "";
        int direction = 0; // 1=Long, -1=Short
        
        // 利用可能なペアシンボルを構築
        string sym1 = Currencies[strongestIdx] + Currencies[weakestIdx];
        string sym2 = Currencies[weakestIdx] + Currencies[strongestIdx];
        
        if(SymbolExists(sym1))
        {
            symbol = sym1;
            direction = 1; // Long: 強い通貨を買う
        }
        else if(SymbolExists(sym2))
        {
            symbol = sym2;
            direction = -1; // Short: 弱い通貨を売る
        }
        else
            return; // どちらのペアも利用不可
        
        //--- 注文送信 ---
        int magic = GenerateMagicNumber(symbol);
        string comment = Prefix + "_V" + DoubleToStr(CurrentV, 1);
        
        if(direction == 1)
        {
            int ticket = OrderSend(symbol, OP_BUY, adjustedLot,
                SymbolInfoDouble(symbol, SYMBOL_ASK), 3,
                0, 0, comment, magic, 0, clrGold);
            
            if(ticket > 0 && EnableLogging)
                Print("LONG ", symbol, " Lot=", DoubleToStr(adjustedLot, 2),
                      " Strength Diff=", DoubleToStr(scoreDiff, 2),
                      " V=N/D=", DoubleToStr(CurrentV, 2));
        }
        else if(direction == -1)
        {
            int ticket = OrderSend(symbol, OP_SELL, adjustedLot,
                SymbolInfoDouble(symbol, SYMBOL_BID), 3,
                0, 0, comment, magic, 0, clrGold);
            
            if(ticket > 0 && EnableLogging)
                Print("SHORT ", symbol, " Lot=", DoubleToStr(adjustedLot, 2),
                      " Strength Diff=", DoubleToStr(scoreDiff, 2),
                      " V=N/D=", DoubleToStr(CurrentV, 2));
        }
    }
}

//===================================
// 決済判定
//===================================
void CheckExit()
{
    // 全ポジションをチェック
    for(int i = OrdersTotal() - 1; i >= 0; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
        if(OrderMagicNumber() == 0) continue;
        if(StringFind(OrderComment(), Prefix) < 0) continue;
        
        string symbol = OrderSymbol();
        string base = StringSubstr(symbol, 0, 3);
        string quote = StringSubstr(symbol, 3, 3);
        
        int baseIdx = GetCurrencyIndex(base);
        int quoteIdx = GetCurrencyIndex(quote);
        
        if(baseIdx < 0 || quoteIdx < 0) continue;
        
        double scoreDiff = MathAbs(StrengthScores[baseIdx] - StrengthScores[quoteIdx]);
        
        //--- 決済条件 ---
        
        // 1. スコア差が縮小
        bool closeCond1 = (scoreDiff < CloseThreshold);
        
        // 2. D急増（不確定性急上昇）
        bool closeCond2 = (CurrentD > AvgSpread * D_MaxMultiplier * 1.5);
        
        // 3. 強弱逆転
        bool closeCond3 = false;
        if(OrderType() == OP_BUY)
        {
            // Longポジション: baseが弱くなったらクローズ
            closeCond3 = (StrengthScores[baseIdx] < StrengthScores[quoteIdx]);
        }
        else
        {
            // Shortポジション: baseが強くなったらクローズ
            closeCond3 = (StrengthScores[baseIdx] > StrengthScores[quoteIdx]);
        }
        
        // 4. ニュートリノリスクオフ
        bool closeCond4 = (UseNeutrinoTrigger && NeutrinoActive && IsNeutrinoRiskOff());
        
        if(closeCond1 || closeCond2 || closeCond3 || closeCond4)
        {
            double closePrice;
            if(OrderType() == OP_BUY)
                closePrice = SymbolInfoDouble(symbol, SYMBOL_BID);
            else
                closePrice = SymbolInfoDouble(symbol, SYMBOL_ASK);
            
            bool closed = OrderClose(OrderTicket(), OrderLots(), closePrice, 3, clrRed);
            
            if(closed && EnableLogging)
            {
                string reason = "";
                if(closeCond1) reason = "スコア差縮小";
                else if(closeCond2) reason = "D急増";
                else if(closeCond3) reason = "強弱逆転";
                else if(closeCond4) reason = "ニュートリノリスクオフ";
                
                Print("CLOSE ", symbol, " Reason: ", reason,
                      " Pips: ", DoubleToStr((OrderClosePrice() - OrderOpenPrice()) / Point, 1));
            }
        }
    }
}

//===================================
// ニュートリノイベント後のリスク判定
// GOLD級: リスクオン（トレンド継続の可能性）
// それ以外: リスクオフ
//===================================
bool IsNeutrinoRiskOff()
{
    // 実装: ニュートリノイベントのエネルギーとタイプを確認
    // GOLD級 (energy_tev > 100) → リスクオン
    // それ以外 → リスクオフ
    
    // ファイルベースの簡易判定
    // 実運用時はAPIから詳細データを取得
    return false; // デフォルト: リスクオフしない
}

//===================================
// ユーティリティ関数
//===================================

// 通貨インデックス取得
int GetCurrencyIndex(string cur)
{
    for(int i = 0; i < 8; i++)
    {
        if(Currencies[i] == cur) return i;
    }
    return -1;
}

// シンボル存在確認
bool SymbolExists(string symbol)
{
    return(MarketInfo(symbol, MODE_BID) > 0);
}

// ポジション保有確認
bool HasPosition(string pair)
{
    for(int i = OrdersTotal() - 1; i >= 0; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
        if(StringFind(OrderComment(), Prefix) < 0) continue;
        
        string posSymbol = OrderSymbol();
        // ペアが含まれる通貨を確認
        string b = StringSubstr(posSymbol, 0, 3);
        string q = StringSubstr(posSymbol, 3, 3);
        
        if(StringFind(pair, b) >= 0 && StringFind(pair, q) >= 0)
            return true;
    }
    return false;
}

// オープンポジション数カウント
int CountOpenPositions()
{
    int count = 0;
    for(int i = OrdersTotal() - 1; i >= 0; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
        if(StringFind(OrderComment(), Prefix) < 0) continue;
        count++;
    }
    return count;
}

// マジックナンバー生成
int GenerateMagicNumber(string symbol)
{
    int hash = 0;
    for(int i = 0; i < StringLen(symbol); i++)
    {
        hash = (hash * 31 + StringGetChar(symbol, i)) % 2147483647;
    }
    return MathAbs(hash);
}

// 強弱スコア表示
void PrintStrength()
{
    Print("=== Currency Strength Matrix ===");
    for(int i = 0; i < 8; i++)
    {
        string bar = "";
        int bars = (int)(StrengthScores[i] * 20);
        if(bars > 0)
            for(int j = 0; j < bars && j < 30; j++) bar += "+";
        else if(bars < 0)
            for(int j = 0; j > bars && j > -30; j--) bar += "-";
        
        Print(Currencies[i], ": ", DoubleToStr(StrengthScores[i], 3), " |", bar);
    }
    
    // 最強・最弱
    int maxIdx = 0, minIdx = 0;
    for(int i = 1; i < 8; i++)
    {
        if(StrengthScores[i] > StrengthScores[maxIdx]) maxIdx = i;
        if(StrengthScores[i] < StrengthScores[minIdx]) minIdx = i;
    }
    Print(">>> STRONGEST: ", Currencies[maxIdx], " (", DoubleToStr(StrengthScores[maxIdx], 3), ")");
    Print(">>> WEAKEST:   ", Currencies[minIdx], " (", DoubleToStr(StrengthScores[minIdx], 3), ")");
    Print(">>> TRADE:     ", Currencies[maxIdx], "/", Currencies[minIdx],
          " Diff=", DoubleToStr(StrengthScores[maxIdx] - StrengthScores[minIdx], 3));
}

//===================================
// EOF — TheYKHC EA v1.0
//===================================
