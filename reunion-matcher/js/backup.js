/* Back-up en herstel: alle klasgenoten als één bestand opslaan/terugladen.
   Zo gaan de foto's niet verloren als de telefoon leeg raakt of de app
   opnieuw geïnstalleerd wordt — óók bruikbaar op een ander toestel. */
const Backup = (() => {

  async function exportData() {
    const people = await Store.all();
    if (!people.length) {
      alert('Nothing to back up yet — add some classmates first.');
      return;
    }
    const data = {
      app: 'crest76', version: 1, exportedAt: new Date().toISOString(),
      people: people.map(p => ({ name: p.name, thumb: p.thumb, descriptor: p.descriptor })),
    };
    const json = JSON.stringify(data);
    const fname = `crest76-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([json], { type: 'application/json' });

    // Op de telefoon: deel-menu (mailen / Bestanden / Drive). Anders: download.
    try {
      const file = new File([blob], fname, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "CREST '76 backup" });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // gebruiker annuleerde
      /* anders: val terug op download */
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function importData(file) {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch (e) { alert('That file could not be read as a backup.'); return; }

    const people = Array.isArray(data) ? data : (data && data.people);
    if (!Array.isArray(people) || !people.length || !people[0] || !people[0].descriptor) {
      alert("That doesn't look like a CREST '76 backup file.");
      return;
    }
    if (!confirm(`Restore ${people.length} classmates from this backup?\nThis replaces what's currently in the app.`)) return;

    await Store.clear();
    await Store.addMany(people.map(p => ({ name: p.name, thumb: p.thumb, descriptor: p.descriptor })));
    await Setup.refreshRoster();
    App.refreshCount();
    alert(`Restored ${people.length} classmates. ✅`);
  }

  function init() {
    document.getElementById('btn-backup').addEventListener('click', () =>
      exportData().catch(e => { console.error(e); alert('Backup failed.'); }));
    document.getElementById('restore-file').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) importData(f).catch(err => { console.error(err); alert('Restore failed.'); })
        .finally(() => { e.target.value = ''; });
    });
  }

  return { init, exportData, importData };
})();
