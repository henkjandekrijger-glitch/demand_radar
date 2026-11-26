// node render.js [preview t1,t2,...] | node render.js full
// Tijdlijn uit vo.json (duur per stemregel), beelden met Playwright (HTML), video en geluid met ffmpeg.
const fs = require('fs'), { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');
const FF = fs.readFileSync('ff.txt', 'utf8').trim();
const K = process.env.K || 'yt';
const vo = JSON.parse(fs.readFileSync(`vo_${K}.json`, 'utf8'));
const FPS = 30;

// tijdlijn
const CTA = { yt: 'Nexy is free on iPhone and Android. Tap our channel name for the link.', tt: 'Nexy is free on iPhone and Android. The link is in my profile.', ig: 'Nexy is free on iPhone and Android. The link is in my profile.' }[K] || 'Nexy is free on iPhone and Android. Tap the link below.';
const tekst = fs.readFileSync('vo.txt', 'utf8').split('\n').map(x => x.trim()).filter(Boolean).map(x => x.replace('{CTA}', CTA));
const BPM = +(process.env.BPM || 112), B = 60 / BPM;
const q = x => Math.ceil(x / B - 1e-6) * B;          // naar de volgende tel
const h = x => Math.ceil(x / (B / 2) - 1e-6) * B / 2; // naar de volgende halve tel
const T = { vo, tekst, l: [], B };
// ritme: elke beeldwissel valt op een tel, elke stemregel start op een (halve) tel
T.l[0] = 0.05; T.uit = q(T.l[0] + vo[0] + 0.05); T.l[1] = T.uit + 0.08;
T.b = q(T.l[1] + vo[1] + 0.1); T.l[2] = T.b + 0.08;
T.c = q(T.l[2] + vo[2] + 0.25); T.shut = T.c - B / 2;
T.l[3] = T.c + B / 2; T.rij = T.c + B;                 // datums vallen er een voor een in, een per tel
T.d = q(Math.max(T.l[3] + vo[3] + 0.15, T.rij + 4 * B)); T.ban = T.d + B / 2; T.l[4] = T.d + 0.08;
T.samT = q(T.l[4] + vo[4] * 0.55); T.e = q(T.l[4] + vo[4] + 0.3); T.l[5] = T.e + 0.1; T.urlAan = T.c + 0.5;
T.end = q(T.l[5] + vo[5] + 0.45) + B;
fs.writeFileSync('T.json', JSON.stringify(T, null, 1));

(async () => {
  const mode = process.argv[2] || 'full';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await p.goto('file://' + process.cwd() + '/video.html?k=' + K);
  await p.evaluate(T => { window.T = T; }, T);
  await p.evaluate(async () => { for (const f of ['400 29px "Source Serif 4"', '600 29px "Source Serif 4"', '700 44px "Source Serif 4"', 'italic 400 28px "Source Serif 4"', '400 30px Inter', '500 30px Inter', '600 30px Inter', '700 30px Inter', '800 62px Inter']) await document.fonts.load(f); await document.fonts.ready; });
  await p.waitForTimeout(800);
  if (mode === 'preview') {
    const ts = (process.argv[3] || '').split(',').map(Number);
    let i = 0;
    for (const x of ts) { await p.evaluate(x => render(x), x); await p.screenshot({ path: `pv${++i}.jpg`, type: 'jpeg', quality: 80 }); }
    execFileSync(FF, ['-y', '-loglevel', 'error', '-i', 'pv%d.jpg', '-vf', `scale=360:-1,tile=${ts.length}x1:padding=6:color=white`, '-frames:v', '1', 'preview.jpg']);
    fs.writeFileSync('pv.html', `<html><body style="margin:0;background:#fff"><img src="preview.jpg?${Date.now()}" style="width:100%"><pre>${JSON.stringify(T)}</pre></body></html>`);
    await b.close(); return;
  }
  const n = Math.ceil(T.end * FPS);
  const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', 'beeld.tmp.mp4']);
  for (let i = 0; i < n; i++) {
    await p.evaluate(x => render(x), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise((r, j) => ff.on('close', c => c ? j(new Error('ffmpeg ' + c)) : r()));
  fs.renameSync('beeld.tmp.mp4', 'beeld.mp4');
  await b.close();

  // geluid: stem boven een beat op BPM (kick, hihat, clap op 2 en 4, bas in een vast akkoordschema),
  // muziek duikt onder de stem (sidechain), een tel stilte plus riser voor het eindscherm, crash op de wissel.
  const ms = x => Math.round(x * 1000), E = T.e;
  const ins = [], fl = [], fx = [], mus = [], vox = [];
  T.l.forEach((s, i) => { ins.push('-i', `vo${i + 1}_${K}.wav`); fl.push(`[${i}:a]aresample=48000,adelay=${ms(s)}:all=1[v${i}]`); vox.push(`[v${i}]`); });
  const add = (f, tag, lijst = fx) => { fl.push(f + `[${tag}]`); lijst.push(`[${tag}]`); };
  const D = T.end, stil = `(1-between(t,${(E - B).toFixed(4)},${(E - 0.005).toFixed(4)}))`, Bs = B.toFixed(5);
  add(`aevalsrc='0.9*sin(2*PI*(50*mod(t,${Bs})+3.2*(1-exp(-40*mod(t,${Bs})))))*exp(-9*mod(t,${Bs}))*${stil}':s=48000:d=${D},volume=0.55`, 'kick', mus);
  add(`aevalsrc='(random(0)*2-1)*exp(-70*mod(t+${(B / 2).toFixed(5)},${Bs}))*${stil}':s=48000:d=${D},highpass=f=7000,volume=0.16`, 'hat', mus);
  add(`aevalsrc='(random(1)*2-1)*exp(-26*mod(t+${Bs},${(2 * B).toFixed(5)}))*lt(mod(t+${Bs},${(2 * B).toFixed(5)}),${Bs})*${stil}':s=48000:d=${D},bandpass=f=1400:w=1200,volume=0.28`, 'clap', mus);
  const f = `(110*eq(mod(floor(t/${(4 * B).toFixed(5)}),4),0)+87.31*eq(mod(floor(t/${(4 * B).toFixed(5)}),4),1)+130.81*eq(mod(floor(t/${(4 * B).toFixed(5)}),4),2)+98*eq(mod(floor(t/${(4 * B).toFixed(5)}),4),3))`;
  add(`aevalsrc='sin(2*PI*${f}*t)*(0.35+0.65*exp(-5*mod(t,${Bs})))*${stil}':s=48000:d=${D},lowpass=f=420,volume=0.30`, 'bas', mus);
  add(`aevalsrc='0.5*sin(2*PI*2*${f}*t)*exp(-14*mod(t+${(B / 2).toFixed(5)},${Bs}))*${stil}':s=48000:d=${D},lowpass=f=2400,volume=0.10`, 'pluk', mus);
  add(`anoisesrc=d=${Bs}:c=pink:a=0.5,highpass=f=1200,afade=t=in:d=${Bs}:curve=exp,adelay=${ms(E - B)}:all=1,volume=0.35`, 'riser');
  add(`anoisesrc=d=1.4:c=white:a=0.4,highpass=f=4500,afade=t=out:st=0:d=1.4:curve=exp,adelay=${ms(E)}:all=1,volume=0.35`, 'crash');
  add(`anoisesrc=d=1.2:c=white:a=0.4,highpass=f=4500,afade=t=out:st=0:d=1.2:curve=exp,volume=0.25`, 'crash0');
  [T.uit, T.b].forEach((x, k) => add(`anoisesrc=d=0.3:c=pink:a=0.25,highpass=f=600,lowpass=f=5000,afade=t=in:d=0.18,afade=t=out:st=0.18:d=0.12,adelay=${ms(x - 0.18)}:all=1`, 'wh' + k));
  add(`anoisesrc=d=0.06:c=white:a=0.6,highpass=f=1800,afade=t=out:st=0.01:d=0.05,adelay=${ms(T.shut)}:all=1`, 'sh');
  add(`sine=f=1318:d=0.12,afade=t=out:st=0.03:d=0.09,volume=0.3,adelay=${ms(T.ban)}:all=1`, 'n1');
  add(`sine=f=1760:d=0.2,afade=t=out:st=0.05:d=0.15,volume=0.26,adelay=${ms(T.ban + B / 4)}:all=1`, 'n2');
  add(`sine=f=880:d=0.07,afade=t=out:st=0.02:d=0.05,volume=0.25,adelay=${ms(T.samT)}:all=1`, 'pop');
  for (let k = 0; k < 4; k++) add(`sine=f=${[660, 784, 880, 1046][k]}:d=0.09,afade=t=out:st=0.02:d=0.07,volume=0.16,adelay=${ms(T.rij + k * B)}:all=1`, 'tik' + k);
  fl.push(`${vox.join('')}amix=inputs=${vox.length}:normalize=0,asplit[vx][vk]`);
  fl.push(`${mus.join('')}amix=inputs=${mus.length}:normalize=0[m0]`, `[m0][vk]sidechaincompress=threshold=0.02:ratio=5:attack=15:release=220:makeup=1[md]`);
  const filt = fl.join(';') + ';[vx][md]' + fx.join('') + `amix=inputs=${fx.length + 2}:normalize=0,alimiter=limit=0.95,afade=t=out:st=${T.end - 0.35}:d=0.35,atrim=0:${T.end}[a]`;
  execFileSync(FF, ['-y', '-loglevel', 'error', ...ins, '-filter_complex', filt, '-map', '[a]', '-ar', '48000', '-ac', '2', 'geluid.wav']);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', 'beeld.mp4', '-i', 'geluid.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', 'uit.tmp.mp4']);
  fs.renameSync('uit.tmp.mp4', `schoolbrief-${K}.mp4`);
  fs.writeFileSync('w.html', `<html><body style="margin:0;background:#111;display:flex;justify-content:center"><video src="schoolbrief-${K}.mp4?${Date.now()}" controls autoplay style="height:100vh"></video></body></html>`);
  console.log('klaar', T.end.toFixed(2), 's');
})().catch(e => { console.error(e); process.exit(1); });
