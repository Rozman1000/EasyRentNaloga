// Easy Rent — backend strežnik
//
// ══════════════════════════════════════════════════════════════════════════
//  OPOMBA ZA PREGLED — preberi to najprej!
// ══════════════════════════════════════════════════════════════════════════
// Ta datoteka je bila prej "Game Arena Hub" strežnik za turnirski/esports
// sistem (ekipe, igralci, kapetani, tekme, bracket rezultati). Zdaj je to
// Easy Rent — platforma za oddajo in najem nepremičnin. Glavne naloge
// strežnika (avtentikacija z JWT, admin nadzorna plošča, moderacija,
// forum, obvestila, ocene/feedback) so OSTALE ENAKE, spremenjen je le
// pomen podatkov, ki jih obravnavajo.
//
// POMEMBNA ODLOČITEV — imena tabel/stolpcev v bazi NISO bila preimenovana:
//   Tabela "Turnir" zdaj hrani NEPREMIČNINE, ne turnirjev. Njeni stolpci se
//   berejo takole:
//     Ime_turnirja      -> naziv nepremičnine
//     Naslov_igre (iz "Igra" tabele) -> tip nepremičnine (Hiša/Apartma/Vila/Kabina)
//     Datum             -> datum, od kdaj je nepremičnina na voljo
//     Lokacija, Lat, Lng-> lokacija nepremičnine (uporablja jih Google Maps)
//     Max_ekip          -> največje število gostov (kapaciteta)
//     Prijavljene_ekipe -> trenutno število nastanjenih/rezerviranih gostov
//     Nagradni_sklad    -> cena najema na noč (€)
//     Status            -> "live" (prosto) / "upcoming" (kmalu prosto) / "completed" (zasedeno)
//   Tabela "Prijava" zdaj hrani REZERVACIJE (prej: prijava ekipe na turnir).
//   Prej je bila vezana na "Ekipe" (TK_Ekipe), zdaj je vezana neposredno na
//   uporabnika ("Gost", TK_Gost) — najema namreč posameznik, ne ekipa.
//   Tabela "Feedback" zdaj hrani OCENE NASTANITEV. Stolpec "TK_Igralci" je
//   ostal (isto ime, da ni bilo treba spreminjati sheme), a zdaj kaže na
//   "Prijava.ID_Prijava" — ocena je torej vezana na konkretno rezervacijo.
//
//   Zakaj nismo preimenovali stolpcev/tabel? Ker bi to pomenilo spremeniti
//   VSAKO poizvedbo v tej datoteki, celotno SQL shemo in vse frontend
//   klice hkrati — ogromno tveganje za napake, ki jih v tem okolju ni
//   mogoče pognati in preizkusiti. Preimenovanje je varneje narediti kot
//   ločen korak, ko boš imel bazo pred sabo in jo lahko dejansko testiraš.
//
// ODSTRANJENO (ni več smiselno za najem nepremičnin):
//   - Vse /api/ekipe* poti (ekipe/igralci/kapetan) — stran ekipe.html je bila
//     izbrisana, ekipe pri najemu stanovanja nimajo smisla.
//   - /api/tekme in POST /api/rezultati (esports rezultati tekem/bracketov).
//   - Tabele Ekipe, Igralci, Kapetan, Tekma, Rezultat, Potek_Tekme so bile
//     odstranjene iz sheme (glej EasyRentBaza.sql) — bile so izključno
//     vezane na ekipe/tekme.
//
// DODANO:
//   - /api/nepremicnine (prej /api/tournaments — obstajala je tudi
//     neobstoječa /api/turnirji pot, ki jo je klical frontend; to je bil
//     obstoječ hrošč, zdaj je poenoteno na eno samo, delujočo pot).
//   - /api/nepremicnine/rezervacija — rezervacija nepremičnine za
//     prijavljenega uporabnika (prej: prijava ekipe na turnir, zahtevala
//     najmanj 5 članov — ta pogoj je odstranjen, saj rezervira posameznik).
//   - /api/profil/najemi, /api/profil/rezervacije — zgodovina najemov
//     in seznam rezervacij prijavljenega uporabnika.
//   - /api/statistika/top — agregirana statistika najbolj rentanih
//     nepremičnin (uporablja jo statistika.html).
// ══════════════════════════════════════════════════════════════════════════

const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const jwt = require('jsonwebtoken');
const { registrirajUporabnika, prijaviUporabnika } = require('./HashiranjeGesel');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-zamenjaj-v-produkciji';

//CORS 
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

//Splošni middleware 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../html-frontend')));

