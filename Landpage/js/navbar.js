(() => {
  const nav = document.querySelector('.adaptive-nav');
  if (!nav) return;
  const shell = nav.querySelector('.adaptive-nav-shell');
  const toggle = nav.querySelector('.adaptive-nav-toggle');
  const links = nav.querySelector('.adaptive-nav-links');
  const listeners = new AbortController();
  const on = (target, type, callback) =>
    target.addEventListener(type, callback, { signal: listeners.signal });
  const mobile = matchMedia('(max-width: 760px)');
  const syncMenuAccess = () => {
    links.inert = mobile.matches && !nav.classList.contains('is-menu-open');
  };
  links.id = 'adaptive-nav-links';
  syncMenuAccess();
  toggle.setAttribute('aria-controls', links.id);
  const closeMenu = (restoreFocus = false) => {
    nav.classList.remove('is-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
    if (restoreFocus) toggle.focus();
    syncMenuAccess();
  };
  on(toggle, 'click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('is-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    syncMenuAccess();
  });
  on(document, 'keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-menu-open')) closeMenu(true);
  });
  on(document, 'click', e => {
    if (!nav.contains(e.target)) closeMenu();
  });
  on(nav, 'focusout', e => {
    if (!nav.contains(e.relatedTarget)) closeMenu();
  });
  on(nav, 'click', e => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    closeMenu();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (window.lenis) window.lenis.scrollTo(target, { offset: -92, immediate: reduced });
    else
      window.scrollTo({
        top: Math.max(0, scrollY + target.getBoundingClientRect().top - 92),
        behavior: reduced ? 'instant' : 'smooth'
      });
    history.replaceState(null, '', link.getAttribute('href'));
    // Ao fechar o menu no celular, o foco do teclado acompanha a seção escolhida.
    const hadTabindex = target.hasAttribute('tabindex');
    if (!hadTabindex) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    if (!hadTabindex)
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
  });
  on(mobile, 'change', () => {
    if (!mobile.matches && document.activeElement === toggle)
      nav.querySelector('.adaptive-nav-brand').focus();
    closeMenu();
  });
  let media;
  if (window.gsap) {
    media = gsap.matchMedia();
    media.add(
      {
        small: '(max-width: 760px)',
        reduced: '(prefers-reduced-motion: reduce)',
        normal: '(prefers-reduced-motion: no-preference)'
      },
      context => {
        const { small } = context.conditions;
        // A transição da barra usa a mesma duração para todos os usuários.
        const reduced = context.conditions.reduced && nav.dataset.motion !== 'full';
        const scoped = new AbortController();
        const listen = (target, type, fn) =>
          target.addEventListener(type, fn, { signal: scoped.signal });
        const expanded = () => Math.min(1120, innerWidth - (small ? 24 : 48));
        const compact = () =>
          Math.min(small ? 520 : 980, small ? expanded() : innerWidth * 0.82, expanded());
        gsap.set(nav, { y: 0 });
        gsap.set(shell, { '--surface': 1 });
        const timeline = gsap.timeline({ paused: true, defaults: { duration: 1, ease: 'none' } });
        timeline.fromTo(
          shell,
          {
            maxWidth: compact,
            height: small ? 56 : 44,
            borderRadius: small ? 28 : 22,
            paddingLeft: small ? 14 : 18,
            paddingRight: small ? 14 : 18,
            '--surface': 1
          },
          {
            maxWidth: small ? compact : expanded,
            height: small ? 56 : 44,
            borderRadius: small ? 28 : 22,
            paddingLeft: small ? 14 : 18,
            paddingRight: small ? 14 : 18,
            '--surface': small ? 1 : 0,
            immediateRender: true
          },
          0
        );
        // Largura, altura e cantos seguem a mesma animação ao expandir e contrair.
        if (!small) {
          // A coluna central conserva seu espaço enquanto os links desaparecem.
          timeline.fromTo(
            links,
            { autoAlpha: 1, y: 0 },
            { autoAlpha: 0, y: 0, duration: 1, ease: 'none' },
            0
          );
        }
        timeline.progress(small ? 0 : 1).pause();
        let hovered = false;
        let targetProgress = small ? 0 : 1;
        let transition;
        const update = () => {
          const keyboardFocus = shell.querySelector(':focus-visible') !== null;
          const next = !small && !hovered && !keyboardFocus ? 1 : 0;
          if (next === targetProgress) return;
          targetProgress = next;
          transition?.kill();
          if (reduced) {
            timeline.progress(next).pause();
            return;
          }
          // Se o ponteiro sair durante a transição, a barra volta da posição atual.
          const remaining = Math.abs(next - timeline.progress());
          transition = timeline.tweenTo(next, {
            duration: Math.max(0.12, 0.52 * Math.sqrt(remaining)),
            ease: 'power3.out',
            onStart: () => {
              shell.style.willChange = 'max-width';
            },
            onComplete: () => {
              shell.style.willChange = 'auto';
            }
          });
        };
        // A área de interação mantém a largura expandida para evitar oscilações na borda.
        const insideHoverZone = (x, y, tolerance = 0) => {
          const width = expanded();
          const left = (innerWidth - width) / 2;
          const top =
            nav.getBoundingClientRect().top + parseFloat(getComputedStyle(nav).paddingTop);
          return (
            x >= left - tolerance &&
            x <= left + width + tolerance &&
            y >= top - tolerance &&
            y <= top + 44 + tolerance
          );
        };
        const trackPointer = event => {
          if (small || event.pointerType !== 'mouse') return;
          // A margem de quatro pixels evita oscilações quando o ponteiro encosta na borda.
          const next = insideHoverZone(event.clientX, event.clientY, hovered ? 4 : 0);
          if (next === hovered) return;
          hovered = next;
          update();
        };
        listen(document, 'pointermove', trackPointer);
        listen(document, 'pointerleave', () => {
          hovered = false;
          update();
        });
        listen(window, 'blur', () => {
          hovered = false;
          update();
        });
        listen(shell, 'focusin', update);
        listen(shell, 'focusout', () => queueMicrotask(update));
        listen(window, 'resize', () => {
          const progress = timeline.progress();
          timeline.invalidate().progress(progress);
        });
        update();
        return () => {
          transition?.kill();
          shell.style.willChange = 'auto';
          scoped.abort();
          closeMenu();
        };
      }
    );
  }
  on(window, 'pagehide', e => {
    if (e.persisted) return;
    media?.revert();
    listeners.abort();
  });
})();
