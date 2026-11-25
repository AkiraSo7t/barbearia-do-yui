(() => {
  const root = document.documentElement;
  const role = root.dataset.panelRole;
  const storageKey = 'guren-panel-mode:' + role;

  function brightness(color) {
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return NaN;
    const [red, green, blue] = color
      .slice(1)
      .match(/../g)
      .map(channel => parseInt(channel, 16));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  function readMode() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'dark' || saved === 'light') return saved;

      // Converte a paleta antiga para o modo claro ou escuro mais próximo.
      const legacy = JSON.parse(
        localStorage.getItem('guren-panel-colors:' + role) ??
          localStorage.getItem('guren-panel-colors')
      );
      return brightness(legacy?.surface) < brightness(legacy?.text) ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function applyMode(mode) {
    root.toggleAttribute('data-light-panel-theme', mode === 'light');
  }

  let mode = readMode();
  applyMode(mode);

  const editor = document.querySelector('[data-panel-color-editor]');
  if (!editor) return;
  editor.innerHTML = `
    <section class="card dash-card panel-appearance-card" aria-labelledby="panel-appearance-title">
      <div class="card-head"><h2 id="panel-appearance-title">Aparência</h2></div>
      <fieldset class="panel-mode-options">
        <legend>Modo do painel</legend>
        <label><input type="radio" name="panel-mode" value="dark"> Modo escuro</label>
        <label><input type="radio" name="panel-mode" value="light"> Modo claro</label>
      </fieldset>
      <p data-panel-mode-status role="status"></p>
    </section>
  `;
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'button';
  logout.textContent = 'Sair da conta';
  logout.addEventListener('click', async () => {
    try {
      await gurenApi.request('/auth/logout', 'POST');
      location.assign('/login/login/login.html');
    } catch (error) {
      gurenApi.showError(error);
    }
  });
  editor.append(logout);
  const options = editor.querySelectorAll('input[name="panel-mode"]');
  const status = editor.querySelector('[data-panel-mode-status]');

  function updateSelection() {
    for (const option of options) option.checked = option.value === mode;
  }

  for (const option of options) {
    option.addEventListener('change', () => {
      if (!option.checked) return;
      try {
        localStorage.setItem(storageKey, option.value);
      } catch {
        updateSelection();
        status.textContent = 'O navegador não conseguiu salvar sua preferência.';
        return;
      }
      mode = option.value;
      applyMode(mode);
      status.textContent = 'Preferência salva para este perfil.';
    });
  }

  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    mode = readMode();
    applyMode(mode);
    updateSelection();
    status.textContent = '';
  });

  updateSelection();
})();
