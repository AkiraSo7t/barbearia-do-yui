// Galeria: posicionamento dos cartões durante a rolagem.
(() => {
  const stage = document.querySelector('.street-gallery-stage.motion-focus');
  if (!stage) return;

  const cards = [...stage.querySelectorAll('.street-gallery-card')];
  const pitch = 207 + 90;
  let pointerStart;
  let trigger;

  function render(position) {
    const activeScale = innerWidth <= 360 ? 1.48 : 1.65;
    cards.forEach((card, index) => {
      let slot = (index - position + cards.length) % cards.length;
      if (slot > cards.length / 2) slot -= cards.length;
      card.style.setProperty('--card-x', `${slot * pitch}px`);
      const focus = Math.max(0, 1 - Math.abs(slot));
      card.style.setProperty('--card-scale', String(1 + (activeScale - 1) * focus));
      card.style.setProperty(
        '--card-opacity',
        String(Math.max(0, Math.min(1, (3 - Math.abs(slot)) / 1.5)))
      );
      card.style.zIndex = String(Math.round(40 - Math.abs(slot) * 10));
    });
    stage.classList.add('is-ready');
  }

  function goToStep(direction) {
    if (!trigger) return;
    const step = Math.max(
      0,
      Math.min(cards.length, Math.round(trigger.progress * cards.length) + direction)
    );
    const destination = trigger.start + ((trigger.end - trigger.start) * step) / (cards.length + 1);
    if (window.lenis) window.lenis.scrollTo(destination, { duration: 1.2 });
    else window.scrollTo({ top: destination, behavior: 'smooth' });
  }

  stage.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    goToStep(event.key === 'ArrowRight' ? 1 : -1);
  });
  stage.addEventListener('pointerdown', event => {
    pointerStart = event.clientX;
  });
  stage.addEventListener('pointerup', event => {
    if (pointerStart == null) return;
    const distance = event.clientX - pointerStart;
    pointerStart = undefined;
    if (Math.abs(distance) < 40) return;
    goToStep(distance < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => {
    pointerStart = undefined;
  });

  stage.classList.add('is-scroll-driven');
  render(0);
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      if (!window.gsap || !window.ScrollTrigger) return;
      gsap.registerPlugin(ScrollTrigger);
      trigger = ScrollTrigger.create({
        trigger: stage.closest('.street-gallery'),
        start: 'center center',
        end: () => `+=${(cards.length + 1) * Math.max(280, Math.min(560, innerHeight * 0.65))}`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate(self) {
          render(Math.min(cards.length, self.progress * (cards.length + 1)));
        }
      });
      window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
    },
    { once: true }
  );
})();