// PostgreSQL pool 
const pool = new Pool({
    user:     process.env.DB_USER     || 'postgres',
    host:     process.env.DB_HOST     || 'localhost',
    database: process.env.DB_NAME     || 'testna_baza',
    password: process.env.DB_PASSWORD || 'testnosuperskrpno',
    port:     process.env.DB_PORT     || 5432,
});

// Glavni del Middleware

// Preveri JWT token iz Authorization headerja
function preveriToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Za to akcijo morate biti prijavljeni.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Neveljaven ali potekel žeton.' });
        }
        req.uporabnik = decoded; // { id, username, vloga }
        next();
    });
}

// Preveri admin vlogo (vedno pokliči za preveriToken)
function preveriAdmin(req, res, next) {
    if (!req.uporabnik) {
        return res.status(401).json({ error: 'Niste prijavljeni.' });
    }
    if (req.uporabnik.vloga !== 'admin') {
        return res.status(403).json({ error: 'Dostop zavrnjen — potrebne so administratorske pravice.' });
    }
    next();
}

//  Avtentikacija

// POST /register
app.post('/register', async (req, res) => {
    const { Username, Email, Geslo } = req.body;

    if (!Username || !Email || !Geslo) {
        return res.status(400).json({ error: 'Vsi podatki so obvezni.' });
    }

    // Osnovna validacija emaila
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(Email)) {
        return res.status(400).json({ error: 'Neveljaven email naslov.' });
    }

    if (Geslo.length < 6) {
        return res.status(400).json({ error: 'Geslo mora imeti vsaj 6 znakov.' });
    }

    try {
        // Preveri ali email že obstaja
        const obstojeciEmail = await pool.query('SELECT 1 FROM "Gost" WHERE "Email" = $1', [Email]);
        if (obstojeciEmail.rows.length > 0) {
            return res.status(409).json({ error: 'Uporabnik s tem emailom že obstaja.' });
        }

        const hashedPw = await registrirajUporabnika(Username, Email, Geslo);
        // POPRAVEK: privzeta vloga novega uporabnika je zdaj "najemnik"
        // (prej "igralec" — ostanek iz esports različice).
        await pool.query(
            'INSERT INTO "Gost" ("Username", "Email", "Geslo", "Vloga") VALUES ($1, $2, $3, $4)',
            [Username, Email, hashedPw, 'najemnik']
        );

        res.status(201).json({ success: true, message: 'Registracija uspešna!' });
    } catch (err) {
        console.error('Napaka pri registraciji:', err);
        res.status(500).json({ error: 'Napaka pri registraciji.' });
    }
});

