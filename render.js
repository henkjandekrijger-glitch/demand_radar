// node render.js [preview t1,t2,...] | node render.js full
// Tijdlijn uit vo.json (duur per stemregel), beelden met Playwright (HTML), video en geluid met ffmpeg.
const fs = require('fs'), { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');
const FF = fs.readFileSync('ff.txt', 'utf8').trim();
const vo = JSON.parse(fs.readFileSync('vo.json', 'utf8'));
const FPS = 30;

// tijdlijn
const tekst = fs.readFileSync('vo.txt', 'utf8').split('\n').map(x => x.trim()).filter(Boolean);
const T = { vo, tekst, l: [] };
T.l[0] = 0.05; T.uit = T.l[0] + vo[0] + 0.1; T.l[1] = T.uit + 0.15;
T.b = T.l[1] + vo[1] + 0.25; T.l[2] = T.b + 0.1; T.shut = T.l[2] + vo[2] + 0.1; T.c = T.shut + 0.1;
T.l[3] = T.c + 0.35; T.d = Math.max(T.l[3] + vo[3], T.l[3] + .45 + 4 * .5) + 0.35; T.ban = T.d + 0.25; T.l[4] = T.d + 0.2;
T.samT = T.l[4] + vo[4] * 0.55; T.e = T.l[4] + vo[4] + 0.5; T.l[5] = T.e + 0.15; T.urlAan = T.c + 0.5;
T.end = T.l[5] + vo[5] + 0.7;
fs.writeFileSync('T.json', JSON.stringify(T, null, 1));

(async () => {
  const mode = process.argv[2] || 'full';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await p.goto('file://' + process.cwd() + '/video.html');
  await p.evaluate(T => { window.T = T; }, T);
  await p.evaluate(() => document.fonts.ready);
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

  // geluid: stem, papier bij de start, whoosh bij elke overgang, sluiter, melding, bericht van Sam, typen, lichte beat (104 BPM)
  const ms = x => Math.round(x * 1000);
  const ins = [], fl = [], tags = [];
  T.l.forEach((s, i) => { ins.push('-i', `vo${i + 1}.wav`); fl.push(`[${i}:a]aresample=48000,adelay=${ms(s)}:all=1[v${i}]`); tags.push(`[v${i}]`); });
  const add = (f, tag) => { fl.push(f + `[${tag}]`); tags.push(`[${tag}]`); };
  add(`anoisesrc=d=0.5:c=pink:a=0.35,bandpass=f=2500:w=2000,afade=t=in:d=0.05,afade=t=out:st=0.15:d=0.35,adelay=0:all=1`, 'pap');
  [T.uit, T.c - 0.15, T.e - 0.15].forEach((x, k) => add(`anoisesrc=d=0.35:c=pink:a=0.25,highpass=f=600,lowpass=f=5000,afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.15,adelay=${ms(x)}:all=1`, 'wh' + k));
  add(`anoisesrc=d=0.06:c=white:a=0.6,highpass=f=1800,afade=t=out:st=0.01:d=0.05,adelay=${ms(T.shut)}:all=1`, 'sh');
  add(`sine=f=1318:d=0.12,afade=t=out:st=0.03:d=0.09,volume=0.3,adelay=${ms(T.ban)}:all=1`, 'n1');
  add(`sine=f=1760:d=0.2,afade=t=out:st=0.05:d=0.15,volume=0.26,adelay=${ms(T.ban + 0.11)}:all=1`, 'n2');
  add(`sine=f=880:d=0.07,afade=t=out:st=0.02:d=0.05,volume=0.25,adelay=${ms(T.samT)}:all=1`, 'pop');
  for (let k = 0; k < 11; k++) add(`anoisesrc=d=0.022:c=pink:a=0.22,highpass=f=2500,adelay=${ms(T.e + 0.25 + k * 0.064)}:all=1`, 'k' + k);
  add(`aevalsrc='0.55*sin(2*PI*52*mod(t,0.5769))*exp(-mod(t,0.5769)*13)+0.10*(random(0)*2-1)*exp(-mod(t+0.2885,0.5769)*75)':s=48000:d=${T.end},volume=0.22`, 'beat');
  const filt = fl.join(';') + ';' + tags.join('') + `amix=inputs=${tags.length}:normalize=0,alimiter=limit=0.95,afade=t=out:st=${T.end - 0.4}:d=0.4,atrim=0:${T.end}[a]`;
  execFileSync(FF, ['-y', '-loglevel', 'error', ...ins, '-filter_complex', filt, '-map', '[a]', '-ar', '48000', '-ac', '2', 'geluid.wav']);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', 'beeld.mp4', '-i', 'geluid.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', 'uit.tmp.mp4']);
  fs.renameSync('uit.tmp.mp4', 'schoolbrief2.mp4');
  fs.writeFileSync('w.html', `<html><body style="margin:0;background:#111;display:flex;justify-content:center"><video src="schoolbrief2.mp4?${Date.now()}" controls autoplay style="height:100vh"></video></body></html>`);
  console.log('klaar', T.end.toFixed(2), 's');
})().catch(e => { console.error(e); process.exit(1); });