// Bordas: iluminação dos cartões conforme o movimento.
(() => {
  const cards = [...document.querySelectorAll('.border-glow-target')];
  if (!cards.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const reach = 120,
    cycle = 7000,
    attack = 180,
    release = 540;
  const started = performance.now();
  let pointer = null,
    frame = 0,
    lastTime = started;
  const states = cards.map(card => {
    const lamp = document.createElement('span');
    lamp.className = 'border-glow-lamp';
    lamp.setAttribute('aria-hidden', 'true');
    lamp.innerHTML =
      '<span class="glow-wash"></span><span class="glow-spot glow-halo"><span class="glow-ring"></span></span><span class="glow-spot"><span class="glow-ring"></span></span>';
    card.prepend(lamp);
    return { card, lamp, x: 0, y: 0, power: 0, initialized: false };
  });

  function outline(width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    const horizontal = width - 2 * r,
      vertical = height - 2 * r;
    const arc = (Math.PI * r) / 2;
    const length = 2 * (horizontal + vertical) + 4 * arc;
    const clamp = (value, max) => Math.max(0, Math.min(max, value));
    const straight = (size, point) => ({
      size,
      point,
      nearest(x, y) {
        if (!size) return 0;
        const [ax, ay] = point(0);
        const [bx, by] = point(size);
        return clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / size, size);
      }
    });
    const corner = (x, y, start) => ({
      size: arc,
      nearest(px, py) {
        const middle = start + Math.PI / 4;
        const angle =
          ((Math.atan2(py - y, px - x) - middle + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        return clamp((angle + Math.PI / 4) * r, arc);
      },
      point(distance) {
        const angle = start + distance / r;
        return [x + r * Math.cos(angle), y + r * Math.sin(angle)];
      }
    });
    const parts = [
      straight(horizontal, d => [r + d, 0]),
      corner(width - r, r, -Math.PI / 2),
      straight(vertical, d => [width, r + d]),
      corner(width - r, height - r, 0),
      straight(horizontal, d => [width - r - d, height]),
      corner(r, height - r, Math.PI / 2),
      straight(vertical, d => [0, height - r - d]),
      corner(r, r, Math.PI)
    ];
    function pointAt(distance) {
      for (const part of parts) {
        if (part.size > distance) return part.point(distance);
        distance -= part.size;
      }
      return [r, 0];
    }
    function nearest(x, y) {
      let bestDistance = Infinity,
        bestOffset = 0,
        offset = 0;
      for (const part of parts) {
        if (!part.size) continue;
        const local = part.nearest(x, y);
        const [px, py] = part.point(local);
        const distance = (x - px) ** 2 + (y - py) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestOffset = (offset + local) % length;
        }
        offset += part.size;
      }
      return { distance: Math.sqrt(bestDistance), offset: bestOffset };
    }
    return { length, pointAt, nearest };
  }

  function schedule() {
    if (frame) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(draw);
  }
  function draw(now) {
    frame = 0;
    const dt = Math.min(50, Math.max(0, now - lastTime));
    lastTime = now;
    let moving = false;
    for (const state of states) {
      const { card, lamp } = state;
      if (!state.visible) continue;
      state.introStart ??= now;
      const elapsed = now - state.introStart;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (state.width !== rect.width || state.height !== rect.height) {
        state.width = rect.width;
        state.height = rect.height;
        const radius = parseFloat(getComputedStyle(card).getPropertyValue('--glow-radius'));
        state.path = outline(rect.width, rect.height, radius);
      }
      const { path } = state;
      const focused = card.matches(':focus-within');
      const touching = pointer?.touch && now < pointer.until;
      let nearest = null;
      if (pointer && (!pointer.touch || touching)) {
        const x = pointer.x - rect.left,
          y = pointer.y - rect.top;
        const hovering = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
        if (x >= -reach && x <= rect.width + reach && y >= -reach && y <= rect.height + reach) {
          nearest = path.nearest(x, y);
          nearest.hovering = hovering;
          if ((hovering || nearest.distance < reach) && pointer.movedAt >= state.introStart)
            state.interrupted = true;
        }
      }
      const intro = !reduced.matches && !state.interrupted && elapsed < cycle;
      let target = intro ? (path.length * elapsed) / cycle : (state.distance ?? 0);
      let power = intro || focused || reduced.matches ? 1 : 0;
      if (reduced.matches) target = 0;
      if (!intro && nearest && (nearest.hovering || nearest.distance < reach)) {
        target = nearest.offset;
        power = Math.max(power, nearest.hovering ? 0.65 : 0, 1 - nearest.distance / reach);
      }
      const lapLength = path.length;
      if (!state.initialized || reduced.matches) {
        state.distance = target;
        state.velocity = 0;
        state.power = power;
        state.initialized = true;
      } else {
        // O cálculo mantém a luz no contorno e suaviza a inversão da velocidade.
        const offset = ((target - state.distance + lapLength * 1.5) % lapLength) - lapLength / 2;
        const seconds = dt / 1000;
        const response = 18;
        const displacement = -offset;
        const momentum = state.velocity + response * displacement;
        const decay = Math.exp(-response * seconds);
        const remaining = (displacement + momentum * seconds) * decay;
        state.velocity = (state.velocity - response * momentum * seconds) * decay;
        state.distance =
          (((state.distance + offset + remaining) % lapLength) + lapLength) % lapLength;
        const brightnessTime = power > state.power ? attack : release;
        state.power += (power - state.power) * (1 - Math.exp((-dt * 3) / brightnessTime));
        moving ||=
          intro ||
          Boolean(touching) ||
          Math.abs(power - state.power) > 0.002 ||
          (state.power > 0.002 && (Math.abs(offset) > 0.1 || Math.abs(state.velocity) > 0.5));
      }
      moving ||= intro;
      const [x, y] = path.pointAt(state.distance);
      lamp.style.setProperty('--glow-x', x + 'px');
      lamp.style.setProperty('--glow-y', y + 'px');
      lamp.style.setProperty('--glow-power', state.power < 0.002 ? 0 : state.power.toFixed(4));
    }
    if (moving) frame = requestAnimationFrame(draw);
  }

  addEventListener(
    'pointermove',
    event => {
      if (event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY, movedAt: performance.now() };
      schedule();
    },
    { passive: true }
  );
  addEventListener('pointerout', event => {
    if (!event.relatedTarget) {
      pointer = null;
      schedule();
    }
  });
  cards.forEach(card =>
    card.addEventListener(
      'pointerdown',
      event => {
        if (event.pointerType !== 'touch') return;
        pointer = {
          x: event.clientX,
          y: event.clientY,
          touch: true,
          movedAt: performance.now(),
          until: performance.now() + 650
        };
        schedule();
      },
      { passive: true }
    )
  );
  addEventListener('focusin', schedule);
  addEventListener('focusout', schedule);
  addEventListener('scroll', schedule, { passive: true });
  new ResizeObserver(schedule).observe(document.documentElement);
  reduced.addEventListener('change', schedule);
  const byCard = new Map(states.map(state => [state.card, state]));
  const visibility = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const state = byCard.get(entry.target);
        state.visible = entry.intersectionRatio >= 0.2;
        if (!state.visible) {
          state.initialized = false;
          state.lamp.style.setProperty('--glow-power', 0);
        }
      }
      schedule();
    },
    { threshold: 0.2 }
  );
  cards.forEach(card => visibility.observe(card));
})();