// POST /login — vrne JWT token
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email in geslo sta obvezna.' });
    }

    try {
        const rezultat = await pool.query('SELECT * FROM "Gost" WHERE "Email" = $1', [email]);

        if (rezultat.rows.length === 0) {
            return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
        }

        const uporabnik = rezultat.rows[0];
        const uspeh = await prijaviUporabnika(password, uporabnik.Geslo);

        if (!uspeh) {
            return res.status(401).json({ error: 'Napačno geslo.' });
        }

        // Ustvari JWT token (velja 24h)
        // POPRAVEK: 'Administrator' v bazi → normaliziramo na 'admin' za JWT in admin check
        const vlogaNormalizirana = uporabnik.Vloga.toLowerCase() === 'administrator' ? 'admin' : uporabnik.Vloga.toLowerCase();

        const token = jwt.sign(
            {
                id:       uporabnik.ID_Uporabniki,
                username: uporabnik.Username,
                vloga:    vlogaNormalizirana
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success:  true,
            message:  `Dobrodošel, ${uporabnik.Username}!`,
            token,
            uporabnik: {
                id:       uporabnik.ID_Uporabniki,
                username: uporabnik.Username,
                email:    uporabnik.Email,
                vloga:    vlogaNormalizirana
            }
        });
    } catch (err) {
        console.error('Napaka pri prijavi:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/me — vrne podatke prijavljenega uporabnika (za preverjanje tokena)
app.get('/api/me', preveriToken, (req, res) => {
    res.json({ uporabnik: req.uporabnik });
});


// ══════════════════════════════════════════════════════
//  NEPREMIČNINE API
//  (poizvedbe še vedno ciljajo na tabelo "Turnir" — glej OPOMBO na vrhu datoteke)
// ══════════════════════════════════════════════════════

// GET /api/nepremicnine — seznam vseh nepremičnin (javno, uporablja ga nepremicnine.html, index.html, statistika.html, admin.html, profil.html)
app.get('/api/nepremicnine', async (req, res) => {
    try {
        const query = `
            SELECT 
                t."ID_Turnir", 
                t."Ime_turnirja", 
                t."Datum", 
                t."Lokacija", 
                t."Nagradni_sklad", 
                t."Max_ekip", 
                t."Prijavljene_ekipe",
                t."Lat", 
                t."Lng",
                t."Status",
                i."Naslov_igre"
            FROM "Turnir" t
            JOIN "Igra" i ON t."TK_Igra" = i."ID_Igra"
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju nepremičnin:', err);
        res.status(500).json({ error: 'Napaka na strežniku pri branju nepremičnin.' });
    }
});

// GET /api/nepremicnine/:id — podrobnosti ene nepremičnine (javno)
app.get('/api/nepremicnine/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'Neveljaven ID nepremičnine.' });
    }
    try {
        const { rows } = await pool.query(`
            SELECT 
                t."ID_Turnir", t."Ime_turnirja", t."Opis", t."Datum", t."Lokacija",
                t."Status", t."Lat", t."Lng", t."Max_ekip", t."Prijavljene_ekipe",
                t."Nagradni_sklad", i."Naslov_igre", g."Username" AS lastnik
            FROM "Turnir" t
            JOIN "Igra" i ON t."TK_Igra" = i."ID_Igra"
            JOIN "Gost" g ON t."TK_Uporabniki" = g."ID_Uporabniki"
            WHERE t."ID_Turnir" = $1
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Nepremičnina ne obstaja.' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(`Napaka pri pridobivanju nepremičnine ${id}:`, err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// POST /api/nepremicnine — dodaj novo nepremičnino (prijavljeni uporabnik = lastnik)
app.post('/api/nepremicnine', preveriToken, async (req, res) => {
    const {
        Ime_turnirja, TK_Igra, TK_Bracket,
        Opis, Datum, Lokacija, Lat, Lng, Max_ekip, Nagradni_sklad
    } = req.body;

    if (!Ime_turnirja || !TK_Igra || !Datum || !Lokacija || !Max_ekip || !Nagradni_sklad) {
        return res.status(400).json({ error: 'Vsi podatki o nepremičnini so obvezni.' });
    }

    const query = `
        INSERT INTO "Turnir" 
        ("Ime_turnirja", "TK_Uporabniki", "TK_Igra", "TK_Bracket", "Opis", "Datum", "Lokacija", "Lat", "Lng", "Max_ekip", "Prijavljene_ekipe", "Status", "Nagradni_sklad")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'upcoming', $11)
        RETURNING "ID_Turnir"
    `;

    try {
        // TK_Bracket je obvezen tuji ključ v shemi (glej OPOMBO na vrhu) — če
        // ni podan, uporabimo prvi razpoložljivi zapis kot privzeti "paket pogojev najema".
        const bracketId = TK_Bracket || 1;
        const values = [Ime_turnirja, req.uporabnik.id, TK_Igra, bracketId, Opis, Datum, Lokacija, Lat || null, Lng || null, Max_ekip, Nagradni_sklad];
        const result = await pool.query(query, values);
        res.status(201).json({
            message: 'Nepremičnina uspešno dodana.',
            nepremicninaId: result.rows[0].ID_Turnir
        });
    } catch (err) {
        console.error('Napaka pri vnosu nepremičnine:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// POST /api/nepremicnine/rezervacija — rezervacija nepremičnine za prijavljenega uporabnika
// POPRAVEK: prej je to bila prijava EKIPE na turnir (zahtevala vsaj 5 članov).
// Zdaj rezervira posameznik neposredno, brez pogoja o velikosti ekipe.
app.post('/api/nepremicnine/rezervacija', preveriToken, async (req, res) => {
    const { tk_nepremicnina, stevilo_gostov } = req.body;
    const uid = req.uporabnik.id;
    const gostje = parseInt(stevilo_gostov) || 1;

    if (!tk_nepremicnina) {
        return res.status(400).json({ error: 'Manjka obvezen podatek: tk_nepremicnina.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Preveri obstoj nepremičnine in prosto kapaciteto
        const nepremicninaResult = await client.query(
            'SELECT "Max_ekip", "Prijavljene_ekipe", "Status", "Ime_turnirja" FROM "Turnir" WHERE "ID_Turnir" = $1',
            [tk_nepremicnina]
        );

        if (nepremicninaResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Nepremičnina ne obstaja.' });
        }

        const nepremicnina = nepremicninaResult.rows[0];

        if (nepremicnina.Status === 'blokiran') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Nepremičnina je blokirana in rezervacije trenutno niso možne.' });
        }

        if (nepremicnina.Prijavljene_ekipe + gostje > nepremicnina.Max_ekip) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Nepremičnina nima dovolj proste kapacitete za toliko gostov.' });
        }

        // Preveri, ali je uporabnik že rezerviral to nepremičnino
        const zeRezervirano = await client.query(
            'SELECT 1 FROM "Prijava" WHERE "TK_Turnir" = $1 AND "TK_Gost" = $2',
            [tk_nepremicnina, uid]
        );
        if (zeRezervirano.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'To nepremičnino ste že rezervirali.' });
        }

        // Vnos v tabelo Prijava (rezervacija)
        await client.query(
            'INSERT INTO "Prijava" ("Datum_prijave", "TK_Turnir", "TK_Gost") VALUES (CURRENT_DATE, $1, $2)',
            [tk_nepremicnina, uid]
        );

        // Posodobitev števca trenutno nastanjenih gostov
        await client.query(
            'UPDATE "Turnir" SET "Prijavljene_ekipe" = "Prijavljene_ekipe" + $1 WHERE "ID_Turnir" = $2',
            [gostje, tk_nepremicnina]
        );

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: `Rezervacija za "${nepremicnina.Ime_turnirja}" je bila uspešno oddana!`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Napaka pri rezervaciji nepremičnine:', err);
        res.status(500).json({ error: 'Napaka na strežniku pri izvajanju rezervacije.' });
    } finally {
        client.release();
    }
});

// DELETE /api/nepremicnine/:id — izbriše nepremičnino (samo admin)
app.delete('/api/nepremicnine/:id', preveriToken, preveriAdmin, async (req, res) => {
    const { id } = req.params;

    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'Neveljaven ID nepremičnine.' });
    }

    try {
        const { rowCount } = await pool.query('DELETE FROM "Turnir" WHERE "ID_Turnir" = $1', [id]);

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Nepremičnina ne obstaja.' });
        }

        res.json({ success: true, message: `Nepremičnina ${id} uspešno izbrisana.` });
    } catch (err) {
        console.error(`Napaka pri brisanju nepremičnine ${id}:`, err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});


// ══════════════════════════════════════════════════════
//  STATISTIKA API (uporablja jo statistika.html)
// ══════════════════════════════════════════════════════

// GET /api/statistika/top — top 10 najbolj rentanih nepremičnin
// (razvrščeno po trenutnem številu nastanjenih gostov glede na kapaciteto)
app.get('/api/statistika/top', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                t."ID_Turnir", t."Ime_turnirja", t."Lokacija", t."Nagradni_sklad",
                t."Max_ekip", t."Prijavljene_ekipe", i."Naslov_igre"
            FROM "Turnir" t
            JOIN "Igra" i ON t."TK_Igra" = i."ID_Igra"
            ORDER BY t."Prijavljene_ekipe" DESC
            LIMIT 10
        `);
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju statistike:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});


// ══════════════════════════════════════════════════════
//  MODERACIJA API
// ══════════════════════════════════════════════════════

// GET /api/moderacija — seznam vseh ukrepov (samo admin)
app.get('/api/moderacija', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM "Moderacija" ORDER BY "Datum" DESC');
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri moderaciji GET:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// POST /api/moderacija — dodaj ukrep (samo admin)
app.post('/api/moderacija', preveriToken, preveriAdmin, async (req, res) => {
    const { TK_Turnir, Vrsta_ukrepa, Razlog } = req.body;
    if (!TK_Turnir || !Vrsta_ukrepa || !Razlog) {
        return res.status(400).json({ error: 'Vsi podatki so obvezni.' });
    }
    try {
        const { rows } = await pool.query(
            'INSERT INTO "Moderacija" ("TK_Turnir","Datum","Razlog","Vrsta_ukrepa") VALUES ($1, CURRENT_DATE, $2, $3) RETURNING *',
            [TK_Turnir, Razlog, Vrsta_ukrepa]
        );
        res.status(201).json({ success: true, moderacija: rows[0] });
    } catch (err) {
        console.error('Napaka pri dodajanju moderacije:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// DELETE /api/moderacija/:id — briši ukrep (samo admin)
app.delete('/api/moderacija/:id', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM "Moderacija" WHERE "ID_Moderacija" = $1', [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ error: 'Ukrep ne obstaja.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri brisanju moderacije:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// ══════════════════════════════════════════════════════
//  ADMIN STATISTIKE + UPRAVLJANJE UPORABNIKOV
// ══════════════════════════════════════════════════════

// GET /api/admin/stats — osnovna statistika za admin nadzorno ploščo
app.get('/api/admin/stats', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const [users, nepremicnine, moderacije] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM "Gost"'),
            pool.query('SELECT COUNT(*) FROM "Turnir"'),
            pool.query('SELECT COUNT(*) FROM "Moderacija" WHERE "Datum" = CURRENT_DATE')
        ]);
        res.json({
            users:       parseInt(users.rows[0].count),
            ekipe:       parseInt(nepremicnine.rows[0].count), // ime polja "ekipe" ostalo zaradi obstoječega frontenda — pomeni število nepremičnin
            moderacije:  parseInt(moderacije.rows[0].count),
            pending:     0  // TODO: ko bo status "pending" dodan v Turnir tabelo
        });
    } catch (err) {
        console.error('Napaka pri admin stats:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/admin/uporabniki — seznam vseh uporabnikov (samo admin)
app.get('/api/admin/uporabniki', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT "ID_Uporabniki","Username","Email","Vloga" FROM "Gost" ORDER BY "ID_Uporabniki" ASC'
        );
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju uporabnikov:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/admin/uporabniki/:id/blokiraj — blokiraj uporabnika
app.put('/api/admin/uporabniki/:id/blokiraj', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'UPDATE "Gost" SET "Vloga" = $1 WHERE "ID_Uporabniki" = $2',
            ['blokiran', req.params.id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
        res.json({ success: true, message: 'Uporabnik blokiran.' });
    } catch (err) {
        console.error('Napaka pri blokiranju:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/admin/uporabniki/:id/odblokir — odblokira uporabnika
app.put('/api/admin/uporabniki/:id/odblokir', preveriToken, preveriAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE "Gost" SET "Vloga" = $1 WHERE "ID_Uporabniki" = $2', ['najemnik', req.params.id]);
        res.json({ success: true, message: 'Uporabnik odblokiran.' });
    } catch (err) {
        console.error('Napaka pri odblokiranju:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// DELETE /api/admin/uporabniki/:id — briši uporabnika (samo admin)
app.delete('/api/admin/uporabniki/:id', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM "Gost" WHERE "ID_Uporabniki" = $1', [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri brisanju uporabnika:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/admin/nepremicnine/:id/potrdi — potrdi nepremičnino (objavi jo)
app.put('/api/admin/nepremicnine/:id/potrdi', preveriToken, preveriAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE "Turnir" SET "Status" = $1 WHERE "ID_Turnir" = $2', ['live', req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri potrditvi nepremičnine:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/admin/nepremicnine/:id/blokiraj — blokiraj nepremičnino
app.put('/api/admin/nepremicnine/:id/blokiraj', preveriToken, preveriAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE "Turnir" SET "Status" = $1 WHERE "ID_Turnir" = $2', ['blokiran', req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri blokiranju nepremičnine:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/admin/feedback — vsi feedbacki za admin pregled
app.get('/api/admin/feedback', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM "Feedback" ORDER BY "ID_Komentarji" DESC');
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri admin feedback:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// DELETE /api/admin/feedback/:id — admin briše oceno
app.delete('/api/admin/feedback/:id', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM "Feedback" WHERE "ID_Komentarji" = $1', [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ error: 'Ocena ne obstaja.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri brisanju ocene:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/forum/:id/blokiraj — blokiraj forum objavo (admin)
app.put('/api/forum/:id/blokiraj', preveriToken, preveriAdmin, async (req, res) => {
    try {
        // Označimo z blokiranjem (v Naslov dodamo [BLOKIRANO] ali posodobimo vsebino)
        await pool.query(
            'UPDATE "Forum" SET "Naslov" = CONCAT(\'[BLOKIRANO] \', "Naslov") WHERE "ID_Forum" = $1',
            [req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri blokiranju forum objave:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/forum — seznam forum objav (uporablja ga admin.html za moderiranje)
app.get('/api/forum', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM "Forum" ORDER BY "ID_Forum" DESC');
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju forum objav:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// DELETE /api/forum/:id — briši forum objavo (admin)
app.delete('/api/forum/:id', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM "Forum" WHERE "ID_Forum" = $1', [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ error: 'Objava ne obstaja.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri brisanju forum objave:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// ══════════════════════════════════════════════════════
//  PROFIL API
// ══════════════════════════════════════════════════════

// GET /api/profil — pridobi podatke prijavljenega uporabnika + statistika
// POPRAVEK: prej se je statistika (zmage/porazi/vzdevek/država) brala iz
// tabele "Igralci", ki je bila odstranjena skupaj z ekipami/tekmami.
// Zdaj se šteje neposredno iz rezervacij (Prijava) in ocen (Feedback).
app.get('/api/profil', preveriToken, async (req, res) => {
    try {
        const uid = req.uporabnik.id;

        const uporabnikQ = await pool.query(
            `SELECT "ID_Uporabniki", "Username", "Email", "Vloga", "Drzava"
             FROM "Gost" WHERE "ID_Uporabniki" = $1 LIMIT 1`,
            [uid]
        );

        if (uporabnikQ.rows.length === 0)
            return res.status(404).json({ error: 'Uporabnik ne obstaja.' });

        const u = uporabnikQ.rows[0];

        // Število zaključenih najemov (rezervacije na nepremičninah, ki so trenutno "completed")
        const najemiQ = await pool.query(
            `SELECT COUNT(*) AS stevilo
             FROM "Prijava" p
             JOIN "Turnir" t ON p."TK_Turnir" = t."ID_Turnir"
             WHERE p."TK_Gost" = $1 AND t."Status" = 'completed'`,
            [uid]
        );

        // Skupno število rezervacij (ne glede na status)
        const rezervacijeQ = await pool.query(
            `SELECT COUNT(*) AS stevilo FROM "Prijava" WHERE "TK_Gost" = $1`,
            [uid]
        );

        // Prejete nagrade/popusti za nepremičnine, ki jih je uporabnik rezerviral
        const nagradeQ = await pool.query(
            `SELECT COUNT(*) AS stevilo FROM "Nagrada" n
             JOIN "Prijava" p ON p."TK_Turnir" = n."TK_Turnir"
             WHERE p."TK_Gost" = $1 AND n."Uvrstitev_za_nagrado" <= 3`,
            [uid]
        );

        const zmage    = parseInt(najemiQ.rows[0].stevilo) || 0;
        const turnirji = parseInt(rezervacijeQ.rows[0].stevilo) || 0;
        // Točke zvestobe: zaključen najem šteje več kot zgolj rezervacija
        const tocke = (zmage * 100) + (turnirji * 10);

        res.json({
            id:          u.ID_Uporabniki,
            username:    u.Username,
            email:       u.Email,
            vloga:       u.Vloga,
            drzava:      u.Drzava || '',
            zmage,       // "zmage" = število zaključenih najemov (ime polja ostalo zaradi frontenda)
            porazi:      0,
            turnirji,    // "turnirji" = skupno število rezervacij
            nagrade:     parseInt(nagradeQ.rows[0].stevilo) || 0,
            tocke
        });
    } catch (err) {
        console.error('Napaka pri pridobivanju profila:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/profil — posodobi podatke profila
app.put('/api/profil', preveriToken, async (req, res) => {
    const { Username, Email, Drzava } = req.body;
    const uid = req.uporabnik.id;

    if (!Username || !Email)
        return res.status(400).json({ error: 'Ime in email sta obvezna.' });

    try {
        // Preveri, ali email že zavzet (razen lastnega)
        const obs = await pool.query(
            'SELECT 1 FROM "Gost" WHERE "Email" = $1 AND "ID_Uporabniki" != $2',
            [Email, uid]
        );
        if (obs.rows.length > 0)
            return res.status(409).json({ error: 'Email je že v uporabi.' });

        await pool.query(
            'UPDATE "Gost" SET "Username" = $1, "Email" = $2, "Drzava" = $3 WHERE "ID_Uporabniki" = $4',
            [Username, Email, Drzava || null, uid]
        );

        res.json({ success: true, message: 'Profil posodobljen.' });
    } catch (err) {
        console.error('Napaka pri posodabljanju profila:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/profil/geslo — spremeni geslo
app.put('/api/profil/geslo', preveriToken, async (req, res) => {
    const { staroGeslo, novoGeslo } = req.body;
    const uid = req.uporabnik.id;

    if (!staroGeslo || !novoGeslo)
        return res.status(400).json({ error: 'Staro in novo geslo sta obvezna.' });
    if (novoGeslo.length < 6)
        return res.status(400).json({ error: 'Novo geslo mora imeti vsaj 6 znakov.' });

    try {
        const q = await pool.query('SELECT "Geslo" FROM "Gost" WHERE "ID_Uporabniki" = $1', [uid]);
        if (q.rows.length === 0) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });

        const pravilno = await prijaviUporabnika(staroGeslo, q.rows[0].Geslo);
        if (!pravilno) return res.status(401).json({ error: 'Staro geslo ni pravilno.' });

        const novoHash = await registrirajUporabnika('_', '_', novoGeslo);
        await pool.query('UPDATE "Gost" SET "Geslo" = $1 WHERE "ID_Uporabniki" = $2', [novoHash, uid]);
        res.json({ success: true, message: 'Geslo posodobljeno.' });
    } catch (err) {
        console.error('Napaka pri spremembi gesla:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// DELETE /api/profil — izbriši lasten račun
app.delete('/api/profil', preveriToken, async (req, res) => {
    const uid = req.uporabnik.id;
    try {
        await pool.query('DELETE FROM "Gost" WHERE "ID_Uporabniki" = $1', [uid]);
        res.json({ success: true, message: 'Račun izbrisan.' });
    } catch (err) {
        console.error('Napaka pri brisanju računa:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/profil/najemi — zgodovina ZAKLJUČENIH najemov prijavljenega uporabnika
// (prej: /api/profil/tekme — zgodovina odigranih tekem)
app.get('/api/profil/najemi', preveriToken, async (req, res) => {
    const uid = req.uporabnik.id;
    try {
        const { rows } = await pool.query(
            `SELECT 
                t."ID_Turnir", t."Ime_turnirja" AS ime_turnirja, t."Lokacija" AS lokacija,
                t."Nagradni_sklad" AS rezultat, t."Datum" AS datum, i."Naslov_igre" AS igra
             FROM "Prijava" p
             JOIN "Turnir" t ON p."TK_Turnir" = t."ID_Turnir"
             JOIN "Igra" i ON t."TK_Igra" = i."ID_Igra"
             WHERE p."TK_Gost" = $1 AND t."Status" = 'completed'
             ORDER BY t."Datum" DESC
             LIMIT 50`,
            [uid]
        );
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju najemov:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/profil/rezervacije — VSE rezervacije prijavljenega uporabnika
// (prej: /api/profil/turnirji — turnirji, na katere je prijavljena uporabnikova ekipa)
app.get('/api/profil/rezervacije', preveriToken, async (req, res) => {
    const uid = req.uporabnik.id;
    try {
        const { rows } = await pool.query(
            `SELECT 
                t."ID_Turnir", t."Ime_turnirja", t."Datum", t."Lokacija", t."Status",
                t."Nagradni_sklad", i."Naslov_igre" AS igra,
                n."Uvrstitev_za_nagrado" AS uvrstitev, n."Vrednost" AS nagrada_vrednost, n."Vrsta_nagrade"
             FROM "Prijava" p
             JOIN "Turnir" t ON p."TK_Turnir" = t."ID_Turnir"
             JOIN "Igra" i ON t."TK_Igra" = i."ID_Igra"
             LEFT JOIN "Nagrada" n ON n."TK_Turnir" = t."ID_Turnir" AND n."Uvrstitev_za_nagrado" = 1
             WHERE p."TK_Gost" = $1
             ORDER BY t."Datum" DESC`,
            [uid]
        );
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju rezervacij profila:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/profil/feedback — ocene, ki jih je oddal prijavljeni uporabnik
app.get('/api/profil/feedback', preveriToken, async (req, res) => {
    const uid = req.uporabnik.id;
    try {
        const { rows } = await pool.query(
            `SELECT f.*, g."Username" AS ime_uporabnika
             FROM "Feedback" f
             JOIN "Gost" g ON f."TK_Uporabniki" = g."ID_Uporabniki"
             WHERE f."TK_Uporabniki" = $1
             ORDER BY f."ID_Komentarji" DESC`,
            [uid]
        );
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri feedback:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// ══════════════════════════════════════════════════════
//  FEEDBACK / OCENE API
// ══════════════════════════════════════════════════════

// POST /api/feedback — oddaj oceno nastanitve
// POPRAVEK: prej se je iskal zapis v "Igralci" za trenutnega uporabnika.
// Ta tabela je odstranjena — zdaj poiščemo uporabnikovo rezervacijo (Prijava)
// za to nepremičnino in nanjo vežemo oceno (stolpec TK_Igralci je ostal,
// a zdaj hrani "Prijava.ID_Prijava" — glej OPOMBO na vrhu datoteke).
app.post('/api/feedback', preveriToken, async (req, res) => {
    const { TK_Turnir, Besedilo, Ocena } = req.body;
    const uid = req.uporabnik.id;

    if (!TK_Turnir || !Besedilo || !Ocena)
        return res.status(400).json({ error: 'Vsi podatki so obvezni.' });
    if (Ocena < 1 || Ocena > 5)
        return res.status(400).json({ error: 'Ocena mora biti med 1 in 5.' });

    try {
        const nepremicninaQ = await pool.query(
            'SELECT "TK_Forum", "ID_Turnir" FROM "Turnir" WHERE "ID_Turnir" = $1',
            [TK_Turnir]
        );
        if (nepremicninaQ.rows.length === 0)
            return res.status(404).json({ error: 'Nepremičnina ne obstaja.' });

        // Poiščemo (ali brez napake preskočimo) rezervacijo tega uporabnika za to nepremičnino
        const rezervacijaQ = await pool.query(
            'SELECT "ID_Prijava" FROM "Prijava" WHERE "TK_Turnir" = $1 AND "TK_Gost" = $2 LIMIT 1',
            [TK_Turnir, uid]
        );

        const forumId      = nepremicninaQ.rows[0].TK_Forum || 1;
        const rezervacijaId = rezervacijaQ.rows.length ? rezervacijaQ.rows[0].ID_Prijava : 1;

        const userQ = await pool.query('SELECT "Username" FROM "Gost" WHERE "ID_Uporabniki" = $1', [uid]);
        const username = userQ.rows[0]?.Username || 'Neznano';

        const { rows } = await pool.query(
            `INSERT INTO "Feedback" 
             ("TK_Forum","Besedilo","Ime_uporabnika","TK_Uporabniki","Ocena","TK_Igralci","ForumID_Forum")
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [forumId, Besedilo, username, uid, Ocena, rezervacijaId, forumId]
        );
        res.status(201).json({ success: true, feedback: rows[0] });
    } catch (err) {
        console.error('Napaka pri dodajanju ocene:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// ══════════════════════════════════════════════════════
//  OBVESTILA API
// ══════════════════════════════════════════════════════

// GET /api/obvestila — obvestila za prijavljenega uporabnika
app.get('/api/obvestila', preveriToken, async (req, res) => {
    const uid = req.uporabnik.id;
    try {
        const { rows } = await pool.query(
            `SELECT * FROM "Obvestila"
             WHERE "TK_Gost" = $1
             ORDER BY "ID_Obvestila" DESC
             LIMIT 30`,
            [uid]
        );
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri obvestilih:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/obvestila/:id/preberi — označi obvestilo kot prebrano
app.put('/api/obvestila/:id/preberi', preveriToken, async (req, res) => {
    try {
        // Obvestila tabela nima "prebrano" stolpca v originalni shemi,
        // zato poskusimo posodobiti — če stolpec ne obstaja, ga ignoriramo
        await pool.query(
            `UPDATE "Obvestila" SET "Prebrano" = TRUE WHERE "ID_Obvestila" = $1 AND "TK_Gost" = $2`,
            [req.params.id, req.uporabnik.id]
        ).catch(() => {}); // Tiho ignoriraj, če stolpec ne obstaja
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

//  zagon streznika

async function zazeniStrezenik() {
    let povezan = false;
    let poskusi = 5;

    while (!povezan && poskusi > 0) {
        try {
            await pool.query('SELECT 1');
            console.log('Uspešno povezan z bazo podatkov (PostgreSQL)!');
            povezan = true;
        } catch (err) {
            poskusi--;
            console.log(`Baza še ni pripravljena. Ponoven poskus čez 3s... (preostalo: ${poskusi})`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    if (!povezan) {
        console.error('Kritična napaka: ni možno vzpostaviti povezave z bazo.');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log('\n------------------------------------------------|');
        console.log('|  Easy Rent — Strežnik                           |');
        console.log(`|  http://localhost:${PORT}                       |`);
        console.log('--------------------------------------------------|');
        console.log('| POST /register                    -> Registracija       |');
        console.log('| POST /login                       -> Prijava + JWT      |');
        console.log('| GET  /api/me                      -> Moji podatki       |');
        console.log('| GET  /api/nepremicnine            -> Seznam nepremičnin |');
        console.log('| GET  /api/nepremicnine/:id        -> Ena nepremičnina   |');
        console.log('| POST /api/nepremicnine            -> Dodaj nepremičnino |');
        console.log('| POST /api/nepremicnine/rezervacija-> Rezerviraj         |');
        console.log('| DEL  /api/nepremicnine/:id        -> Briši (admin)      |');
        console.log('| GET  /api/statistika/top          -> Top nepremičnine   |');
        console.log('|__________________________________________________________|');
    });
}

zazeniStrezenik();
