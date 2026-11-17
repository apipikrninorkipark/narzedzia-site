import { database } from './database.js';

const $ = id => document.getElementById(id);
const apiUrl = `${database.supabaseUrl}/functions/v1/workspace-api`;
let workspaceToken = sessionStorage.getItem('workspace-token');
let administrator = null;

function lockWorkspace() {
  workspaceToken = null;
  sessionStorage.removeItem('workspace-token');
  $('workspace').hidden = true;
  $('access-screen').hidden = false;
  $('project-list').replaceChildren();
}

async function api(action, values = {}, admin = false) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { Authorization: `Bearer ${administrator?.access_token ?? ''}` }
        : workspaceToken ? { Authorization: `Bearer ${workspaceToken}` } : {}),
    },
    body: JSON.stringify({ action, ...values }),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Nie można połączyć się z usługą. Sprawdź wdrożenie Supabase.'); }
  if (!response.ok) {
    if (response.status === 401 && !admin && action !== 'login') lockWorkspace();
    throw new Error(result.error || 'Nie udało się wykonać operacji.');
  }
  return result;
}

export async function saveProject(name, dimensions) {
  return (await api('save', { name, dimensions })).project;
}
export async function loadProjects() {
  return (await api('list')).projects;
}

async function refreshProjects() {
  const projects = await loadProjects();
  const items = projects.map(project => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = project.name;
    button.addEventListener('click', () => {
      const d = project.dimensions;
      document.querySelector(`[data-unit="${d.unit}"]`).click();
      document.querySelector(`[data-mode="${d.mode}"]`).click();
      for (const key of ['width', 'slat', 'count', 'target']) {
        if (d[key] != null) $(key).value = String(d[key]);
      }
      $('project-name').value = project.name;
      $('width').dispatchEvent(new Event('input', { bubbles: true }));
      $('kalkulator').scrollIntoView({ behavior: 'smooth' });
    });
    item.append(button);
    return item;
  });
  $('project-list').replaceChildren(...items);
  $('projects-empty').hidden = projects.length > 0;
}

$('pin-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('pin-submit');
  button.disabled = true;
  $('access-message').textContent = '';
  try {
    const result = await api('login', { pin: $('workspace-pin').value });
    workspaceToken = result.token;
    sessionStorage.setItem('workspace-token', workspaceToken);
    $('pin-form').reset();
    $('access-screen').hidden = true;
    $('workspace').hidden = false;
    try { await refreshProjects(); }
    catch (error) { $('projects-message').textContent = error.message; }
  } catch (error) { $('access-message').textContent = error.message; }
  finally { button.disabled = false; }
});

$('workspace-logout').addEventListener('click', async () => {
  try { await api('logout'); }
  catch (error) { $('access-message').textContent = error.message; }
  finally { lockWorkspace(); }
});

$('save-project-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('save-project').disabled = true;
  try {
    const number = id => Number($(id).value.trim().replace(',', '.'));
    const unit = document.querySelector('[data-unit].selected').dataset.unit;
    const mode = document.querySelector('[data-mode].selected').dataset.mode;
    const dimensions = { unit, mode, width: number('width'), slat: number('slat'),
      count: number('count'), target: number('target') };
    // Reuse the calculator's validation before persisting the input.
    window.calculateLayout(dimensions.width, dimensions.slat, dimensions.count, dimensions.target, mode);
    await saveProject($('project-name').value, dimensions);
    await refreshProjects();
    $('projects-message').textContent = 'Projekt zapisany we wspólnej przestrzeni.';
  } catch (error) { $('projects-message').textContent = error.message; }
  finally { $('save-project').disabled = false; }
});
$('refresh-projects').addEventListener('click', async () => {
  try { await refreshProjects(); $('projects-message').textContent = ''; }
  catch (error) { $('projects-message').textContent = error.message; }
});

for (const button of document.querySelectorAll('[data-open-settings]')) {
  button.addEventListener('click', () => $('settings-dialog').showModal());
}
$('close-settings').addEventListener('click', () => $('settings-dialog').close());

async function clearAdmin() {
  administrator = null;
  $('admin-login-form').hidden = false;
  $('pin-settings-form').hidden = true;
  $('admin-login-form').reset();
  await database.auth.signOut({ scope: 'local' });
}
$('settings-dialog').addEventListener('close', () => { void clearAdmin(); });
$('admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('admin-submit').disabled = true;
  $('settings-message').textContent = '';
  try {
    const { data, error } = await database.auth.signInWithPassword({
      email: $('admin-email').value.trim(), password: $('admin-password').value,
    });
    if (error) throw new Error('Nie udało się zalogować. Sprawdź e-mail i hasło.');
    administrator = data.session;
    await api('settings', {}, true);
    $('admin-login-form').reset();
    $('admin-login-form').hidden = true;
    $('pin-settings-form').hidden = false;
  } catch (error) {
    await clearAdmin();
    $('settings-message').textContent = error.message;
  } finally { $('admin-submit').disabled = false; }
});
$('pin-settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('new-pin').value !== $('repeat-pin').value) {
    $('settings-message').textContent = 'Wpisane PIN-y różnią się.';
    return;
  }
  $('change-pin').disabled = true;
  try {
    await api('change-pin', { pin: $('new-pin').value }, true);
    $('pin-settings-form').reset();
    lockWorkspace();
    $('settings-message').textContent = 'PIN zapisany. Wszystkie sesje robocze zostały wylogowane.';
  } catch (error) { $('settings-message').textContent = error.message; }
  finally { $('change-pin').disabled = false; }
});

database.auth.onAuthStateChange((_event, session) => { administrator = session; });
if (workspaceToken) {
  try {
    await api('session');
    $('access-screen').hidden = true;
    $('workspace').hidden = false;
    await refreshProjects();
  } catch (error) {
    lockWorkspace();
    $('access-message').textContent = error.message;
  }
}
