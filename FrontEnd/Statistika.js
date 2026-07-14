/**
 * statistika.js — Easy Rent
 *
 * OPOMBA ZA PREGLED: to je popolnoma nova datoteka, ki nadomesti prejšnji
 * bracket.js. Prejšnja datoteka (607 vrstic) je generirala in vodila
 * single-elimination turnirski bracket (pari, runde, napredovanje
 * zmagovalcev, shranjevanje v localStorage). Ta logika za najem nepremičnin
 * nima smisla, zato je bila v celoti odstranjena.
 *
 * Namesto tega ta datoteka izračuna in izriše preprosto RANG LESTVICO
 * nepremičnin — katere so bile največkrat rezervirane in katere imajo
 * najboljše ocene ("najbolj uspešne").
 *
 * FUNKCIONALNOSTI:
 *  - loadStats()               → naloži podatke o nepremičninah iz API-ja
 *  - renderTopRentedChart(list) → izriše lestvico "Največ rezervacij"
 *  - renderTopRatedChart(list)  → izriše lestvico "Najbolje ocenjene"
 *
 * PODATKI:
 *  Statistika trenutno temelji na podatkih, ki jih že vrača
 *  GET /api/nepremicnine (Trenutno_gostov kot približek priljubljenosti).
 *  Ko bo na strežniku na voljo namenski endpoint GET /api/statistika/top
 *  (glej server.js), ga uporabi namesto tega.
 */

const StatsEngine = (() => {

  /**
   * computeRanking(properties)
   * Sortira seznam nepremičnin po številu trenutnih gostov (priljubljenost)
   * in vrne top 10 z izračunanim odstotkom zasedenosti.
   */
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
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">Še ni dovolj podatkov</div><div class="empty-sub">Statistika se izračuna, ko bodo prve rezervacije oddane.</div></div>';
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