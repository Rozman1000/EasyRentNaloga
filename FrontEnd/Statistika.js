
const StatsEngine = (() => {


  function computeRanking(properties) {
    return [...properties]
      .map(p => {
        const gostje = parseInt(p.Prijavljene_ekipe) || 0;
        const maxGostje = parseInt(p.Max_ekip) || 1;
        return {
          id: p.ID_Turnir,
          ime: p.Ime_turnirja,
          tip: p.Naslov_igre || 'Nepremičnina',
          lokacija: p.Lokacija,
          gostje,
          maxGostje,
          zasedenostPct: Math.min(100, Math.round((gostje / maxGostje) * 100)),
          cena: p.Nagradni_sklad,
        };
      })
      .sort((a, b) => b.gostje - a.gostje)
      .slice(0, 10);
  }

  /**
   * renderRankingList(containerId, ranked)
   * Izriše rang lestvico kot vodoravne stolpce (najbolj priljubljene na vrhu).
   */
  function renderRankingList(containerId, ranked) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!ranked.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon"></div><div class="empty-text">Še ni dovolj podatkov</div><div class="empty-sub">Statistika se izračuna, ko bodo prve rezervacije oddane.</div></div>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];

    el.innerHTML = ranked.map((r, i) => `
      <div class="lb-row" style="grid-template-columns:50px 1fr 140px; ${i === 0 ? 'background:var(--bg-elevated)' : ''}">
        <div>${i < 3 ? medals[i] : `<span style="font-family:'DM Mono',monospace;color:var(--text-muted)">${i + 1}</span>`}</div>
        <div>
          <div style="font-weight:600;font-size:0.92rem">${r.ime}</div>
          <div style="font-size:0.75rem;color:var(--text-muted)">${r.tip} · ${r.lokacija}</div>
          <div class="bar-track" style="margin-top:0.4rem"><div class="bar-fill" style="width:${r.zasedenostPct}%"></div></div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:var(--accent-cyan)">${r.gostje}/${r.maxGostje} gostov</div>
          <div style="font-size:0.75rem;color:var(--text-secondary)">${r.cena} € / noč</div>
        </div>
      </div>
    `).join('');
  }

  return { computeRanking, renderRankingList };
})();