// Comunicação com o Express. A sessão usa um cookie HttpOnly enviado pelo navegador.
(() => {
  let data;
  async function request(path, method = 'GET', body) {
    const panelRole = document.documentElement.dataset.panelRole;
    let response;
    try {
      response = await fetch('/api' + path, {
        method,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'guren',
          ...(panelRole ? { 'X-Panel-Role': panelRole } : {}),
          ...(panelRole && data?.me?.id ? { 'X-Panel-User': data.me.id } : {}),
          ...(window.gurenClock?.current() ? { 'X-Demo-Time': window.gurenClock.current() } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new Error(
        'Não foi possível acessar o servidor. Abra o site pelo endereço http://127.0.0.1:3000.'
      );
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (panelRole && (response.status === 401 || error.code === 'PANEL_SESSION_CHANGED')) {
        location.replace('/login/login/login.html');
      }
      if (error.message) throw new Error(error.message);
      throw new Error(
        'Esta página não está conectada à API. Abra http://127.0.0.1:3000/login/login/login.html.'
      );
    }
    return response.status === 204 ? null : response.json();
  }
  async function load() {
    data = await request('/panel');
    return data;
  }
  function showError(error) {
    let message = document.querySelector('[data-api-error]');
    if (!message) {
      message = document.createElement('p');
      message.dataset.apiError = '';
      message.setAttribute('role', 'alert');
      document.querySelector('main, .login-stage, body').prepend(message);
    }
    message.textContent = error.message;
  }
  function renderTerms(data) {
    const view = document.getElementById('view-termos');
    if (!view || !data.terms.length) return;
    const holder = document.createElement('div');
    holder.className = 'dash-card section-card';
    holder.dataset.apiTerms = '';
    view.querySelector('[data-api-terms]')?.remove();
    for (const term of data.terms) {
      const title = document.createElement('h2');
      title.textContent = term.title + ' · versão ' + term.version;
      const content = document.createElement('p');
      content.textContent = term.content;
      content.style.whiteSpace = 'pre-wrap';
      holder.append(title, content);
      if (data.me.role === 'cliente') {
        const accepted = data.acceptances.some(
          item => item.termId === term.id && item.version === term.version
        );
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.textContent = accepted ? 'Termo aceito' : 'Li e aceito este termo';
        button.disabled = accepted;
        button.addEventListener('click', async () => {
          try {
            await request('/terms/' + term.id + '/accept', 'POST', {
              version: term.version,
              accepted: true
            });
            renderTerms(await load());
          } catch (error) {
            showError(error);
          }
        });
        holder.append(button);
      }
    }
    view.append(holder);
  }
  window.gurenApi = {
    request,
    load,
    showError,
    renderTerms,
    get data() {
      return data;
    }
  };
})();
