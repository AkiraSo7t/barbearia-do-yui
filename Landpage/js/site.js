function initSite() {
  initSmoothScroll();
  initHeroTitleAnimation();
  initClientStrip();
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', initSite, { once: true });
else initSite();

// Bibliotecas locais: GSAP sincroniza o Lenis; sem GSAP, ele usa seu próprio RAF.
function initSmoothScroll() {
  if (!window.Lenis) return console.warn('Lenis não carregou: confira js/vendor/lenis.min.js.');
  if (window.lenis instanceof window.Lenis) return;
  const lenis = (window.lenis = new Lenis({
    autoRaf: !window.gsap,
    smoothWheel: true,
    lerp: 0.1,
    wheelMultiplier: 0.9,
    anchors: true,
    syncTouch: false,
    // Efeito sempre ativo, conforme a experiência de rolagem solicitada.
    respectReducedMotion: false
  }));
  if (window.gsap) {
    if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.lagSmoothing(0);
    gsap.ticker.add(seconds => lenis.raf(seconds * 1000));
  }
  window.addEventListener('load', () => lenis.resize(), { once: true });
}

// O scroll controla as três trocas; cada palavra mantém o movimento do vídeo.
function initHeroTitleAnimation() {
  const hero = document.querySelector('.site-hero');
  const lines = [...document.querySelectorAll('.hero-flip-line')];
  if (!hero || lines.length !== 3 || !window.gsap || !window.ScrollTrigger) return;
  const words = lines.map(line => [...line.querySelectorAll('.hero-flip-word')]);
  if (words.some(pair => pair.length !== 2)) return;
  gsap.registerPlugin(ScrollTrigger);

  gsap.set(lines[0], { autoAlpha: 1 });
  gsap.set(lines.slice(1), { autoAlpha: 0 });
  gsap.set(words.flat(), { rotationX: 0, yPercent: 0, scaleY: 1 });

  const timeline = gsap.timeline({ paused: true });
  lines.forEach((current, index) => {
    const next = lines[(index + 1) % lines.length];
    const [oldFirst, oldLast] = words[index];
    const [newFirst, newLast] = words[(index + 1) % lines.length];
    const flip = `flip-${index}`;

    timeline.to({}, { duration: 0.36 });
    timeline.addLabel(flip);
    timeline.set(next, { autoAlpha: 1 }, flip);
    timeline.set(newFirst, { rotationX: -78, yPercent: -82, scaleY: 0.3 }, flip);
    timeline.set(newLast, { rotationX: 78, yPercent: 82, scaleY: 0.3 }, flip);
    timeline.to(
      oldFirst,
      {
        rotationX: 78,
        yPercent: 82,
        scaleY: 0.3,
        duration: 0.8,
        ease: 'sine.inOut'
      },
      flip
    );
    timeline.to(
      oldLast,
      {
        rotationX: -78,
        yPercent: -82,
        scaleY: 0.3,
        duration: 0.8,
        ease: 'sine.inOut'
      },
      flip
    );
    timeline.to(
      [newFirst, newLast],
      {
        rotationX: 0,
        yPercent: 0,
        scaleY: 1,
        duration: 0.8,
        ease: 'sine.inOut'
      },
      `${flip}+=0.04`
    );
    timeline.set(current, { autoAlpha: 0 }, `${flip}+=0.84`);
  });
  timeline.to({}, { duration: 0.36 });

  function attachToScroll() {
    if (!hero.classList.contains('hero-scroll-active')) return;
    ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: 'bottom bottom',
      animation: timeline,
      scrub: 0.35,
      invalidateOnRefresh: true
    });
    ScrollTrigger.refresh();
  }
  if (hero.classList.contains('hero-scroll-active')) attachToScroll();
  else window.addEventListener('hero-ready', attachToScroll, { once: true });
}

// Eventos e animação da faixa de clientes, com arraste e inércia.
function initClientStrip() {
  const clientStrip = document.querySelector('.client-strip');
  if (clientStrip) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const originalChildren = Array.from(clientStrip.children);
    originalChildren.forEach(child => {
      const clone = child.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clientStrip.appendChild(clone);
    });
    let isHovered = false;
    let isDragging = false;
    let startX = 0;
    let scrollStart = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let animationId = null;
    let inertiaId = null;
    const baseSpeed = 0.7; // pixels por quadro
    clientStrip.addEventListener('mouseenter', () => {
      isHovered = true;
    });
    clientStrip.addEventListener('mouseleave', () => {
      isHovered = false;
    });
    clientStrip.addEventListener('focusin', () => {
      isHovered = true;
    });
    clientStrip.addEventListener('focusout', () => {
      isHovered = false;
    });
    const autoScroll = () => {
      if (!prefersReducedMotion && !isHovered && !isDragging) {
        clientStrip.scrollLeft += baseSpeed;
        const halfWidth = clientStrip.scrollWidth / 2;
        if (clientStrip.scrollLeft >= halfWidth) {
          clientStrip.scrollLeft -= halfWidth;
        }
      }
      animationId = requestAnimationFrame(autoScroll);
    };
    if (!prefersReducedMotion) {
      animationId = requestAnimationFrame(autoScroll);
    }
    clientStrip.addEventListener('pointerdown', e => {
      isDragging = true;
      clientStrip.classList.add('dragging');
      cancelAnimationFrame(inertiaId);
      startX = e.pageX - clientStrip.offsetLeft;
      scrollStart = clientStrip.scrollLeft;
      lastX = e.pageX;
      lastTime = performance.now();
      velocity = 0;
    });
    window.addEventListener('pointermove', e => {
      if (!isDragging) return;
      const x = e.pageX - clientStrip.offsetLeft;
      const walk = x - startX;
      clientStrip.scrollLeft = scrollStart - walk;
      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velocity = (lastX - e.pageX) / dt;
      }
      lastX = e.pageX;
      lastTime = now;
    });
    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      clientStrip.classList.remove('dragging');
      let currentVelocity = velocity * 15;
      const friction = 0.92;
      const applyInertia = () => {
        if (Math.abs(currentVelocity) > 0.1 && !isDragging) {
          clientStrip.scrollLeft += currentVelocity;
          const halfWidth = clientStrip.scrollWidth / 2;
          if (clientStrip.scrollLeft >= halfWidth) clientStrip.scrollLeft -= halfWidth;
          if (clientStrip.scrollLeft <= 0) clientStrip.scrollLeft += halfWidth;
          currentVelocity *= friction;
          inertiaId = requestAnimationFrame(applyInertia);
        }
      };
      inertiaId = requestAnimationFrame(applyInertia);
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }
}
