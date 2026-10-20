// Draws the app icon on a canvas in headless Chromium and writes the PNGs in /icons.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const html = `<canvas id=c width=1024 height=1024></canvas><script>
function draw(scale){
  const c = document.getElementById('c'), x = c.getContext('2d');
  x.clearRect(0,0,1024,1024);
  const bg = x.createRadialGradient(512,340,60,512,512,760);
  bg.addColorStop(0,'#9b7bff'); bg.addColorStop(0.55,'#6a45e8'); bg.addColorStop(1,'#3a1fa0');
  x.fillStyle = bg; x.fillRect(0,0,1024,1024);
  x.save(); x.translate(512,512); x.scale(scale,scale); x.translate(-512,-512);
  const rr=(px,py,w,h,r)=>{x.beginPath();x.roundRect(px,py,w,h,r);};
  // board slab
  x.fillStyle='rgba(0,0,0,.35)'; rr(150,215,724,724,120); x.fill();
  x.fillStyle='#8f4f22'; rr(140,190,744,744,120); x.fill();
  x.fillStyle='#c9772f'; rr(140,170,744,744,120); x.fill();
  const pat=['PPP','WWP','FFB']; const cell=200, gap=18, ox=512-(3*cell+2*gap)/2, oy=490-(3*cell+2*gap)/2;
  for(let r=0;r<3;r++)for(let q=0;q<3;q++){
    const ch=pat[r][q], px=ox+q*(cell+gap), py=oy+r*(cell+gap);
    if(ch==='W'){
      x.fillStyle='#8a4a1e'; rr(px,py+22,cell,cell,36); x.fill();
      x.fillStyle='#f3b27a'; rr(px,py,cell,cell,36); x.fill();
      x.fillStyle='rgba(255,255,255,.35)'; rr(px+18,py+14,cell-36,26,13); x.fill();
    } else {
      x.fillStyle = (ch==='F') ? '#4a2616' : '#ffe56e';
      rr(px,py,cell,cell,34); x.fill();
      if(ch!=='F'){ x.fillStyle='rgba(255,255,255,.45)'; rr(px+16,py+12,cell-32,22,11); x.fill(); }
    }
  }
  // ball
  const bx=ox+2*(cell+gap)+cell/2, by=oy+2*(cell+gap)+cell/2-6, br=112;
  x.fillStyle='rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(bx+8,by+br*0.82,br*0.9,br*0.34,0,0,7); x.fill();
  const g=x.createRadialGradient(bx-40,by-46,8,bx,by,br*1.1);
  g.addColorStop(0,'#fffbe0'); g.addColorStop(0.3,'#ffd23a'); g.addColorStop(0.75,'#e09100'); g.addColorStop(1,'#9a5a00');
  x.fillStyle=g; x.beginPath(); x.arc(bx,by,br,0,7); x.fill();
  x.fillStyle='rgba(255,255,255,.8)'; x.beginPath(); x.ellipse(bx-42,by-50,34,20,-0.7,0,7); x.fill();
  // sparkles
  const star=(sx,sy,s)=>{x.fillStyle='#fff';x.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r2=i%2?s*0.28:s;x.lineTo(sx+Math.cos(a)*r2,sy+Math.sin(a)*r2);}x.closePath();x.fill();};
  star(820,190,54); star(230,150,34); star(860,700,28);
  x.restore();
}
</script>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(html);
mkdirSync('icons', { recursive: true });
const out = async (name, size, scale) => {
  const url = await page.evaluate(([s, sc]) => {
    draw(sc);
    const c = document.getElementById('c');
    const t = document.createElement('canvas'); t.width = t.height = s;
    t.getContext('2d').drawImage(c, 0, 0, s, s);
    return t.toDataURL('image/png');
  }, [size, scale]);
  writeFileSync(`icons/${name}`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
};
await out('icon-512.png', 512, 1);
await out('icon-192.png', 192, 1);
await out('apple-touch-icon.png', 180, 1);
await out('icon-maskable-512.png', 512, 0.78);
await browser.close();
