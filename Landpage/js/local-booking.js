(() => {
  const panels = {
    cliente: '/User/index.html#agendamentos',
    barbeiro: '/Barbeiro/index.html#agenda',
    administrador: '/Administrador/index.html#agenda'
  };
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-login-button]');
    if (!button || button.disabled) return;
    event.preventDefault();
    button.disabled = true;
    const plan = button.dataset.plan;
    const query = plan ? '?' + new URLSearchParams({ plano: plan }) : '';
    const login = '/login/login/login.html' + query;
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const user = response.ok ? await response.json() : null;
      const destination =
        plan && user?.role === 'cliente'
          ? '/User/index.html' + query + '#planos'
          : panels[user?.role] || login;
      window.location.assign(destination);
    } catch {
      window.location.assign(login);
    } finally {
      button.disabled = false;
    }
  });
})();
