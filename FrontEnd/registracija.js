

function doRegister() {
  // Validacija — vrne false če je kaj narobe
  const formaJePravilna = validiraj();
  if (!formaJePravilna) return;

  // Pridobi vrednosti
  const gamerTag = document.getElementById("preveriGamerTag").value.trim();
  const ePosta   = document.getElementById("preveriEPosta").value.trim();
  const geslo    = document.getElementById("preveriGeslo").value.trim();

  podatkiNaServerRegister(gamerTag, ePosta, geslo);
}


function podatkiNaServerRegister(gamerTag, ePosta, geslo) {
  const podatki = {
    Username: gamerTag,
    Email:    ePosta,
    Geslo:    geslo
  };

  fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(podatki)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      // Registracija uspešna — zapri modal/formo in obvesti uporabnika
      alert("Registracija uspešna! Sedaj se lahko prijaviš.");
      // Če smo v modalu (index.html), preklopi na login zavihek
      const registerForm = document.getElementById("registerForm");
      const loginForm    = document.getElementById("loginForm");
      if (registerForm && loginForm) {
        registerForm.style.display = "none";
        loginForm.style.display    = "block";
        const tabs = document.querySelectorAll(".modal-tab");
        if (tabs.length >= 2) {
          tabs[0].classList.add("active");
          tabs[1].classList.remove("active");
        }
      }
      // Če smo na samostojni registracija.html strani, preusmeri
      if (window.location.pathname.includes("registracija.html")) {
        window.location.href = "prijava.html";
      }
    } else {
      // Prikaži napako od serverja
      const nGamerTag = document.getElementById("napakaGamerTag");
      if (nGamerTag) {
        nGamerTag.innerHTML = data.error || "Napaka pri registraciji.";
        nGamerTag.style.display = "block";
      } else {
        alert(data.error || "Napaka pri registraciji.");
      }
    }
  })
  .catch(err => {
    console.error("Napaka pri registraciji:", err);
    alert("Napaka pri povezavi s strežnikom.");
  });
}

// Validacija — preverja vnosna polja, vrne true/false
function validiraj() {
  let formaJePravilna = true;

  const gamerTag = document.getElementById("preveriGamerTag").value.trim();
  const ePosta   = document.getElementById("preveriEPosta").value.trim();
  const geslo    = document.getElementById("preveriGeslo").value.trim();

  const nGamerTag = document.getElementById("napakaGamerTag");
  const nEPosta   = document.getElementById("napakaEPosta");
  const nGesla    = document.getElementById("napakaGesla");

  nGamerTag.style.display = "none";
  nEPosta.style.display   = "none";
  nGesla.style.display    = "none";

  const maxLenGamerTag = 16;

  if (gamerTag === "" || gamerTag.length > maxLenGamerTag) {
    nGamerTag.innerHTML = gamerTag === ""
      ? "Uporabniško ime ne sme biti prazno."
      : `Uporabniško ime ne more biti daljše od ${maxLenGamerTag} znakov.`;
    nGamerTag.style.display = "block";
    formaJePravilna = false;
  }

  if (!jeVeljavnaEPosta(ePosta)) {
    nEPosta.innerHTML     = "E-Postni naslov je neveljaven.";
    nEPosta.style.display = "block";
    formaJePravilna = false;
  }

  const minLenGeslo = 8;
  const minDolzina  = geslo.length >= minLenGeslo;
  const pattern1    = /[0-9]/;
  const pattern2    = /[!@#$%^&*(),.?":{}|<>]/;
  const test1       = pattern1.test(geslo);
  const test2       = pattern2.test(geslo);

  if (!(minDolzina && test1 && test2)) {
    let besediloPGes = "Napake:";
    if (!minDolzina) besediloPGes += " Geslo mora imeti vsaj 8 znakov.";
    if (!test1)      besediloPGes += " Geslo mora vsebovati števke.";
    if (!test2)      besediloPGes += " Geslo mora vsebovati posebne znake.";
    nGesla.innerHTML     = besediloPGes;
    nGesla.style.display = "block";
    formaJePravilna = false;
  }

  return formaJePravilna;
}

function jeVeljavnaEPosta(ePosta) {
  const vzorec = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return vzorec.test(ePosta);
}