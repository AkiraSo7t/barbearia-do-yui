(() => {
  const section = document.querySelector('.street-services');
  if (!section) return;

  const cards = [...section.querySelectorAll('.plan-card')];
  const choices = cards.map(card => card.querySelector('.plan-choice'));
  const listeners = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = Boolean(window.gsap && !reduced);
  const flip = window.gsap ? window.Flip : null;
  const panels = cards.map(card => card.querySelector('.plan-panel'));
  const context = motion ? gsap.context(() => {}, section) : null;
  if (flip) gsap.registerPlugin(flip);
  const storageKey = 'guren-selected-plan';

  function selectPlan(card, animate = true) {
    const choice = card.querySelector('.plan-choice');
    if (animate) {
      try {
        localStorage.setItem(storageKey, card.dataset.plan);
      } catch {}
    }
    if (choice.getAttribute('aria-pressed') === 'true') return;

    const state = animate && flip ? flip.getState(panels) : null;
    choices.forEach(button => button.setAttribute('aria-pressed', String(button === choice)));
    if (state) flip.from(state, { duration: 0.65, ease: 'power2.out' });
  }

  try {
    const saved = localStorage.getItem(storageKey);
    const savedCard = cards.find(card => card.dataset.plan === saved);
    if (savedCard) selectPlan(savedCard, false);
  } catch {}

  const dialog = section.querySelector('.plan-dialog');
  const continueButton = dialog.querySelector('[data-login-button]');
  const formatPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  let selectedCard;
  function showPlan(card) {
    dialog.querySelector('#plan-dialog-title').textContent =
      'Plano ' + card.querySelector('.plan-name-text').textContent;
    dialog.querySelector('.plan-dialog-price').textContent =
      formatPrice.format(Number(card.dataset.price)) + ' / mês';
    continueButton.dataset.plan = card.dataset.plan;
    continueButton.disabled = card.querySelector('.plan-subscribe').disabled;
  }
  async function refreshCatalog() {
    try {
      const response = await fetch('/api/catalog', { cache: 'no-store' });
      if (!response.ok) return;
      const { plans } = await response.json();
      const available = new Map(plans.map(plan => [plan.id, plan]));
      for (const card of cards) {
        const plan = available.get(card.dataset.plan);
        const button = card.querySelector('.plan-subscribe');
        const price = card.querySelector('.plan-price');
        button.disabled = !plan;
        if (!plan) {
          price.textContent = 'Indisponível';
          continue;
        }
        card.dataset.price = String(plan.cents / 100);
        card.querySelector('.plan-name-text').textContent = plan.name;
        const period = document.createElement('span');
        period.textContent = '/ mês';
        price.replaceChildren(formatPrice.format(plan.cents / 100) + ' ', period);
        const benefit = document.createElement('li');
        benefit.textContent = plan.benefits;
        card.querySelector('.plan-inclusions').replaceChildren(benefit);
      }
      if (dialog.open && selectedCard) showPlan(selectedCard);
    } catch {
      /* Em uma prévia estática, o catálogo inicial continua disponível. */
    }
  }
  void refreshCatalog();
  window.addEventListener('focus', refreshCatalog, { signal: listeners.signal });
  const canAnimate = Boolean(window.gsap && window.ScrollTrigger);
  if (canAnimate) gsap.registerPlugin(ScrollTrigger);

  function handleClick(event) {
    const card = event.target.closest('.plan-card');
    if (card && !event.target.closest('.plan-subscribe')) {
      selectPlan(card);
    }
    if (event.target.closest('.plan-subscribe')) {
      selectPlan(card);
      selectedCard = card;
      showPlan(card);
      dialog.showModal();
    }
    if (event.target.closest('.plan-dialog-close')) dialog.close();
  }
  section.addEventListener('click', context ? context.add(null, handleClick) : handleClick, {
    signal: listeners.signal
  });

  dialog.addEventListener(
    'click',
    event => {
      if (event.target === dialog) dialog.close();
    },
    { signal: listeners.signal }
  );

  if (canAnimate && context) {
    context.add(() => {
      const timeline = gsap.timeline({
        scrollTrigger: { trigger: section, start: 'top 85%', once: true },
        defaults: { duration: 0.8, ease: 'power3.out' }
      });
      timeline
        .from(section.querySelector('.street-services-head'), { yPercent: 105 })
        .from(section.querySelector('.plans-title-mask'), { '--line-scale': 0 }, 0)
        .from(cards, { y: 24, autoAlpha: 0, stagger: 0.1 }, 0.12)
        .from(section.querySelectorAll('.plan-name-text'), { yPercent: 105, stagger: 0.1 }, 0.18);
    });
  }
  addEventListener(
    'pagehide',
    event => {
      if (event.persisted) return;
      listeners.abort();
      context?.revert();
    },
    { signal: listeners.signal }
  );
})();
