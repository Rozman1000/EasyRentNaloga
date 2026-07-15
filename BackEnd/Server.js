
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
    database: process.env.DB_NAME     || 'Easyrentbaza',
    password: process.env.DB_PASSWORD || 'testnosuperskrpno',
    port:     process.env.DB_PORT     || 5432,
});

// Dovoljene kategorije forumskih objav (uporabljeno pri validaciji in za
// zagotovitev, da so filtri v forum.html vedno prikazani, tudi če šteje 0).
const FORUM_KATEGORIJE = ['splosno', 'najemi', 'nasveti', 'vzdrzevanje', 'sosedje', 'pravno'];

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

// Neobvezna avtentikacija — če je podan veljaven žeton, vrne uid, sicer null.
// Uporabljeno na javnih poteh, ki želijo prilagoditi odgovor prijavljenemu
// uporabniku (npr. prikazati njegov lastni glas na forumski objavi), a ne
// smejo zavrniti dostopa neprijavljenim.
function neobveznUid(req) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET).id;
    } catch (e) {
        return null;
    }
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
        const obstojeciEmail = await pool.query('SELECT 1 FROM "Uporabnik" WHERE "Email" = $1', [Email]);
        if (obstojeciEmail.rows.length > 0) {
            return res.status(409).json({ error: 'Uporabnik s tem emailom že obstaja.' });
        }

        const hashedPw = await registrirajUporabnika(Username, Email, Geslo);
        // Privzeta vloga novega uporabnika je "najemnik"
        await pool.query(
            'INSERT INTO "Uporabnik" ("Username", "Email", "Geslo", "Vloga") VALUES ($1, $2, $3, $4)',
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
        const rezultat = await pool.query('SELECT * FROM "Uporabnik" WHERE "Email" = $1', [email]);

        if (rezultat.rows.length === 0) {
            return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
        }

        const uporabnik = rezultat.rows[0];
        const uspeh = await prijaviUporabnika(password, uporabnik.Geslo);

        if (!uspeh) {
            return res.status(401).json({ error: 'Napačno geslo.' });
        }

        // Ustvari JWT token (velja 24h)
        // 'Administrator' v bazi → normaliziramo na 'admin' za JWT in admin check
        const vlogaNormalizirana = uporabnik.Vloga.toLowerCase() === 'administrator' ? 'admin' : uporabnik.Vloga.toLowerCase();

        const token = jwt.sign(
            {
                id:       uporabnik.ID_Uporabnik,
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
                id:       uporabnik.ID_Uporabnik,
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


//  NEPREMIČNINE API

// GET /api/nepremicnine — seznam vseh nepremičnin (javno)
app.get('/api/nepremicnine', async (req, res) => {
    try {
        const query = `
            SELECT 
                n."ID_Nepremicnina"  AS "ID_Turnir",
                n."Ime_nepremicnine" AS "Ime_turnirja",
                n."Datum",
                n."Lokacija",
                n."Cena_na_noc"      AS "Nagradni_sklad",
                n."Max_gostov"       AS "Max_ekip",
                n."Trenutno_gostov"  AS "Prijavljene_ekipe",
                n."Lat",
                n."Lng",
                n."Status",
                tn."Naziv"           AS "Naslov_igre"
            FROM "Nepremicnine" n
            JOIN "Tip_nepremicnine" tn ON n."TK_Tip_nepremicnine" = tn."ID_Tip_nepremicnine"
            ORDER BY n."ID_Nepremicnina" ASC
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
                n."ID_Nepremicnina"  AS "ID_Turnir",
                n."Ime_nepremicnine" AS "Ime_turnirja",
                n."Opis", n."Datum", n."Lokacija",
                n."Status", n."Lat", n."Lng",
                n."Max_gostov"       AS "Max_ekip",
                n."Trenutno_gostov"  AS "Prijavljene_ekipe",
                n."Cena_na_noc"      AS "Nagradni_sklad",
                tn."Naziv"           AS "Naslov_igre",
                g."Username"         AS "lastnik"
            FROM "Nepremicnine" n
            JOIN "Tip_nepremicnine" tn ON n."TK_Tip_nepremicnine" = tn."ID_Tip_nepremicnine"
            JOIN "Uporabnik" g ON n."TK_Uporabnik" = g."ID_Uporabnik"
            WHERE n."ID_Nepremicnina" = $1
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
        Ime_turnirja, TK_Igra, TK_Pogoji_najema,
        Opis, Datum, Lokacija, Lat, Lng, Max_ekip, Nagradni_sklad
    } = req.body;

    if (!Ime_turnirja || !TK_Igra || !Datum || !Lokacija || !Max_ekip || !Nagradni_sklad) {
        return res.status(400).json({ error: 'Vsi podatki o nepremičnini so obvezni.' });
    }

    const query = `
        INSERT INTO "Nepremicnine" 
        ("Ime_nepremicnine", "TK_Uporabnik", "TK_Tip_nepremicnine", "TK_Pogoji_najema", "Opis", "Datum", "Lokacija", "Lat", "Lng", "Max_gostov", "Trenutno_gostov", "Status", "Cena_na_noc")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'upcoming', $11)
        RETURNING "ID_Nepremicnina" AS "ID_Turnir"
    `;

    try {
        // TK_Pogoji_najema je obvezen tuji ključ — če ni podan, uporabimo prvi
        // razpoložljivi paket pogojev najema kot privzetega.
        const pogojiId = TK_Pogoji_najema || 1;
        const values = [Ime_turnirja, req.uporabnik.id, TK_Igra, pogojiId, Opis || null, Datum, Lokacija, Lat || '0', Lng || '0', Max_ekip, Nagradni_sklad];
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
            'SELECT "Max_gostov", "Trenutno_gostov", "Status", "Ime_nepremicnine" FROM "Nepremicnine" WHERE "ID_Nepremicnina" = $1 FOR UPDATE',
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

        if (nepremicnina.Trenutno_gostov + gostje > nepremicnina.Max_gostov) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Nepremičnina nima dovolj proste kapacitete za toliko gostov.' });
        }

        // Preveri, ali je uporabnik že rezerviral to nepremičnino
        const zeRezervirano = await client.query(
            'SELECT 1 FROM "Rezervacija" WHERE "TK_Nepremicnina" = $1 AND "TK_Uporabnik" = $2',
            [tk_nepremicnina, uid]
        );
        if (zeRezervirano.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'To nepremičnino ste že rezervirali.' });
        }

        // Vnos v tabelo Rezervacija
        await client.query(
            'INSERT INTO "Rezervacija" ("Datum_rezervacije", "TK_Nepremicnina", "TK_Uporabnik") VALUES (CURRENT_DATE, $1, $2)',
            [tk_nepremicnina, uid]
        );

        // Posodobitev števca trenutno nastanjenih gostov
        await client.query(
            'UPDATE "Nepremicnine" SET "Trenutno_gostov" = "Trenutno_gostov" + $1 WHERE "ID_Nepremicnina" = $2',
            [gostje, tk_nepremicnina]
        );

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: `Rezervacija za "${nepremicnina.Ime_nepremicnine}" je bila uspešno oddana!`
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
        const { rowCount } = await pool.query('DELETE FROM "Nepremicnine" WHERE "ID_Nepremicnina" = $1', [id]);

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Nepremičnina ne obstaja.' });
        }

        res.json({ success: true, message: `Nepremičnina ${id} uspešno izbrisana.` });
    } catch (err) {
        console.error(`Napaka pri brisanju nepremičnine ${id}:`, err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});



//  STATISTIKA API (uporablja jo statistika.html)

// GET /api/statistika/top — top 10 najbolj rentanih nepremičnin
// (razvrščeno po trenutnem številu nastanjenih gostov glede na kapaciteto)
app.get('/api/statistika/top', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                n."ID_Nepremicnina"  AS "ID_Turnir",
                n."Ime_nepremicnine" AS "Ime_turnirja",
                n."Lokacija",
                n."Cena_na_noc"      AS "Nagradni_sklad",
                n."Max_gostov"       AS "Max_ekip",
                n."Trenutno_gostov"  AS "Prijavljene_ekipe",
                tn."Naziv"           AS "Naslov_igre"
            FROM "Nepremicnine" n
            JOIN "Tip_nepremicnine" tn ON n."TK_Tip_nepremicnine" = tn."ID_Tip_nepremicnine"
            ORDER BY n."Trenutno_gostov" DESC
            LIMIT 10
        `);
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju statistike:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});



//  LESTVICA API 

function izracunajTrend(zadnjih, prejsnjih) {
    if (zadnjih > prejsnjih) return 'navzgor';
    if (zadnjih < prejsnjih) return 'navzdol';
    return 'enako';
}

// GET /api/lestvica/najemniki — rang lestvica najemnikov po št. rezervacij
app.get('/api/lestvica/najemniki', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                u."ID_Uporabnik" AS id,
                u."Username"     AS username,
                COUNT(DISTINCT r."ID_Rezervacija")::int AS stevilo_rezervacij,
                COUNT(DISTINCT r."ID_Rezervacija") FILTER (WHERE n."Status" = 'completed')::int AS zakljuceni_najemi,
                COUNT(DISTINCT r."ID_Rezervacija") FILTER (WHERE r."Datum_rezervacije" >= CURRENT_DATE - INTERVAL '30 days')::int AS zadnjih_30,
                COUNT(DISTINCT r."ID_Rezervacija") FILTER (WHERE r."Datum_rezervacije" >= CURRENT_DATE - INTERVAL '60 days' AND r."Datum_rezervacije" < CURRENT_DATE - INTERVAL '30 days')::int AS prejsnjih_30,
                ROUND(AVG(ocene."Ocena")::numeric, 1) AS povprecna_ocena,
                (
                    SELECT tn2."Naziv"
                    FROM "Rezervacija" r2
                    JOIN "Nepremicnine" n2 ON n2."ID_Nepremicnina" = r2."TK_Nepremicnina"
                    JOIN "Tip_nepremicnine" tn2 ON tn2."ID_Tip_nepremicnine" = n2."TK_Tip_nepremicnine"
                    WHERE r2."TK_Uporabnik" = u."ID_Uporabnik"
                    ORDER BY r2."Datum_rezervacije" DESC
                    LIMIT 1
                ) AS tip
            FROM "Uporabnik" u
            JOIN "Rezervacija" r ON r."TK_Uporabnik" = u."ID_Uporabnik"
            JOIN "Nepremicnine" n ON n."ID_Nepremicnina" = r."TK_Nepremicnina"
            LEFT JOIN "Ocena" ocene ON ocene."TK_Uporabnik" = u."ID_Uporabnik"
            WHERE u."Vloga" <> 'blokiran'
            GROUP BY u."ID_Uporabnik", u."Username"
            ORDER BY stevilo_rezervacij DESC, zakljuceni_najemi DESC
            LIMIT 20
        `);

        const lestvica = rows.map(r => ({
            id: r.id,
            username: r.username,
            stevilo_rezervacij: r.stevilo_rezervacij,
            zakljuceni_najemi: r.zakljuceni_najemi,
            tocke: (r.zakljuceni_najemi * 100) + (r.stevilo_rezervacij * 10),
            povprecna_ocena: r.povprecna_ocena,
            tip: r.tip || 'ostalo',
            trend: izracunajTrend(r.zadnjih_30, r.prejsnjih_30)
        }));

        res.json(lestvica);
    } catch (err) {
        console.error('Napaka pri lestvici najemnikov:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/lestvica/lastniki — rang lestvica lastnikov nepremičnin
app.get('/api/lestvica/lastniki', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                u."ID_Uporabnik" AS id,
                u."Username"     AS username,
                COUNT(DISTINCT n."ID_Nepremicnina")::int AS stevilo_nepremicnin,
                COUNT(DISTINCT r."ID_Rezervacija")::int AS stevilo_oddaj,
                COUNT(DISTINCT r."ID_Rezervacija") FILTER (WHERE r."Datum_rezervacije" >= CURRENT_DATE - INTERVAL '30 days')::int AS zadnjih_30,
                COUNT(DISTINCT r."ID_Rezervacija") FILTER (WHERE r."Datum_rezervacije" >= CURRENT_DATE - INTERVAL '60 days' AND r."Datum_rezervacije" < CURRENT_DATE - INTERVAL '30 days')::int AS prejsnjih_30,
                ROUND(AVG(ocene."Ocena")::numeric, 1) AS povprecna_ocena,
                (
                    SELECT tn2."Naziv"
                    FROM "Nepremicnine" n2
                    JOIN "Tip_nepremicnine" tn2 ON tn2."ID_Tip_nepremicnine" = n2."TK_Tip_nepremicnine"
                    WHERE n2."TK_Uporabnik" = u."ID_Uporabnik"
                    ORDER BY n2."Datum" DESC
                    LIMIT 1
                ) AS tip
            FROM "Uporabnik" u
            JOIN "Nepremicnine" n ON n."TK_Uporabnik" = u."ID_Uporabnik"
            LEFT JOIN "Rezervacija" r ON r."TK_Nepremicnina" = n."ID_Nepremicnina"
            LEFT JOIN "Ocena" ocene ON ocene."TK_Rezervacija" = r."ID_Rezervacija"
            GROUP BY u."ID_Uporabnik", u."Username"
            ORDER BY stevilo_nepremicnin DESC, stevilo_oddaj DESC
            LIMIT 20
        `);

        const lestvica = rows.map(r => ({
            id: r.id,
            username: r.username,
            stevilo_nepremicnin: r.stevilo_nepremicnin,
            stevilo_oddaj: r.stevilo_oddaj,
            tocke: (r.stevilo_nepremicnin * 50) + (r.stevilo_oddaj * 10),
            povprecna_ocena: r.povprecna_ocena,
            tip: r.tip || 'ostalo',
            trend: izracunajTrend(r.zadnjih_30, r.prejsnjih_30)
        }));

        res.json(lestvica);
    } catch (err) {
        console.error('Napaka pri lestvici lastnikov:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});



//  MODERACIJA API

// GET /api/moderacija — seznam vseh ukrepov (samo admin)
app.get('/api/moderacija', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT "ID_Moderacija", "TK_Nepremicnina" AS "TK_Turnir", "Datum", "Razlog", "Vrsta_ukrepa"
             FROM "Moderacija" ORDER BY "Datum" DESC`
        );
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
            'INSERT INTO "Moderacija" ("TK_Nepremicnina","Datum","Razlog","Vrsta_ukrepa") VALUES ($1, CURRENT_DATE, $2, $3) RETURNING *',
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


//  ADMIN STATISTIKE + UPRAVLJANJE UPORABNIKOV

// GET /api/admin/stats — osnovna statistika za admin nadzorno ploščo
app.get('/api/admin/stats', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const [users, nepremicnine, moderacije, pending] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM "Uporabnik"'),
            pool.query('SELECT COUNT(*) FROM "Nepremicnine"'),
            pool.query('SELECT COUNT(*) FROM "Moderacija" WHERE "Datum" = CURRENT_DATE'),
            pool.query(`SELECT COUNT(*) FROM "Nepremicnine" WHERE "Status" = 'upcoming'`)
        ]);
        res.json({
            users:       parseInt(users.rows[0].count),
            ekipe:       parseInt(nepremicnine.rows[0].count), // ime polja "ekipe" ostalo zaradi obstoječega frontenda — pomeni število nepremičnin
            moderacije:  parseInt(moderacije.rows[0].count),
            pending:     parseInt(pending.rows[0].count) // nepremičnine s statusom "upcoming", ki čakajo na potrditev (admin jih "potrdi" -> "live")
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
            'SELECT "ID_Uporabnik" AS "ID_Uporabniki","Username","Email","Vloga" FROM "Uporabnik" ORDER BY "ID_Uporabnik" ASC'
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
            'UPDATE "Uporabnik" SET "Vloga" = $1 WHERE "ID_Uporabnik" = $2',
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
        await pool.query('UPDATE "Uporabnik" SET "Vloga" = $1 WHERE "ID_Uporabnik" = $2', ['najemnik', req.params.id]);
        res.json({ success: true, message: 'Uporabnik odblokiran.' });
    } catch (err) {
        console.error('Napaka pri odblokiranju:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// DELETE /api/admin/uporabniki/:id — briši uporabnika (samo admin)
app.delete('/api/admin/uporabniki/:id', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM "Uporabnik" WHERE "ID_Uporabnik" = $1', [req.params.id]);
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
        await pool.query('UPDATE "Nepremicnine" SET "Status" = $1 WHERE "ID_Nepremicnina" = $2', ['live', req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri potrditvi nepremičnine:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/admin/nepremicnine/:id/blokiraj — blokiraj nepremičnino
app.put('/api/admin/nepremicnine/:id/blokiraj', preveriToken, preveriAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE "Nepremicnine" SET "Status" = $1 WHERE "ID_Nepremicnina" = $2', ['blokiran', req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri blokiranju nepremičnine:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/admin/feedback — vsi feedbacki za admin pregled
app.get('/api/admin/feedback', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                o."ID_Ocena"       AS "ID_Komentarji",
                o."TK_Forum",
                o."TK_Forum"       AS "ForumID_Forum",
                o."Besedilo",
                o."Ime_uporabnika",
                o."TK_Uporabnik",
                o."Ocena",
                o."TK_Rezervacija"
            FROM "Ocena" o
            ORDER BY o."ID_Ocena" DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri admin feedback:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// DELETE /api/admin/feedback/:id — admin briše oceno
app.delete('/api/admin/feedback/:id', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM "Ocena" WHERE "ID_Ocena" = $1', [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ error: 'Ocena ne obstaja.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri brisanju ocene:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});



//  FORUM API

// GET /api/forum/kategorije — javno, prave številke objav po kategoriji
app.get('/api/forum/kategorije', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT "Kategorija" AS id, COUNT(*)::int AS count
            FROM "Forum"
            WHERE "Naslov" NOT LIKE '[BLOKIRANO]%'
            GROUP BY "Kategorija"
        `);
        // Zagotovi, da so vse znane kategorije prisotne, tudi če je štetje 0
        const rezultat = FORUM_KATEGORIJE.map(id => {
            const najdena = rows.find(r => r.id === id);
            return { id, count: najdena ? najdena.count : 0 };
        });
        res.json(rezultat);
    } catch (err) {
        console.error('Napaka pri kategorijah foruma:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/forum/admin — admin pregled VSEH objav, vključno z blokiranimi
app.get('/api/forum/admin', preveriToken, preveriAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                f."ID_Forum", f."Naslov", f."Vsebina", f."Datum_objave",
                f."Kategorija", f."Pripeto",
                u."Username" AS "Avtor",
                COALESCE(SUM(g."Vrednost"), 0)::int AS "Glasovi"
            FROM "Forum" f
            LEFT JOIN "Uporabnik" u  ON u."ID_Uporabnik" = f."TK_Uporabnik"
            LEFT JOIN "Glas_Forum" g ON g."TK_Forum" = f."ID_Forum"
            GROUP BY f."ID_Forum", u."Username"
            ORDER BY f."ID_Forum" DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju forum objav (admin):', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/forum — javno, seznam (nezablokiranih) objav z glasovi
app.get('/api/forum', async (req, res) => {
    const uid = neobveznUid(req); // če je uporabnik prijavljen, vrnemo tudi njegov lastni glas

    try {
        const { rows } = await pool.query(`
            SELECT
                f."ID_Forum",
                f."Naslov",
                f."Vsebina",
                f."Datum_objave",
                f."Kategorija",
                f."Pripeto",
                u."Username"        AS "Avtor",
                u."ID_Uporabnik"    AS "TK_Uporabnik",
                COALESCE(SUM(g."Vrednost"), 0)::int AS "Glasovi",
                MAX(mg."Vrednost")  AS "MojGlas"
            FROM "Forum" f
            LEFT JOIN "Uporabnik" u   ON u."ID_Uporabnik" = f."TK_Uporabnik"
            LEFT JOIN "Glas_Forum" g  ON g."TK_Forum" = f."ID_Forum"
            LEFT JOIN "Glas_Forum" mg ON mg."TK_Forum" = f."ID_Forum" AND mg."TK_Uporabnik" = $1
            WHERE f."Naslov" NOT LIKE '[BLOKIRANO]%'
            GROUP BY f."ID_Forum", u."Username", u."ID_Uporabnik"
            ORDER BY f."Pripeto" DESC, f."Datum_objave" DESC, f."ID_Forum" DESC
        `, [uid]);
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri pridobivanju forum objav:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// POST /api/forum — nova objava (prijavljeni uporabnik)
app.post('/api/forum', preveriToken, async (req, res) => {
    const { Naslov, Vsebina, Kategorija } = req.body;

    if (!Naslov || !Vsebina) {
        return res.status(400).json({ error: 'Naslov in vsebina sta obvezna.' });
    }

    const kategorija = FORUM_KATEGORIJE.includes(Kategorija) ? Kategorija : 'splosno';

    try {
        const { rows } = await pool.query(
            `INSERT INTO "Forum" ("Naslov","Vsebina","Datum_objave","Kategorija","Pripeto","TK_Uporabnik")
             VALUES ($1, $2, CURRENT_DATE, $3, FALSE, $4)
             RETURNING "ID_Forum", "Naslov", "Vsebina", "Datum_objave", "Kategorija", "Pripeto"`,
            [Naslov, Vsebina, kategorija, req.uporabnik.id]
        );
        res.status(201).json({ success: true, objava: { ...rows[0], Avtor: req.uporabnik.username, Glasovi: 0, MojGlas: null } });
    } catch (err) {
        console.error('Napaka pri objavi na forumu:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// POST /api/forum/:id/glasuj — glasuj gor/dol (prijavljeni uporabnik, trajno shranjeno)
app.post('/api/forum/:id/glasuj', preveriToken, async (req, res) => {
    const forumId = req.params.id;
    const uid = req.uporabnik.id;
    const smer = parseInt(req.body.smer);

    if (smer !== 1 && smer !== -1) {
        return res.status(400).json({ error: 'Smer glasu mora biti 1 (gor) ali -1 (dol).' });
    }

    try {
        const objavaObstaja = await pool.query('SELECT 1 FROM "Forum" WHERE "ID_Forum" = $1', [forumId]);
        if (objavaObstaja.rows.length === 0) {
            return res.status(404).json({ error: 'Objava ne obstaja.' });
        }

        const obstojeci = await pool.query(
            'SELECT "Vrednost" FROM "Glas_Forum" WHERE "TK_Forum" = $1 AND "TK_Uporabnik" = $2',
            [forumId, uid]
        );

        if (obstojeci.rows.length === 0) {
            // Nov glas
            await pool.query(
                'INSERT INTO "Glas_Forum" ("TK_Forum","TK_Uporabnik","Vrednost") VALUES ($1,$2,$3)',
                [forumId, uid, smer]
            );
        } else if (obstojeci.rows[0].Vrednost === smer) {
            // Isti glas ponovno -> prekliči (toggle off)
            await pool.query(
                'DELETE FROM "Glas_Forum" WHERE "TK_Forum" = $1 AND "TK_Uporabnik" = $2',
                [forumId, uid]
            );
        } else {
            // Nasproten glas -> obrni
            await pool.query(
                'UPDATE "Glas_Forum" SET "Vrednost" = $1 WHERE "TK_Forum" = $2 AND "TK_Uporabnik" = $3',
                [smer, forumId, uid]
            );
        }

        const vsota    = await pool.query('SELECT COALESCE(SUM("Vrednost"),0)::int AS glasovi FROM "Glas_Forum" WHERE "TK_Forum" = $1', [forumId]);
        const mojGlasQ = await pool.query('SELECT "Vrednost" FROM "Glas_Forum" WHERE "TK_Forum" = $1 AND "TK_Uporabnik" = $2', [forumId, uid]);

        res.json({
            success: true,
            glasovi: vsota.rows[0].glasovi,
            mojGlas: mojGlasQ.rows.length ? mojGlasQ.rows[0].Vrednost : 0
        });
    } catch (err) {
        console.error('Napaka pri glasovanju:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// PUT /api/forum/:id/blokiraj — blokiraj forum objavo (admin)
app.put('/api/forum/:id/blokiraj', preveriToken, preveriAdmin, async (req, res) => {
    try {
        // Označimo z blokiranjem (v Naslov dodamo [BLOKIRANO])
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


//  PROFIL API

// GET /api/profil — pridobi podatke prijavljenega uporabnika + statistika
app.get('/api/profil', preveriToken, async (req, res) => {
    try {
        const uid = req.uporabnik.id;

        const uporabnikQ = await pool.query(
            `SELECT "ID_Uporabnik", "Username", "Email", "Vloga", "Drzava"
             FROM "Uporabnik" WHERE "ID_Uporabnik" = $1 LIMIT 1`,
            [uid]
        );

        if (uporabnikQ.rows.length === 0)
            return res.status(404).json({ error: 'Uporabnik ne obstaja.' });

        const u = uporabnikQ.rows[0];

        // Število zaključenih najemov (rezervacije na nepremičninah, ki so trenutno "completed")
        const najemiQ = await pool.query(
            `SELECT COUNT(*) AS stevilo
             FROM "Rezervacija" r
             JOIN "Nepremicnine" n ON r."TK_Nepremicnina" = n."ID_Nepremicnina"
             WHERE r."TK_Uporabnik" = $1 AND n."Status" = 'completed'`,
            [uid]
        );

        // Skupno število rezervacij (ne glede na status)
        const rezervacijeQ = await pool.query(
            `SELECT COUNT(*) AS stevilo FROM "Rezervacija" WHERE "TK_Uporabnik" = $1`,
            [uid]
        );

        // "Nagrade" = število različnih promocijskih popustov, ki so veljali
        // za nepremičnine, ki jih je uporabnik rezerviral.
        const nagradeQ = await pool.query(
            `SELECT COUNT(DISTINCT pop."ID_Popust") AS stevilo
             FROM "Popust" pop
             JOIN "Rezervacija" r ON r."TK_Nepremicnina" = pop."TK_Nepremicnina"
             WHERE r."TK_Uporabnik" = $1`,
            [uid]
        );

        const zmage    = parseInt(najemiQ.rows[0].stevilo) || 0;
        const turnirji = parseInt(rezervacijeQ.rows[0].stevilo) || 0;
        // Točke zvestobe: zaključen najem šteje več kot zgolj rezervacija
        const tocke = (zmage * 100) + (turnirji * 10);

        res.json({
            id:          u.ID_Uporabnik,
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
            'SELECT 1 FROM "Uporabnik" WHERE "Email" = $1 AND "ID_Uporabnik" != $2',
            [Email, uid]
        );
        if (obs.rows.length > 0)
            return res.status(409).json({ error: 'Email je že v uporabi.' });

        await pool.query(
            'UPDATE "Uporabnik" SET "Username" = $1, "Email" = $2, "Drzava" = $3 WHERE "ID_Uporabnik" = $4',
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
        const q = await pool.query('SELECT "Geslo" FROM "Uporabnik" WHERE "ID_Uporabnik" = $1', [uid]);
        if (q.rows.length === 0) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });

        const pravilno = await prijaviUporabnika(staroGeslo, q.rows[0].Geslo);
        if (!pravilno) return res.status(401).json({ error: 'Staro geslo ni pravilno.' });

        const novoHash = await registrirajUporabnika('_', '_', novoGeslo);
        await pool.query('UPDATE "Uporabnik" SET "Geslo" = $1 WHERE "ID_Uporabnik" = $2', [novoHash, uid]);
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
        await pool.query('DELETE FROM "Uporabnik" WHERE "ID_Uporabnik" = $1', [uid]);
        res.json({ success: true, message: 'Račun izbrisan.' });
    } catch (err) {
        console.error('Napaka pri brisanju računa:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});

// GET /api/profil/najemi — zgodovina ZAKLJUČENIH najemov prijavljenega uporabnika
app.get('/api/profil/najemi', preveriToken, async (req, res) => {
    const uid = req.uporabnik.id;
    try {
        const { rows } = await pool.query(
            `SELECT 
                n."ID_Nepremicnina" AS "ID_Turnir",
                n."Ime_nepremicnine" AS "ime_turnirja",
                n."Lokacija" AS "lokacija",
                n."Cena_na_noc" AS "rezultat",
                r."Datum_rezervacije" AS "datum",
                tn."Naziv" AS "igra"
             FROM "Rezervacija" r
             JOIN "Nepremicnine" n ON r."TK_Nepremicnina" = n."ID_Nepremicnina"
             JOIN "Tip_nepremicnine" tn ON n."TK_Tip_nepremicnine" = tn."ID_Tip_nepremicnine"
             WHERE r."TK_Uporabnik" = $1 AND n."Status" = 'completed'
             ORDER BY r."Datum_rezervacije" DESC
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
app.get('/api/profil/rezervacije', preveriToken, async (req, res) => {
    const uid = req.uporabnik.id;
    try {
        const { rows } = await pool.query(
            `SELECT 
                n."ID_Nepremicnina" AS "ID_Turnir",
                n."Ime_nepremicnine" AS "ime_turnirja",
                r."Datum_rezervacije" AS "datum",
                n."Lokacija" AS "lokacija",
                n."Status" AS "status",
                n."Cena_na_noc" AS "Nagradni_sklad",
                tn."Naziv" AS "igra"
             FROM "Rezervacija" r
             JOIN "Nepremicnine" n ON r."TK_Nepremicnina" = n."ID_Nepremicnina"
             JOIN "Tip_nepremicnine" tn ON n."TK_Tip_nepremicnine" = tn."ID_Tip_nepremicnine"
             WHERE r."TK_Uporabnik" = $1
             ORDER BY r."Datum_rezervacije" DESC`,
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
            `SELECT o.*, g."Username" AS "ime_uporabnika", n."Ime_nepremicnine" AS "ime_turnirja"
             FROM "Ocena" o
             JOIN "Uporabnik" g ON o."TK_Uporabnik" = g."ID_Uporabnik"
             LEFT JOIN "Rezervacija" r ON r."ID_Rezervacija" = o."TK_Rezervacija"
             LEFT JOIN "Nepremicnine" n ON n."ID_Nepremicnina" = r."TK_Nepremicnina"
             WHERE o."TK_Uporabnik" = $1
             ORDER BY o."ID_Ocena" DESC`,
            [uid]
        );
        res.json(rows);
    } catch (err) {
        console.error('Napaka pri feedback:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});


//  FEEDBACK / OCENE API

app.post('/api/feedback', preveriToken, async (req, res) => {
    const { TK_Turnir, Besedilo, Ocena } = req.body;
    const uid = req.uporabnik.id;

    if (!TK_Turnir || !Besedilo || !Ocena)
        return res.status(400).json({ error: 'Vsi podatki so obvezni.' });
    if (Ocena < 1 || Ocena > 5)
        return res.status(400).json({ error: 'Ocena mora biti med 1 in 5.' });

    try {
        const nepremicninaQ = await pool.query(
            'SELECT "TK_Forum" FROM "Nepremicnine" WHERE "ID_Nepremicnina" = $1',
            [TK_Turnir]
        );
        if (nepremicninaQ.rows.length === 0)
            return res.status(404).json({ error: 'Nepremičnina ne obstaja.' });

        // Uporabnik mora imeti rezervacijo za to nepremičnino, da lahko oceni bivanje
        const rezervacijaQ = await pool.query(
            'SELECT "ID_Rezervacija" FROM "Rezervacija" WHERE "TK_Nepremicnina" = $1 AND "TK_Uporabnik" = $2 LIMIT 1',
            [TK_Turnir, uid]
        );
        if (rezervacijaQ.rows.length === 0) {
            return res.status(403).json({ error: 'Oceniti je mogoče samo nepremičnino, ki jo imate rezervirano.' });
        }

        const forumId       = nepremicninaQ.rows[0].TK_Forum || null;
        const rezervacijaId = rezervacijaQ.rows[0].ID_Rezervacija;

        const userQ = await pool.query('SELECT "Username" FROM "Uporabnik" WHERE "ID_Uporabnik" = $1', [uid]);
        const username = userQ.rows[0]?.Username || 'Neznano';

        const { rows } = await pool.query(
            `INSERT INTO "Ocena" 
             ("TK_Forum","Besedilo","Ime_uporabnika","TK_Uporabnik","Ocena","TK_Rezervacija")
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [forumId, Besedilo, username, uid, Ocena, rezervacijaId]
        );
        res.status(201).json({ success: true, feedback: rows[0] });
    } catch (err) {
        console.error('Napaka pri dodajanju ocene:', err);
        res.status(500).json({ error: 'Napaka na strežniku.' });
    }
});


//  OBVESTILA API

// GET /api/obvestila — obvestila za prijavljenega uporabnika
app.get('/api/obvestila', preveriToken, async (req, res) => {
    const uid = req.uporabnik.id;
    try {
        const { rows } = await pool.query(
            `SELECT
                ob."ID_Obvestilo" AS "ID_Obvestila",
                ob."Vsebina",
                ob."Vsebina"      AS "vsebina",
                ob."Tip_obvestila",
                ob."TK_Uporabnik",
                ob."Prebrano",
                ob."Prebrano"     AS "prebrano",
                ob."Datum",
                ob."Datum"        AS "datum"
             FROM "Obvestila" ob
             WHERE ob."TK_Uporabnik" = $1
             ORDER BY ob."Datum" DESC, ob."ID_Obvestilo" DESC
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
        await pool.query(
            `UPDATE "Obvestila" SET "Prebrano" = TRUE WHERE "ID_Obvestilo" = $1 AND "TK_Uporabnik" = $2`,
            [req.params.id, req.uporabnik.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Napaka pri označevanju obvestila:', err);
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
        console.log('| POST /register                       -> Registracija       |');
        console.log('| POST /login                          -> Prijava + JWT      |');
        console.log('| GET  /api/me                         -> Moji podatki       |');
        console.log('| GET  /api/nepremicnine               -> Seznam nepremičnin |');
        console.log('| GET  /api/nepremicnine/:id           -> Ena nepremičnina   |');
        console.log('| POST /api/nepremicnine               -> Dodaj nepremičnino |');
        console.log('| POST /api/nepremicnine/rezervacija   -> Rezerviraj         |');
        console.log('| DEL  /api/nepremicnine/:id           -> Briši (admin)      |');
        console.log('| GET  /api/statistika/top             -> Top nepremičnine   |');
        console.log('| GET  /api/lestvica/najemniki         -> Lestvica najemnikov|');
        console.log('| GET  /api/lestvica/lastniki          -> Lestvica lastnikov |');
        console.log('| GET  /api/forum/kategorije           -> Kategorije foruma  |');
        console.log('| GET  /api/forum                      -> Objave foruma      |');
        console.log('| POST /api/forum                      -> Nova objava        |');
        console.log('| POST /api/forum/:id/glasuj           -> Glasuj na objavo   |');
        console.log('|__________________________________________________________|');
    });
}

zazeniStrezenik();