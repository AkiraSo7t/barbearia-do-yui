(() => {
  const hero = document.querySelector('.site-hero');
  const poster = hero?.querySelector('.hero-wallpaper');
  if (!poster) return;
  const stage = document.createElement('div');
  stage.className = 'hero-scroll-stage';
  while (hero.firstChild) stage.append(hero.firstChild);
  hero.append(stage);
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-scroll-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.insertBefore(canvas, poster.nextSibling);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const frames = new Array(50);
  let pending = false;
  let lastFrame = -1;
  function draw() {
    pending = false;
    const travel = hero.offsetHeight - stage.offsetHeight;
    const progress = Math.max(
      0,
      Math.min(1, -hero.getBoundingClientRect().top / Math.max(1, travel))
    );
    const target = Math.round(progress * 49);
    let frame = frames[target];
    let chosen = target;
    if (!frame)
      for (let d = 1; d < 50; d++) {
        chosen = frames[target - d] ? target - d : target + d;
        frame = frames[chosen];
        if (frame) break;
      }
    if (!frame) return;
    // Os arquivos têm 1280 × 720; ampliar o canvas para DPR 2 só quadruplica o trabalho.
    const w = Math.round(stage.clientWidth),
      h = Math.round(stage.clientHeight);
    const resized = canvas.width !== w || canvas.height !== h;
    if (chosen === lastFrame && !resized) return;
    if (resized) {
      canvas.width = w;
      canvas.height = h;
    }
    const scale = Math.max(w / frame.naturalWidth, h / frame.naturalHeight);
    const dw = frame.naturalWidth * scale,
      dh = frame.naturalHeight * scale;
    ctx.drawImage(frame, (w - dw) / 2, (h - dh) / 2, dw, dh);
    lastFrame = chosen;
    canvas.style.opacity = '1';
  }
  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(draw);
    }
  }
  function configure() {
    const ready = Boolean(frames[0]);
    if (ready && !hero.classList.contains('hero-scroll-active')) {
      hero.classList.add('hero-scroll-active');
      window.dispatchEvent(new Event('hero-ready'));
    }
    schedule();
  }
  let next = 0;
  async function load() {
    while (next < 50) {
      const i = next++;
      await new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          frames[i] = img;
          configure();
          resolve();
        };
        img.onerror = resolve;
        img.src = `assets/hero-frames/frame_${String(i + 1).padStart(3, '0')}.png`;
      });
    }
  }
  for (let i = 0; i < 4; i++) load();
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
})();
