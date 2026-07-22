import re

text = """【研究の層】商業用製品への適用には、実用的なテストとフィードバックループが必要である。
【感情の層】顧客の期待に応えることで、信頼と満足感を築くことができる。
【知恵の層】市場のニーズに応じたカスタマイズが成功の鍵となる。
【市場の層】TAMは数十億ドルの市場規模で、特にビジネス支援ツールに需要が高い。
【リスクの層】技術的な実装の失敗や市場の変化がリスクとなる。
【V=N/Dスコア】7.5/10
【判定】go
【結論】Question Harvest Engineの解決策を商業用製品に適用することは可能である。

--- 市場規模 ---
【TAM】2000億円
【SAM】300億円
【SOM】30億円
【成長率(CAGR)】10%
【市場概要】ビジネス向けの商業用製品市場は急成長しており、特にデジタルソリューションが求められている。
【ターゲット】中小企業やスタートアップが主なターゲット層。
【競合状況】競合は多岐にわたり、特にIT企業やコンサルティングファームが強い。"""

def extract(pattern, text):
    m = re.search(pattern, text)
    return m.group(1).strip() if m else ""

print("TAM:", extract(r'【TAM】([^\n]*)', text))
print("SAM:", extract(r'【SAM】([^\n]*)', text))
print("SOM:", extract(r'【SOM】([^\n]*)', text))
print("growth_rate:", extract(r'成長率\(CAGR\)】([^\n]*)', text))
print("market_overview:", extract(r'【市場概要】([^\n]*)', text))
print("target:", extract(r'【ターゲット】([^\n]*)', text))
print("competitors:", extract(r'【競合状況】([^\n]*)', text))
print("research_layer:", extract(r'【研究の層】([^\n【]*)', text))
print("emotion_layer:", extract(r'【感情の層】([^\n【]*)', text))
print("wisdom_layer:", extract(r'【知恵の層】([^\n【]*)', text))
print("market_layer:", extract(r'【市場の層】([^\n【]*)', text))
print("risk_layer:", extract(r'【リスクの層】([^\n【]*)', text))
print("conclusion:", extract(r'【結論】([^\n]*)', text))
