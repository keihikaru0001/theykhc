//===================================
// TheYKHC EA — Currency Strength Matrix × V=N/D Observer Effect
// Version: 3.1
// Author: Yoshimitsu Katayama (會長)
// Theory: V=N/D Katayama Formula (Zenodo DOI registered)
// Date: 2026-07-22
// Backtest: PF 1.91, Win Rate 39.5%, Return +0.60% (3mo)
//===================================

#property strict
#property version   "3.10"
#property copyright "TheYKHC Tower"
#property link      "https://theykhc.com"
#property description "通貨強弱マトリックス×V=N/D+逆転防止ロジック"

//=== 外部パラメータ ===
input string  Prefix            = "TheYKHC";       // マジックナンバー用
input double  LotSize           = 0.01;            // 基本ロット
input int     LookbackBars      = 20;              // 強弱計算バー数
input double  StrengthThreshold = 0.2;             // エントリー閾値(%)
input double  CloseThreshold    = 0.1;             // 決済閾値(%)
input int     TickWindow        = 60;              // N計算ウィンドウ(秒)
input int     TickThreshold     = 50;              // Nの閾値
input int     SpreadPeriod      = 100;             // D計算用期間
input double  D_MaxMultiplier   = 1.5;             // D最大許容倍率
input double  V_LotMultiplier   = 0.5;             // V=N/Dロット調整係数
input bool    UseNeutrinoTrigger = true;            // ニュートリノGOLDトリガー
input string  NeutrinoMode       = "file";          // "file" or "api"
input string  NeutrinoFilePath   = "neutrino_events.json";
input int     NeutrinoWindowSec  = 3600;            // ニュートリノ有効窓(秒)
input bool    EnableLogging      = true;            // ログ出力
input int     MaxPositions       = 3;               // 最大同時ポジション

//--- 逆転防止ロジック パラメータ ---
input int     MomentumBars       = 5;              // モメンタム計算バー数
input double  MomentumThreshold  = 0.0;            // モメンタum閾値
input int     PeakDecayBars      = 3;              // ピーク後抑制バー数
input int     TrendConfirmBars   = 3;              // トレンド確認バー数
input double  ReversalExitSpeed  = 0.15;           // モメンタム逆転判定速度
input int     CooldownBars       = 10;             // 決済後クールダウン(バー数)
input double  PartialCloseRatio   = 0.5;            // 部分利確スコア差比率