// Botões: partículas durante a interação.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const cleanup = [];
  const glyphs = '.:+*#%@';
  document.querySelectorAll('.shatter-button').forEach(button => {
    const label = button.querySelector('.shatter-label');
    const canvas = document.createElement('canvas');
    canvas.className = 'shatter-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    button.append(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width,
      height,
      cell,
      particles = [];
    let frame = 0,
      start = 0,
      previous = 0,
      opacity = 0;
    let hovering = false,
      focused = false;
    const listen = (type, callback) =>
      button.addEventListener(type, callback, { signal: listeners.signal });

    function prepare() {
      const rect = button.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mask = document.createElement('canvas');
      mask.width = Math.ceil(width);
      mask.height = Math.ceil(height);
      const paint = mask.getContext('2d', { willReadFrequently: true });
      const title = label.textContent.trim();
      let size = Math.min(23, height * 0.48);
      paint.font = '700 ' + size + 'px monospace';
      size *= Math.min(1, (width - 30) / paint.measureText(title).width);
      paint.font = '700 ' + size + 'px monospace';
      paint.fillStyle = '#fff';
      paint.textAlign = 'center';
      paint.textBaseline = 'middle';
      paint.fillText(title, width / 2, height / 2);
      const pixels = paint.getImageData(0, 0, mask.width, mask.height).data;
      cell = Math.max(2, Math.min(3, width / 100));
      particles = [];
      for (let y = cell / 2; y < height; y += cell) {
        for (let x = cell / 2; x < width; x += cell) {
          if (pixels[(Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3] < 70) continue;
          particles.push({
            x,
            y,
            dx: (Math.random() - 0.5) * width * 0.8,
            dy: (Math.random() - 0.5) * height * 1.8,
            glyph: glyphs[Math.floor(Math.random() * glyphs.length)]
          });
        }
      }
      ctx.font = cell + 'px monospace';
      ctx.fillStyle = getComputedStyle(button).color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    function draw(now) {
      frame = 0;
      const active = hovering || focused;
      const dt = Math.min(50, now - (previous || now));
      previous = now;
      opacity += ((active ? 1 : 0) - opacity) * (1 - Math.exp(-dt / 90));
      const elapsed = Math.max(0, now - start);
      const settle = Math.min(1, elapsed / 850);
      const scatter = Math.pow(1 - settle, 3);
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = opacity;
      particles.forEach((particle, index) => {
        const glyph =
          settle < 0.6
            ? glyphs[(index + Math.floor(elapsed / 65)) % glyphs.length]
            : particle.glyph;
        ctx.fillText(glyph, particle.x + particle.dx * scatter, particle.y + particle.dy * scatter);
      });
      if (!active && opacity < 0.01) {
        button.classList.remove('is-shattering');
        previous = 0;
      } else if (settle < 1 || Math.abs((active ? 1 : 0) - opacity) > 0.01) {
        frame = requestAnimationFrame(draw);
      }
    }

    function update() {
      if (reduced.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        button.classList.remove('is-shattering');
        return;
      }
      if ((hovering || focused) && !button.classList.contains('is-shattering')) {
        prepare();
        start = performance.now();
        opacity = 0;
        previous = 0;
        button.classList.add('is-shattering');
      }
      if (!frame) frame = requestAnimationFrame(draw);
    }
    listen('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovering = true;
      update();
    });
    listen('pointerleave', () => {
      hovering = false;
      update();
    });
    listen('focus', () => {
      focused = button.matches(':focus-visible');
      update();
    });
    listen('blur', () => {
      focused = false;
      update();
    });
    listen('pointerdown', event => {
      if (event.pointerType === 'touch') {
        hovering = true;
        update();
      }
    });
    listen('pointerup', event => {
      if (event.pointerType === 'touch') {
        hovering = false;
        update();
      }
    });
    listen('pointercancel', () => {
      hovering = false;
      update();
    });
    listen('pointermove', event => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--halo-x', event.clientX - rect.left + 'px');
      button.style.setProperty('--halo-y', event.clientY - rect.top + 'px');
    });
    const observer = new ResizeObserver(() => {
      if (button.classList.contains('is-shattering')) {
        prepare();
        if (!frame) frame = requestAnimationFrame(draw);
      }
    });
    observer.observe(button);
    reduced.addEventListener('change', update, { signal: listeners.signal });
    cleanup.push(() => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    });
  });
  addEventListener(
    'pagehide',
    event => {
      if (event.persisted) return;
      listeners.abort();
      cleanup.forEach(dispose => dispose());
    },
    { signal: listeners.signal }
  );
})();

// Planos: destaque visual da opção selecionada.
(() => {
  const panels = [...document.querySelectorAll('.glow-box')];
  if (!panels.length) return;
  const listeners = new AbortController();
  function update() {
    panels.forEach(panel => {
      const choice = panel.querySelector('.plan-choice');
      panel.classList.toggle(
        'is-glowing',
        choice ? choice.getAttribute('aria-pressed') === 'true' : true
      );
    });
  }
  const observer = new MutationObserver(update);
  panels.forEach(panel => {
    const light = document.createElement('span');
    light.className = 'glow-box-light';
    light.setAttribute('aria-hidden', 'true');
    light.innerHTML = '<span class="glow-box-field"></span><span class="glow-box-edge"></span>';
    panel.prepend(light);
    observer.observe(panel, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  });
  update();
  addEventListener(
    'pagehide',
    event => {
      if (event.persisted) return;
      observer.disconnect();
      listeners.abort();
    },
    { signal: listeners.signal }
  );
})();
