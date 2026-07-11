/* App-navigatie + opstart. */
const App = (() => {
  let current = 'reunion';

  async function refreshCount() {
    const n = await Store.count();
    document.getElementById('peopleCount').textContent = n;
  }

  function show(screen) {
    if (screen === current) return;
    if (current === 'reunion') Reunion.onLeave();
    current = screen;

    document.querySelectorAll('.screen').forEach(s =>
      s.classList.toggle('is-active', s.id === 'screen-' + screen));
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('is-active', t.dataset.screen === screen));

    if (screen === 'reunion') Reunion.onEnter();
    if (screen === 'setup') Setup.refreshRoster();
  }

  function init() {
    Setup.init();
    Reunion.init();
    Backup.init();
    document.querySelectorAll('.tab').forEach(t =>
      t.addEventListener('click', () => show(t.dataset.screen)));
    refreshCount();
    Reunion.onEnter();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW niet geregistreerd', e));
    }
  }

  return { init, show, refreshCount };
})();

window.addEventListener('DOMContentLoaded', App.init);
