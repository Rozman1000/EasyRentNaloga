function doLogin() {
    const emailEl = document.getElementById("loginUser");
    const gesloEl = document.getElementById("loginPass");

    if (!emailEl || !gesloEl) {
        console.error("login.js: Ne najdem elementov loginUser ali loginPass na tej strani.");
        return;
    }

    const email = emailEl.value.trim();
    const geslo = gesloEl.value.trim();

    // Počisti prejšnje napake
    prikaziLoginNapako("");

    if (!email || !geslo) {
        prikaziLoginNapako("Prosim vnesi email in geslo.");
        return;
    }

    // Vizualni feedback — gumb pokaže da se procesira
    const gumb = document.querySelector("#loginForm .form-submit");
    if (gumb) {
        gumb.textContent = "Prijavljam...";
        gumb.disabled    = true;
    }

    podatkiNaServerLogin(email, geslo, gumb);
}

function podatkiNaServerLogin(email, geslo, gumb) {
    fetch("/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email, password: geslo })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        // Ponastavi gumb
        if (gumb) {
            gumb.textContent = "PRIJAVA";
            gumb.disabled    = false;
        }

        if (data.success) {
            localStorage.setItem("token",    data.token);
            localStorage.setItem("vloga",    data.uporabnik.vloga);
            localStorage.setItem("username", data.uporabnik.username);
            posodobiUporabniskiVmesnik(data.uporabnik.username);
        } else {
            prikaziLoginNapako(data.error || "Napaka pri prijavi.");
        }
    })
    .catch(function() {
        if (gumb) {
            gumb.textContent = "PRIJAVA";
            gumb.disabled    = false;
        }
        prikaziLoginNapako("Napaka pri povezavi s strežnikom. Ali strežnik deluje?");
    });
}

function posodobiUporabniskiVmesnik(username) {
    // Zapri modal
    var modal = document.getElementById("authModal");
    if (modal) modal.style.display = "none";

    // Zamenjaj Prijava/Registracija z avatarjem
    var authButtons = document.getElementById("authButtons");
    var userMenu    = document.getElementById("userMenu");
    var userAvatar  = document.getElementById("userAvatar");

    if (authButtons) authButtons.style.display = "none";
    if (userMenu)    userMenu.style.display     = "flex";
    if (userAvatar)  userAvatar.textContent      = username.substring(0, 2).toUpperCase();

    // Na prijava.html preusmeri na domačo stran
    if (window.location.pathname.indexOf("prijava.html") !== -1) {
        window.location.href = "index.html";
        return;
    }

    prikaziToast("Dobrodošel, " + username + "! ");
}

function prikaziLoginNapako(sporocilo) {
    var napaka = document.getElementById("loginNapaka");
    if (napaka) {
        napaka.textContent   = sporocilo;
        napaka.style.display = sporocilo ? "block" : "none";
    } else if (sporocilo) {
        alert(sporocilo);
    }
}

function prikaziToast(sporocilo) {
    var container = document.getElementById("toastContainer");
    if (!container) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<div>" + sporocilo + "</div>";
    container.appendChild(el);
    setTimeout(function() { el.remove(); }, 3500);
}// login.js — prijava uporabnika z JWT tokenom

function doLogin() {
    const emailEl = document.getElementById("loginUser");
    const gesloEl = document.getElementById("loginPass");

    if (!emailEl || !gesloEl) {
        console.error("login.js: Ne najdem elementov loginUser ali loginPass na tej strani.");
        return;
    }

    const email = emailEl.value.trim();
    const geslo = gesloEl.value.trim();

    // Počisti prejšnje napake
    prikaziLoginNapako("");

    if (!email || !geslo) {
        prikaziLoginNapako("Prosim vnesi email in geslo.");
        return;
    }

    // Vizualni feedback — gumb pokaže da se procesira
    const gumb = document.querySelector("#loginForm .form-submit");
    if (gumb) {
        gumb.textContent = "Prijavljam...";
        gumb.disabled    = true;
    }

    podatkiNaServerLogin(email, geslo, gumb);
}

function podatkiNaServerLogin(email, geslo, gumb) {
    fetch("/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email, password: geslo })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        // Ponastavi gumb
        if (gumb) {
            gumb.textContent = "PRIJAVA";
            gumb.disabled    = false;
        }

        if (data.success) {
            localStorage.setItem("token",    data.token);
            localStorage.setItem("vloga",    data.uporabnik.vloga);
            localStorage.setItem("username", data.uporabnik.username);
            posodobiUporabniskiVmesnik(data.uporabnik.username);
        } else {
            prikaziLoginNapako(data.error || "Napaka pri prijavi.");
        }
    })
    .catch(function() {
        if (gumb) {
            gumb.textContent = "PRIJAVA";
            gumb.disabled    = false;
        }
        prikaziLoginNapako("Napaka pri povezavi s strežnikom. Ali strežnik deluje?");
    });
}

function posodobiUporabniskiVmesnik(username) {
    // Zapri modal
    var modal = document.getElementById("authModal");
    if (modal) modal.style.display = "none";

    // Zamenjaj Prijava/Registracija z avatarjem
    var authButtons = document.getElementById("authButtons");
    var userMenu    = document.getElementById("userMenu");
    var userAvatar  = document.getElementById("userAvatar");

    if (authButtons) authButtons.style.display = "none";
    if (userMenu)    userMenu.style.display     = "flex";
    if (userAvatar)  userAvatar.textContent      = username.substring(0, 2).toUpperCase();

    // Na prijava.html preusmeri na domačo stran
    if (window.location.pathname.indexOf("prijava.html") !== -1) {
        window.location.href = "index.html";
        return;
    }

    prikaziToast("Dobrodošel, " + username + "! ");
}

function prikaziLoginNapako(sporocilo) {
    var napaka = document.getElementById("loginNapaka");
    if (napaka) {
        napaka.textContent   = sporocilo;
        napaka.style.display = sporocilo ? "block" : "none";
    } else if (sporocilo) {
        alert(sporocilo);
    }
}

function prikaziToast(sporocilo) {
    var container = document.getElementById("toastContainer");
    if (!container) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<div>" + sporocilo + "</div>";
    container.appendChild(el);
    setTimeout(function() { el.remove(); }, 3500);
}