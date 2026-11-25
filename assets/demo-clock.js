// Relógio compartilhado entre Cliente e Barbeiro para testar o ciclo de um agendamento.
(() => {
  const key = 'guren-demo-now';
  const saved = localStorage.getItem(key);
  let simulated = saved && Number.isFinite(Date.parse(saved)) ? saved : null;

  const now = () => (simulated ? new Date(simulated) : new Date());
  const current = () => simulated;
  const section = document.querySelector('#view-agendamentos, #view-agenda');
  const control = document.createElement('form');
  control.className = 'demo-clock';
  control.innerHTML = `
    <label>Horário de teste <input type="datetime-local" required></label>
    <button type="submit">Simular</button>
    <button type="button" data-reset-clock>Usar horário real</button>
    <span role="status"></span>
  `;
  section?.insertBefore(control, section.querySelector('.detail-grid, .two-col, .section-card'));
  const input = control.querySelector('input');
  const status = control.querySelector('[role="status"]');

  function update() {
    const date = now();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    input.value = local.toISOString().slice(0, 16);
    status.textContent = simulated
      ? 'Simulando ' + date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Horário real';
    window.dispatchEvent(new Event('guren-clock-change'));
  }
  control.addEventListener('submit', event => {
    event.preventDefault();
    const date = new Date(input.value);
    if (!Number.isFinite(date.getTime())) return;
    simulated = date.toISOString();
    localStorage.setItem(key, simulated);
    update();
  });
  control.querySelector('[data-reset-clock]').addEventListener('click', () => {
    simulated = null;
    localStorage.removeItem(key);
    update();
  });
  window.addEventListener('storage', event => {
    if (event.key !== key) return;
    simulated = event.newValue;
    update();
  });
  window.gurenClock = { now, current };
  update();
})();