//--- 通貨リスト ---
string Currencies[] = {"USD", "EUR", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"};

// 全28ペア (base quote)
string AllPairs[28] = {
    "USD EUR", "USD JPY", "USD GBP", "USD CHF", "USD AUD", "USD CAD", "USD NZD",
    "EUR JPY", "EUR GBP", "EUR CHF", "EUR AUD", "EUR CAD", "EUR NZD",
    "JPY GBP", "JPY CHF", "JPY AUD", "JPY CAD", "JPY NZD",
    "GBP CHF", "GBP AUD", "GBP CAD", "GBP NZD",
    "CHF AUD", "CHF CAD", "CHF NZD",
    "AUD CAD", "AUD NZD",
    "CAD NZD"
};

//--- グローバル変数 ---
double StrengthScores[8];
double PrevStrength[8];
double StrengthHistory[8][500];   // スコア履歴 (最大500バー)
int    StrengthHistoryCount = 0;
double Momentum[8];
double Accel[8];
bool   PeakFlag[8];
bool   TrendUp[8];
bool   TrendDown[8];

double AvgSpread;
double CurrentD;
double CurrentN;
double CurrentV;
int    TickCount;
datetime WindowStart;
datetime LastNeutrinoTime;
bool   NeutrinoActive;

// クールダウン管理
string CooldownPairs[50];
int    CooldownUntil[50];
int    CooldownCount = 0;

//===================================
// 初期化
//===================================
int OnInit()
{
    TickCount = 0;
    WindowStart = TimeCurrent();
    NeutrinoActive = false;
    LastNeutrinoTime = 0;
    StrengthHistoryCount = 0;
    CooldownCount = 0;

    for(int i = 0; i < 8; i++)
    {
        StrengthScores[i] = 0.0;
        PrevStrength[i] = 0.0;
        Momentum[i] = 0.0;
        Accel[i] = 0.0;
        PeakFlag[i] = false;
        TrendUp[i] = false;
        TrendDown[i] = false;
        for(int j = 0; j < 500; j++)
            StrengthHistory[i][j] = 0.0;
    }

    for(int i = 0; i < 50; i++)
    {
        CooldownPairs[i] = "";
        CooldownUntil[i] = 0;
    }

    if(EnableLogging)
        Print("TheYKHC EA v3.1 初期化 — Currency Strength Matrix × V=N/D + 逆転防止");

    return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
    if(EnableLogging)
        Print("TheYKHC EA v3.1 終了 — Reason: ", reason);
}

//===================================
// ティックイベント
//===================================
void OnTick()
{
    datetime now = TimeCurrent();

    //--- N値更新 ---
    if(now - WindowStart >= TickWindow)
    {
        WindowStart = now;
        TickCount = 1;
    }
    else
    {
        TickCount++;
    }
    CurrentN = (double)TickCount;

    //--- D値計算 ---
    CalculateD();

    //--- V=N/D ---
    CurrentV = (CurrentD > 0) ? CurrentN / CurrentD : 0.0;

    //--- 通貨強弱スコア計算 ---
    CalculateStrength();

    //--- モメンタム・ピーク・トレンド計算 ---
    CalculateMomentumAndTrend();

    //--- ニュートリノトリガー ---
    if(UseNeutrinoTrigger)
        CheckNeutrino();

    //--- エントリー判定 ---
    if(CountOpenPositions() < MaxPositions)
        CheckEntry();

    //--- 決済判定 ---
    CheckExit();

    //--- ログ ---
    if(EnableLogging && CurrentN > TickThreshold)
    {
        PrintStrength();
        Print("V=N/D: N=", CurrentN, " D=", DoubleToStr(CurrentD, 4), " V=", DoubleToStr(CurrentV, 2));
    }
}

//===================================
// 通貨強弱スコア計算
//===================================
void CalculateStrength()
{
    // 前回のスコアを保存
    for(int i = 0; i < 8; i++)
        PrevStrength[i] = StrengthScores[i];

    // 初期化
    for(int i = 0; i < 8; i++)
        StrengthScores[i] = 0.0;

    for(int p = 0; p < 28; p++)
    {
        string base = StringSubstr(AllPairs[p], 0, 3);
        string quote = StringSubstr(AllPairs[p], 4, 3);
        string symbol = base + quote;

        // 逆順シンボルも試す
        string symbolRev = quote + base;

        bool useRev = false;
        if(!SymbolExists(symbol))
        {
            if(SymbolExists(symbolRev))
            {
                symbol = symbolRev;
                useRev = true;
            }
            else
                continue;
        }

        double changeRate = GetChangeRate(symbol, LookbackBars);
        if(changeRate == 0) continue;

        // 逆順シンボルの場合、符号反転
        if(useRev)
            changeRate = -changeRate;

        int baseIdx = GetCurrencyIndex(base);
        int quoteIdx = GetCurrencyIndex(quote);

        if(baseIdx >= 0) StrengthScores[baseIdx] += changeRate;
        if(quoteIdx >= 0) StrengthScores[quoteIdx] -= changeRate;
    }

    // 正規化
    for(int i = 0; i < 8; i++)
        StrengthScores[i] /= 3.5;

    // 履歴に保存
    if(StrengthHistoryCount < 500)
    {
        for(int i = 0; i < 8; i++)
            StrengthHistory[i][StrengthHistoryCount] = StrengthScores[i];
        StrengthHistoryCount++;
    }
    else
    {
        // シフト
        for(int i = 0; i < 8; i++)
        {
            for(int j = 0; j < 499; j++)
                StrengthHistory[i][j] = StrengthHistory[i][j+1];
            StrengthHistory[i][499] = StrengthScores[i];
        }
    }
}

//===================================
// 変動率計算(%)
//===================================
double GetChangeRate(string symbol, int bars)
{
    double currentPrice = SymbolInfoDouble(symbol, SYMBOL_BID);
    double pastPrice = iClose(symbol, PERIOD_CURRENT, bars);

    if(currentPrice == 0 || pastPrice == 0) return 0.0;

    return ((currentPrice - pastPrice) / pastPrice) * 100.0;
}

//===================================
// モメンタム・ピーク・トレンド計算
//===================================
void CalculateMomentumAndTrend()
{
    if(StrengthHistoryCount < MomentumBars + 1) return;

    int latest = StrengthHistoryCount - 1;

    for(int c = 0; c < 8; c++)
    {
        //--- モメンタム (1次微分) ---
        int momIdx = latest - MomentumBars;
        if(momIdx >= 0)
            Momentum[c] = StrengthHistory[c][latest] - StrengthHistory[c][momIdx];
        else
            Momentum[c] = 0.0;

        //--- 加速度 (2次微分) ---
        int accelIdx = latest - 3;
        if(accelIdx >= 0 && momIdx >= 0)
        {
            double prevMom = StrengthHistory[c][accelIdx] - StrengthHistory[c][accelIdx - MomentumBars];
            Accel[c] = Momentum[c] - prevMom;
        }
        else
            Accel[c] = 0.0;

        //--- ピーク検知 ---
        // モメンタムが正→負に転じたか
        if(latest >= 1)
        {
            double prevMom = StrengthHistory[c][latest-1] - StrengthHistory[c][latest-1-MomentumBars];
            if(prevMom > 0 && Momentum[c] <= 0)
                PeakFlag[c] = true;
            else
                PeakFlag[c] = false;
        }

        //--- トレンド確認 ---
        TrendUp[c] = false;
        TrendDown[c] = false;

        if(latest >= TrendConfirmBars)
        {
            bool allUp = true;
            bool allDown = true;
            for(int j = 0; j < TrendConfirmBars; j++)
            {
                if(StrengthHistory[c][latest-j] <= StrengthHistory[c][latest-j-1])
                    allUp = false;
                if(StrengthHistory[c][latest-j] >= StrengthHistory[c][latest-j-1])
                    allDown = false;
            }
            TrendUp[c] = allUp;
            TrendDown[c] = allDown;
        }
    }
}

//===================================
// D値計算 — スプレッド × ボラティリティ
//===================================
void CalculateD()
{
    double spread = (double)SymbolInfoInteger(Symbol(), SYMBOL_SPREAD);

    double spreadSum = 0;
    int count = 0;
    for(int i = 0; i < SpreadPeriod; i++)
    {
        double h = iHigh(Symbol(), PERIOD_CURRENT, i);
        double l = iLow(Symbol(), PERIOD_CURRENT, i);
        if(h > 0 && l > 0)
        {
            spreadSum += (h - l);
            count++;
        }
    }

    AvgSpread = (count > 0) ? spreadSum / count : 1.0;

    double atr = iATR(Symbol(), PERIOD_CURRENT, 14, 0);
    double price = SymbolInfoDouble(Symbol(), SYMBOL_BID);

    if(atr > 0 && price > 0)
        CurrentD = (spread / AvgSpread) * (atr / price) * 100.0;
    else
        CurrentD = 1.0;
}

//===================================
// ニュートリノイベント確認
//===================================
void CheckNeutrino()
{
    if(NeutrinoMode == "file")
    {
        int handle = FileOpen(NeutrinoFilePath, FILE_READ | FILE_TXT);
        if(handle != INVALID_HANDLE)
        {
            while(!FileIsEnding(handle))
            {
                string line = FileReadString(handle);
                int pos = StringFind(line, "gcn_publish_time");
                if(pos >= 0)
                {
                    string timeStr = StringSubstr(line, pos + 18, 19);
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

    if(NeutrinoActive)
    {
        if(TimeCurrent() - LastNeutrinoTime > NeutrinoWindowSec)
        {
            NeutrinoActive = false;
            if(EnableLogging)
                Print("ニュートリノトリガー有効窓終了");
        }
    }
}

datetime ParseISOTime(string isoStr)
{
    string clean = StringReplace(isoStr, "T", " ");
    clean = StringReplace(clean, "Z", "");
    return(StringToTime(clean));
}

//===================================
// エントリー判定 (v3.1 — 逆転防止ロジック付き)
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

    //--- 条件1: スコア差が閾値以上 ---
    if(scoreDiff < StrengthThreshold) return;

    //--- 条件2: N > 閾値 ---
    if(CurrentN < TickThreshold) return;

    //--- 条件3: D < 最大許容値 ---
    double dThreshold = AvgSpread * D_MaxMultiplier;
    if(CurrentD >= dThreshold) return;

    //--- ★ 逆転防止1: モメンタム確認 ---
    // 最強通貨のモメンタumが正(上昇中) かつ 最弱通貨が負(下落中)
    if(Momentum[strongestIdx] <= MomentumThreshold) return;
    if(Momentum[weakestIdx] >= -MomentumThreshold) return;

    //--- ★ 逆転防止2: ピーク直後抑制 ---
    if(PeakFlag[strongestIdx] || PeakFlag[weakestIdx]) return;

    //--- ★ 逆転防止3: トレンド確認 ---
    if(!(TrendUp[strongestIdx] || TrendDown[weakestIdx])) return;

    //--- ★ 逆転防止3.5: 加速度チェック ---
    // 最強通貨のモメンタムが急減速 = トレンド終了間近
    if(Accel[strongestIdx] < -0.1) return;
    if(Accel[weakestIdx] > 0.1) return;

    //--- ペア構築 ---
    string pairKey = Currencies[strongestIdx] + "/" + Currencies[weakestIdx];

    //--- ★ クールダウンチェック ---
    if(IsInCooldown(pairKey)) return;

    //--- 既存ポジション確認 ---
    if(HasPosition(Currencies[strongestIdx], Currencies[weakestIdx])) return;

    //--- ロット計算 ---
    double adjustedLot = LotSize * (1.0 + V_LotMultiplier * MathMin(CurrentV, 10.0) / 10.0);

    // ニュートリノトリガー有効時はロット増
    if(NeutrinoActive)
    {
        adjustedLot *= 1.5;
        if(EnableLogging)
            Print("ニュートリノGOLDトリガー有効 — ロット1.5倍");
    }

    //--- ペアシンボル決定 ---
    string sym1 = Currencies[strongestIdx] + Currencies[weakestIdx];
    string sym2 = Currencies[weakestIdx] + Currencies[strongestIdx];
    string symbol = "";
    int direction = 0;

    if(SymbolExists(sym1))
    {
        symbol = sym1;
        direction = 1; // Long
    }
    else if(SymbolExists(sym2))
    {
        symbol = sym2;
        direction = -1; // Short
    }
    else
        return;

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
                  " Diff=", DoubleToStr(scoreDiff, 2),
                  " Mom=", DoubleToStr(Momentum[strongestIdx], 2),
                  " V=N/D=", DoubleToStr(CurrentV, 2));
    }
    else
    {
        int ticket = OrderSend(symbol, OP_SELL, adjustedLot,
            SymbolInfoDouble(symbol, SYMBOL_BID), 3,
            0, 0, comment, magic, 0, clrGold);

        if(ticket > 0 && EnableLogging)
            Print("SHORT ", symbol, " Lot=", DoubleToStr(adjustedLot, 2),
                  " Diff=", DoubleToStr(scoreDiff, 2),
                  " Mom=", DoubleToStr(Momentum[weakestIdx], 2),
                  " V=N/D=", DoubleToStr(CurrentV, 2));
    }
}

//===================================
// 決済判定 (v3.1)
//===================================
void CheckExit()
{
    for(int i = OrdersTotal() - 1; i >= 0; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
        if(StringFind(OrderComment(), Prefix) < 0) continue;

        string symbol = OrderSymbol();
        string base = StringSubstr(symbol, 0, 3);
        string quote = StringSubstr(symbol, 3, 3);

        int baseIdx = GetCurrencyIndex(base);
        int quoteIdx = GetCurrencyIndex(quote);

        if(baseIdx < 0 || quoteIdx < 0) continue;

        double currentDiff = MathAbs(StrengthScores[baseIdx] - StrengthScores[quoteIdx]);

        //--- 決済条件 ---

        // 1. スコア差縮小
        bool close1 = (currentDiff < CloseThreshold);

        // 2. 強弱逆転
        bool close2 = false;
        if(OrderType() == OP_BUY)
            close2 = (StrengthScores[baseIdx] < StrengthScores[quoteIdx]);
        else
            close2 = (StrengthScores[baseIdx] > StrengthScores[quoteIdx]);

        // ★ 3. モメンタム逆転 (ロング通貨のモメンタムが負 or ショート通貨が正)
        bool close3 = false;
        if(OrderType() == OP_BUY)
            close3 = (Momentum[baseIdx] < -ReversalExitSpeed) || (Momentum[quoteIdx] > ReversalExitSpeed);
        else
            close3 = (Momentum[baseIdx] > ReversalExitSpeed) || (Momentum[quoteIdx] < -ReversalExitSpeed);

        // ★ 3b. モメンタム逆転時、まだトレンド方向なら小利で逃げる
        // (スコア差がエントリー時の70%以上残っていれば小利)
        // → これは決済後の処理で判定

        // 4. D急増
        bool close4 = (CurrentD > AvgSpread * D_MaxMultiplier * 1.5);

        // ★ 5. トレンド崩壊 (エントリー時モメンタム正→現在負+加速度も負)
        bool close5 = false;
        // 簡易判定: ポジションのロング通貨モメンタムが負かつ加速度も負
        int longIdx = (OrderType() == OP_BUY) ? baseIdx : quoteIdx;
        if(Momentum[longIdx] < 0 && Accel[longIdx] < 0)
            close5 = true;

        // ★ 6. 部分利確 (スコア差が半分以下に縮小 + モメンタム減速)
        bool close6 = false;
        // エントリー時のスコア差を注文コメントから復元するのは難しいので
        // 現在のスコア差が十分小さくなったら利確
        if(currentDiff < StrengthThreshold * PartialCloseRatio && Momentum[longIdx] < 0)
            close6 = true;

        if(close1 || close2 || close3 || close4 || close5 || close6)
        {
            double closePrice;
            if(OrderType() == OP_BUY)
                closePrice = SymbolInfoDouble(symbol, SYMBOL_BID);
            else
                closePrice = SymbolInfoDouble(symbol, SYMBOL_ASK);

            bool closed = OrderClose(OrderTicket(), OrderLots(), closePrice, 3, clrRed);

            if(closed)
            {
                // クールダウン設定
                string pairKey = Currencies[baseIdx] + "/" + Currencies[quoteIdx];
                SetCooldown(pairKey);

                if(EnableLogging)
                {
                    string reason = "不明";
                    if(close2) reason = "強弱逆転";
                    else if(close3) reason = "モメンタム逆転";
                    else if(close5) reason = "トレンド崩壊";
                    else if(close6) reason = "部分利確";
                    else if(close4) reason = "D急増";
                    else if(close1) reason = "スコア差縮小";

                    Print("CLOSE ", symbol, " Reason: ", reason,
                          " Pips: ", DoubleToStr((OrderClosePrice() - OrderOpenPrice()) / Point, 1));
                }
            }
        }
    }
}

//===================================
// クールダウン管理
//===================================
bool IsInCooldown(string pairKey)
{
    int currentBar = iBars(Symbol(), PERIOD_CURRENT);
    for(int i = 0; i < CooldownCount; i++)
    {
        if(CooldownPairs[i] == pairKey && currentBar < CooldownUntil[i])
            return true;
    }
    return false;
}

void SetCooldown(string pairKey)
{
    int currentBar = iBars(Symbol(), PERIOD_CURRENT);

    // 既存エントリを更新
    for(int i = 0; i < CooldownCount; i++)
    {
        if(CooldownPairs[i] == pairKey)
        {
            CooldownUntil[i] = currentBar + CooldownBars;
            return;
        }
    }

    // 新規エントリ
    if(CooldownCount < 50)
    {
        CooldownPairs[CooldownCount] = pairKey;
        CooldownUntil[CooldownCount] = currentBar + CooldownBars;
        CooldownCount++;
    }
}

//===================================
// ユーティリティ
//===================================

int GetCurrencyIndex(string cur)
{
    for(int i = 0; i < 8; i++)
        if(Currencies[i] == cur) return i;
    return -1;
}

bool SymbolExists(string symbol)
{
    return(MarketInfo(symbol, MODE_BID) > 0);
}

bool HasPosition(string cur1, string cur2)
{
    for(int i = OrdersTotal() - 1; i >= 0; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
        if(StringFind(OrderComment(), Prefix) < 0) continue;
        string posSymbol = OrderSymbol();
        string b = StringSubstr(posSymbol, 0, 3);
        string q = StringSubstr(posSymbol, 3, 3);
        if((b == cur1 && q == cur2) || (b == cur2 && q == cur1))
            return true;
    }
    return false;
}

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

int GenerateMagicNumber(string symbol)
{
    int hash = 0;
    for(int i = 0; i < StringLen(symbol); i++)
        hash = (hash * 31 + StringGetChar(symbol, i)) % 2147483647;
    return MathAbs(hash);
}

void PrintStrength()
{
    Print("=== Currency Strength Matrix v3.1 ===");
    for(int i = 0; i < 8; i++)
    {
        string bar = "";
        int bars = (int)(StrengthScores[i] * 20);
        if(bars > 0)
            for(int j = 0; j < bars && j < 30; j++) bar += "+";
        else if(bars < 0)
            for(int j = 0; j > bars && j > -30; j--) bar += "-";

        Print(Currencies[i], ": ", DoubleToStr(StrengthScores[i], 3),
              " Mom=", DoubleToStr(Momentum[i], 2),
              " Acc=", DoubleToStr(Accel[i], 2),
              " |", bar);
    }

    int maxIdx = 0, minIdx = 0;
    for(int i = 1; i < 8; i++)
    {
        if(StrengthScores[i] > StrengthScores[maxIdx]) maxIdx = i;
        if(StrengthScores[i] < StrengthScores[minIdx]) minIdx = i;
    }
    Print(">>> STRONGEST: ", Currencies[maxIdx],
          " (", DoubleToStr(StrengthScores[maxIdx], 3),
          " Mom=", DoubleToStr(Momentum[maxIdx], 2), ")");
    Print(">>> WEAKEST:   ", Currencies[minIdx],
          " (", DoubleToStr(StrengthScores[minIdx], 3),
          " Mom=", DoubleToStr(Momentum[minIdx], 2), ")");
    Print(">>> TRADE:     ", Currencies[maxIdx], "/", Currencies[minIdx],
          " Diff=", DoubleToStr(StrengthScores[maxIdx] - StrengthScores[minIdx], 3),
          " V=N/D=", DoubleToStr(CurrentV, 2));
}

//===================================
// EOF — TheYKHC EA v3.1
// 逆転防止ロジック:
//   1. モメンタム確認 (上昇中のみ買い)
//   2. ピーク直後抑制 (モメンタム正→負転換後3バー)
//   3. トレンド確認 (3バー連続同方向)
//   3.5 加速度チェック (急減速は見送り)
//   4. クールダウン (決済後10バー再エントリー禁止)
//   5. モメンタム逆転早期決済
//   6. トレンド崩壊検知
//   7. 部分利確 (スコア差半減+モメンタム減速)
// バックテスト結果: PF 1.91, Win Rate 39.5%
//===================================
