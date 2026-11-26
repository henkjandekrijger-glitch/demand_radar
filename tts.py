# Stem met Kokoro (open source, draait in de sandbox): een wav per regel, stiltes aan begin en eind eraf, duur per regel in vo.json.
import json, os, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
stem = sys.argv[1] if len(sys.argv) > 1 else 'af_heart'
tempo = float(sys.argv[2]) if len(sys.argv) > 2 else 1.05
K = os.environ.get('K', 'yt')
CTA = {
  'yt': 'Nexy is free on iPhone and Android. Type nexy dot now, slash Y T.',
  'tt': 'Nexy is free on iPhone and Android. The link is in my bio.',
  'ig': 'Nexy is free on iPhone and Android. The link is in my bio.',
  'tg': 'Nexy is free on iPhone and Android. Tap the link below.',
  'fb': 'Nexy is free on iPhone and Android. Tap the link below.',
}[K]
k = Kokoro('ko/kokoro.onnx', 'ko/voices.bin')
duur = []
for i, regel in enumerate([r.strip().replace('{CTA}', CTA) for r in open('vo.txt') if r.strip()], 1):
    s, r = k.create(regel, voice=stem, speed=tempo, lang='en-us')
    a = np.abs(s); drem = 0.01 * a.max()
    nz = np.where(a > drem)[0]
    s = s[max(0, nz[0] - int(0.02 * r)): nz[-1] + int(0.06 * r)]
    sf.write(f'vo{i}_{K}.wav', s, r)
    duur.append(round(len(s) / r, 3))
json.dump(duur, open(f'vo_{K}.json', 'w'))
print(duur)
