// Interações dos formulários: visibilidade da senha e reflexo do vidro.
(() => {
  document.querySelectorAll('.password-toggle').forEach(toggle =>
    toggle.addEventListener('click', () => {
      const field = document.getElementById(toggle.getAttribute('aria-controls'));
      const visible = field.type === 'password';
      field.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
    })
  );
  const panel = document.querySelector('.glass-panel');
  const canReflect = matchMedia(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'
  );
  let frame = 0;
  let x = 0;
  let y = 0;
  const clear = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    panel.style.setProperty('--glass-light', '0');
  };
  panel.addEventListener('pointermove', event => {
    if (!canReflect.matches || event.pointerType !== 'mouse') return;
    const rect = panel.getBoundingClientRect();
    x = ((event.clientX - rect.left) / rect.width) * 100;
    y = ((event.clientY - rect.top) / rect.height) * 100;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      panel.style.setProperty('--glass-x', `${x}%`);
      panel.style.setProperty('--glass-y', `${y}%`);
      panel.style.setProperty('--glass-light', '.045');
      frame = 0;
    });
  });
  panel.addEventListener('pointerleave', clear);
  canReflect.addEventListener('change', clear);
})();

// Exibe a mensagem próxima do campo e comunica o erro a leitores de tela.
function showFieldError(field, message = '') {
  const error = document.getElementById(field.id + '-error');
  error.textContent = message;
  error.hidden = !message;
  field.setAttribute('aria-invalid', String(Boolean(message)));
}

function selectedPlanQuery() {
  const plan = new URLSearchParams(location.search).get('plano');
  return plan ? '?' + new URLSearchParams({ plano: plan }) : '';
}

const planQuery = selectedPlanQuery();
if (planQuery) {
  const link = document.querySelector('.signup-link');
  if (link) link.href += planQuery;
}
