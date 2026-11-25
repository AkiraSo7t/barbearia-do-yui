// Envia os dados de acesso e abre o painel correspondente ao perfil da conta.
(() => {
  const form = document.getElementById('login-form');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const remember = document.getElementById('remember');
  const status = document.querySelector('.form-status');
  const storageKey = 'login-remembered-username';
  const announce = message => {
    status.textContent = message;
    status.hidden = false;
  };
  // O login precisa usar a mesma origem da API para receber o cookie de sessão.
  async function checkServer() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (response.ok && (await response.json()).status === 'ok') return;
    } catch {
      /* A página pode ter sido aberta por outro servidor ou como arquivo. */
    }

    const correctAddress = 'http://127.0.0.1:3000/login/login/login.html';
    if (location.href === correctAddress) {
      announce(
        'Não foi possível conectar ao servidor. Verifique se o MongoDB e o Express estão em execução.'
      );
      return;
    }
    try {
      await fetch('http://127.0.0.1:3000/api/health', { mode: 'no-cors', cache: 'no-store' });
      location.replace(correctAddress);
    } catch {
      announce(
        'Abra o site pelo endereço http://127.0.0.1:3000 após iniciar o servidor com npm start.'
      );
    }
  }
  checkServer();
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      username.value = saved;
      remember.checked = true;
    }
  } catch {
    /* O armazenamento pode estar indisponível em arquivos locais. */
  }

  [username, password].forEach(field =>
    field.addEventListener('input', () => {
      showFieldError(field);
      status.hidden = true;
    })
  );
  remember.addEventListener('change', () => {
    if (!remember.checked) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* Opcional. */
      }
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const missingUser = !username.value.trim();
    const missingPassword = !password.value;
    showFieldError(username, missingUser ? 'Digite seu CPF, nome completo ou usuário.' : '');
    showFieldError(password, missingPassword ? 'Digite sua senha.' : '');
    if (missingUser || missingPassword) {
      (missingUser ? username : password).focus();
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const identifier = username.value.trim();
      const account = await gurenApi.request('/auth/login', 'POST', {
        username: /^[\d.\-\s]+$/.test(identifier) ? identifier.replace(/\D/g, '') : identifier,
        password: password.value,
        remember: remember.checked
      });
      try {
        if (remember.checked) localStorage.setItem(storageKey, identifier);
        else localStorage.removeItem(storageKey);
      } catch {
        /* O nome lembrado é opcional. */
      }
      const folders = { cliente: 'User', barbeiro: 'Barbeiro', administrador: 'Administrador' };
      const query = account.role === 'cliente' ? selectedPlanQuery() : '';
      window.location.assign(
        '/' + folders[account.role] + '/index.html' + (query ? query + '#planos' : '')
      );
    } catch (error) {
      announce(error.message);
    } finally {
      button.disabled = false;
    }
  });
})();
