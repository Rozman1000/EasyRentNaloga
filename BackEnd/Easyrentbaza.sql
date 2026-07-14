-- brisanje tabel
DROP TABLE IF EXISTS "Ocena" CASCADE;
DROP TABLE IF EXISTS "Rezervacija" CASCADE;
DROP TABLE IF EXISTS "Forum" CASCADE;
DROP TABLE IF EXISTS "Obvestila" CASCADE;
DROP TABLE IF EXISTS "Popust" CASCADE;
DROP TABLE IF EXISTS "Nepremicnine" CASCADE;
DROP TABLE IF EXISTS "Moderacija" CASCADE;
DROP TABLE IF EXISTS "Tip_nepremicnine" CASCADE;
DROP TABLE IF EXISTS "Pogoji_najema" CASCADE;
DROP TABLE IF EXISTS "Uporabnik" CASCADE;


-- ustvarjanje tabel

-- Katalog tipov nepremičnin
CREATE TABLE "Tip_nepremicnine" (
                        "ID_Tip_nepremicnine" SERIAL PRIMARY KEY,
                        "Naziv"        VARCHAR(255) NOT NULL, -- npr. "Hiša", "Apartma", "Vila", "Kabina"
                        "Zanr"         VARCHAR(255) NOT NULL, -- npr. kategorija: "Družinska", "Luksuzna", "Mestna"
                        "Podtip"       VARCHAR(255) NOT NULL  -- npr. dodatna oznaka: "Samostojna hiša", "Večstanovanjska"
);

-- Paket pogojev najema, vezan na nepremičnino
CREATE TABLE "Pogoji_najema" (
                           "ID_Pogoji_najema" SERIAL PRIMARY KEY,
                           "Tip_sistema" VARCHAR(255) NOT NULL, -- npr. "Kratkoročni najem", "Dolgoročni najem"
                           "Min_nocitev" INTEGER      NOT NULL, -- minimalno število noči
                           "Pravila"     VARCHAR(255) NOT NULL  -- hišni red / pogoji bivanja
);

-- Uporabniki platforme (najemniki, lastniki, administratorji)
CREATE TABLE "Uporabnik" (
                        "ID_Uporabnik" SERIAL PRIMARY KEY,
                        "Username"      VARCHAR(255) NOT NULL,
                        "Email"         VARCHAR(255) NOT NULL,
                        "Geslo"         VARCHAR(255) NOT NULL,
                        "Vloga"         VARCHAR(255) NOT NULL, -- 'najemnik' | 'lastnik' | 'administrator' | 'blokiran'
                        "Drzava"        VARCHAR(255)
);

CREATE TABLE "Moderacija" (
                              "ID_Moderacija"     SERIAL PRIMARY KEY,
                              "TK_Nepremicnina"   INTEGER      NOT NULL, -- nepremičnina/vsebina, na katero se ukrep nanaša
                              "Datum"             DATE         NOT NULL,
                              "Razlog"            VARCHAR(255) NOT NULL,
                              "Vrsta_ukrepa"      VARCHAR(255) NOT NULL
);

-- Nepremičnine za najem
CREATE TABLE "Nepremicnine" (
                          "ID_Nepremicnina"        SERIAL PRIMARY KEY,
                          "TK_Uporabnik"           INTEGER      NOT NULL, -- lastnik, ki je nepremičnino objavil
                          "TK_Tip_nepremicnine"    INTEGER      NOT NULL, -- tip nepremičnine
                          "TK_Forum"               INTEGER,
                          "TK_Pogoji_najema"       INTEGER      NOT NULL, -- paket pogojev najema
                          "Ime_nepremicnine"       VARCHAR(255) NOT NULL, -- naziv nepremičnine
                          "Opis"                   VARCHAR(255),
                          "Datum"                  DATE         NOT NULL, -- na voljo od
                          "Lokacija"               VARCHAR(255) NOT NULL,
                          "Status"                 VARCHAR(255) NOT NULL, -- 'live' (prosto) | 'upcoming' (kmalu prosto) | 'completed' (zasedeno) | 'blokiran'
                          "Lat"                    VARCHAR(255) NOT NULL, -- zemljepisna širina (za Google Maps)
                          "Lng"                    VARCHAR(255) NOT NULL, -- zemljepisna dolžina (za Google Maps)
                          "Max_gostov"             INTEGER      NOT NULL, -- kapaciteta (največje število gostov)
                          "Trenutno_gostov"        INTEGER      NOT NULL, -- trenutno nastanjenih/rezerviranih gostov
                          "Cena_na_noc"            VARCHAR(255) NOT NULL -- cena najema na noč (€)
);

-- Promocijski popusti za posamezno nepremičnino
CREATE TABLE "Popust" (
                           "ID_Popust"            SERIAL PRIMARY KEY,
                           "TK_Nepremicnina"      INTEGER      NOT NULL,
                           "Vrsta_popusta"        VARCHAR(255) NOT NULL,
                           "Vrednost"             INTEGER      NOT NULL,
                           "Prioriteta"           SMALLINT     NOT NULL
);

CREATE TABLE "Obvestila" (
                             "ID_Obvestilo"     SERIAL PRIMARY KEY,
                             "TK_Nepremicnina"  INTEGER      NOT NULL,
                             "Vsebina"          VARCHAR(255) NOT NULL,
                             "Tip_obvestila"    INTEGER      NOT NULL,
                             "TK_Uporabnik"     INTEGER      NOT NULL
);

CREATE TABLE "Forum" (
                         "ID_Forum"          SERIAL PRIMARY KEY,
                         "Naslov"            VARCHAR(255) NOT NULL,
                         "Vsebina"           VARCHAR(255) NOT NULL,
                         "Datum_objave"      DATE         NOT NULL,
                         "TK_Moderacija"     INTEGER      NOT NULL,
                         "TK_Uporabnik"      INTEGER
);

-- Rezervacije nepremičnin s strani posameznega uporabnika
CREATE TABLE "Rezervacija" (
                           "ID_Rezervacija"     SERIAL PRIMARY KEY,
                           "Datum_rezervacije"  DATE         NOT NULL,
                           "TK_Nepremicnina"    INTEGER      NOT NULL, -- rezervirana nepremičnina
                           "TK_Uporabnik"       INTEGER      NOT NULL  -- uporabnik, ki je rezerviral
);

-- Ocene nastanitev
CREATE TABLE "Ocena" (
                            "ID_Ocena"        SERIAL PRIMARY KEY,
                            "TK_Forum"        INTEGER,
                            "Besedilo"        VARCHAR(255) NOT NULL,
                            "Ime_uporabnika"  VARCHAR(255) NOT NULL,
                            "TK_Uporabnik"    INTEGER,
                            "Ocena"           SMALLINT     NOT NULL CHECK ("Ocena" BETWEEN 1 AND 5),
                            "TK_Rezervacija"  INTEGER      NOT NULL -- kaže na "Rezervacija"("ID_Rezervacija")
);


-- tuji ključi
ALTER TABLE "Nepremicnine" ADD CONSTRAINT fk_nepremicnina_uporabnik      FOREIGN KEY ("TK_Uporabnik")        REFERENCES "Uporabnik"("ID_Uporabnik");
ALTER TABLE "Nepremicnine" ADD CONSTRAINT fk_nepremicnina_tip            FOREIGN KEY ("TK_Tip_nepremicnine") REFERENCES "Tip_nepremicnine"("ID_Tip_nepremicnine");
ALTER TABLE "Nepremicnine" ADD CONSTRAINT fk_nepremicnina_pogoji_najema  FOREIGN KEY ("TK_Pogoji_najema")    REFERENCES "Pogoji_najema"("ID_Pogoji_najema");
ALTER TABLE "Nepremicnine" ADD CONSTRAINT fk_nepremicnina_forum         FOREIGN KEY ("TK_Forum")            REFERENCES "Forum"("ID_Forum");
ALTER TABLE "Popust"       ADD CONSTRAINT fk_popust_nepremicnina        FOREIGN KEY ("TK_Nepremicnina")     REFERENCES "Nepremicnine"("ID_Nepremicnina");
ALTER TABLE "Obvestila"    ADD CONSTRAINT fk_obvestilo_nepremicnina     FOREIGN KEY ("TK_Nepremicnina")     REFERENCES "Nepremicnine"("ID_Nepremicnina");
ALTER TABLE "Obvestila"    ADD CONSTRAINT fk_obvestilo_uporabnik        FOREIGN KEY ("TK_Uporabnik")        REFERENCES "Uporabnik"("ID_Uporabnik");
ALTER TABLE "Forum"        ADD CONSTRAINT fk_forum_moderacija           FOREIGN KEY ("TK_Moderacija")       REFERENCES "Moderacija"("ID_Moderacija");
ALTER TABLE "Moderacija"   ADD CONSTRAINT fk_moderacija_nepremicnina    FOREIGN KEY ("TK_Nepremicnina")     REFERENCES "Nepremicnine"("ID_Nepremicnina");
ALTER TABLE "Rezervacija"  ADD CONSTRAINT fk_rezervacija_nepremicnina   FOREIGN KEY ("TK_Nepremicnina")     REFERENCES "Nepremicnine"("ID_Nepremicnina");
ALTER TABLE "Rezervacija"  ADD CONSTRAINT fk_rezervacija_uporabnik      FOREIGN KEY ("TK_Uporabnik")        REFERENCES "Uporabnik"("ID_Uporabnik");
ALTER TABLE "Ocena"        ADD CONSTRAINT fk_ocena_rezervacija          FOREIGN KEY ("TK_Rezervacija")      REFERENCES "Rezervacija"("ID_Rezervacija");
ALTER TABLE "Ocena"        ADD CONSTRAINT fk_ocena_forum                FOREIGN KEY ("TK_Forum")            REFERENCES "Forum"("ID_Forum");


-- 1. Osnovne tabele

-- Tipi nepremičnin
INSERT INTO "Tip_nepremicnine" ("Naziv", "Zanr", "Podtip") VALUES
('Hiša',    'Družinska', 'Samostojna hiša'),
('Apartma', 'Mestna',    'Večstanovanjska stavba'),
('Vila',    'Luksuzna',  'Samostojna hiša'),
('Kabina',  'Počitniška','Lesena koča'),
('Apartma', 'Študentska','Večstanovanjska stavba'),
('Hiša',    'Kmečka',    'Samostojna hiša');

-- Paketi pogojev najema
INSERT INTO "Pogoji_najema" ("Tip_sistema", "Min_nocitev", "Pravila") VALUES
('Kratkoročni najem', 1,  'Minimalno 1 noč, brez hišnih ljubljenčkov'),
('Dolgoročni najem',  30, 'Minimalno 30 dni, dovoljeni hišni ljubljenčki'),
('Kratkoročni najem', 2,  'Minimalno 2 noči, kajenje prepovedano'),
('Vikend najem',      3,  'Minimalno 3 noči, samo vikendi'),
('Kratkoročni najem', 1,  'Minimalno 1 noč, brez zabav in prireditev'),
('Dolgoročni najem',  90, 'Minimalno 90 dni, primerno za družine'),
('Kratkoročni najem', 5,  'Minimalno 5 noči, primerno za skupine do 10 oseb');

INSERT INTO "Uporabnik" ("Username", "Email", "Geslo", "Vloga", "Drzava") VALUES
('Admin_Marko', 'marko@easyrent.si', '$2b$10$IIHhqe9tKP58pnLVKBZGIudpI7n3gEEF1FnZCRy8FCRmU2gvdo.7G', 'Administrator', 'Slovenija'), --test: geslo123
('Luka_King', 'luka@gmail.com', '$2b$10$J2Kk1GdLn84aeg.3Wn6d..yUHMykaXWiLK3N6b3VObk/dajb2RYKC', 'najemnik', 'Slovenija'),--test: luka123
('Ana_Pro', 'ana.pro@yahoo.com', '$2b$10$2qbfzBsd1SC7BM65UaXG/.qukYggO3OLt/BAZVuyxwwvdxpm5//fW', 'najemnik', 'Hrvaška'),--test: anabanana
('Team_Manager', 'manager@easyrent.si', '$2b$10$LkQlG6H4tQ1Z2aYnz1p9IeW3eq7RHohiQ2zoebM/dhY4.2nAbQt6i', 'lastnik', 'Slovenija'), --test: manager123
('Ghost_Player', 'ghost@gmail.com', '$2b$10$02N.hFJA58HCyutbEsoQOOtzgKAB7d2RlxObqrykswBKryT4Cgxj2', 'najemnik', 'Italija');--test: hidden123

-- 2. Nepremičnine
INSERT INTO "Nepremicnine" ("TK_Uporabnik", "TK_Tip_nepremicnine", "TK_Pogoji_najema", "Ime_nepremicnine", "Opis", "Datum", "Lokacija","Status","Lat","Lng","Max_gostov","Trenutno_gostov","Cena_na_noc") VALUES
(1, 2, 1,
 'Sončno stanovanje v centru Ljubljane',
 'Svetlo dvosobno stanovanje v samem centru mesta, primerno za pare ali poslovne goste. V bližini vse potrebne storitve.',
 '2026-05-15', 'Ljubljana',
 'live', 46.0569, 14.5058,
 4, 2, '85'),
(1, 4, 2,
 'Počitniška kabina ob Bledu',
 'Lesena kabina z razgledom na jezero. Idealna za romantičen pobeg ali družinske počitnice.',
 '2026-05-15', 'Bled',
 'live', 46.3683, 14.1146,
 6, 5, '120'),
(4, 1, 6,
 'Družinska hiša z vrtom',
 'Prostorna hiša z velikim vrtom, primerna za daljše bivanje družin. V bližini vrtec in osnovna šola.',
 '2026-05-16', 'Maribor',
 'live', 46.5547, 15.6466,
 8, 3, '95'),
(1, 2, 1,
 'Moderen studio blizu fakultete',
 'Majhen, a funkcionalen studio, idealen za študente. Kratkoročni in dolgoročni najem možen.',
 '2026-05-22', 'Koper',
 'upcoming', 45.5469, 13.7294,
 2, 0, '55'),
(4, 6, 2,
 'Kmečka domačija na podeželju',
 'Mirna lokacija stran od mestnega vrveža, primerna za oddih in sprostitev v naravi.',
 '2026-05-24', 'Celje',
 'upcoming', 46.2299, 15.2614,
 5, 1, '70'),
 (1, 4, 7,
 'Luksuzna vila z bazenom',
 'Prostorna vila z zasebnim bazenom in razgledom na morje. Primerna za skupine do 10 oseb.',
 '2026-05-29', 'Koper',
 'upcoming', 45.5469, 13.7294,
 10, 0, '250'),
 (1, 2, 1,
 'Apartma z razgledom na staro mestno jedro',
 'Urejen apartma v zgodovinskem delu mesta. Trenutno oddan dolgoročnemu najemniku.',
 '2026-04-20', 'Ljubljana',
 'completed', 46.0569, 14.5058,
 3, 3, '90'),
 (4, 1, 2,
 'Vila v Mariboru z vinogradom',
 'Elegantna vila obdana z vinogradi. Trenutno v celoti zasedena.',
 '2026-04-12', 'Maribor',
 'completed', 46.5547, 15.6466,
 6, 6, '180');

-- 3. Popusti, Obvestila in Moderacija
INSERT INTO "Popust" ("TK_Nepremicnina", "Vrsta_popusta", "Vrednost", "Prioriteta") VALUES
(1, 'Popust za zgodnjo rezervacijo', 10, 1),
(1, 'Popust za daljše bivanje', 15, 2),
(2, 'Brezplačen zajtrk', 0, 1),
(4, 'Darilni bon', 20, 3),
(5, 'Popust za stalne goste', 5, 1);

INSERT INTO "Obvestila" ("TK_Nepremicnina", "Vsebina", "Tip_obvestila", "TK_Uporabnik") VALUES
(1, 'Rezervacije so odprte!', 1, 1),
(2, 'Cena najema je bila posodobljena.', 2, 4),
(1, 'Vaša rezervacija se potrdi v 15 minutah.', 3, 2),
(4, 'Rezervacija preklicana s strani najemnika.', 4, 1),
(5, 'Nepremičnina začasno ni na voljo.', 2, 5);

INSERT INTO "Moderacija" ("TK_Nepremicnina", "Datum", "Razlog", "Vrsta_ukrepa") VALUES
(1, '2024-06-01', 'Neprimerno vedenje v komentarjih', 'Warning'),
(2, '2024-07-01', 'Lažna objava nepremičnine', 'Ban'),
(4, '2024-09-01', 'Neustrezen naziv objave', 'Force change'),
(1, '2024-06-10', 'Spamanje v komentarjih', 'Mute'),
(2, '2024-07-05', 'Deljenje računa med več uporabniki', 'Permanent Ban');

-- 4. Forum
INSERT INTO "Forum" ("Naslov", "Vsebina", "Datum_objave", "TK_Moderacija", "TK_Uporabnik") VALUES
('Pravila skupnosti', 'Prosimo, preberite pravila pred objavo.', '2024-05-20', 1, 1),
('Iščem sostanovalca', 'Iščem mirnega sostanovalca za deljeno stanovanje.', '2024-05-21', 4, 2),
('Težave s spletno stranjo', 'Stran se občasno ne odziva.', '2024-06-16', 3, 3),
('Uspešna izkušnja', 'Čestitke ekipi Easy Rent za odlično platformo!', '2024-06-17', 1, 5),
('Pritožba glede rezervacije', 'Napačen datum na potrditvi rezervacije.', '2024-07-21', 2, 4);

-- 5. Rezervacije
INSERT INTO "Rezervacija" ("Datum_rezervacije", "TK_Nepremicnina", "TK_Uporabnik") VALUES
('2024-05-01', 1, 2),
('2024-05-02', 1, 3),
('2024-06-01', 2, 3),
('2024-08-01', 4, 5),
('2024-09-01', 5, 2),
('2024-04-10', 7, 2),
('2024-04-05', 8, 5);

-- za vsako nepremičnino dodamo forum (dodatno delo zaradi krožnih povezav)
UPDATE "Nepremicnine" SET "TK_Forum" = 1 WHERE "ID_Nepremicnina" = 1;
UPDATE "Nepremicnine" SET "TK_Forum" = 2 WHERE "ID_Nepremicnina" = 2;
UPDATE "Nepremicnine" SET "TK_Forum" = 3 WHERE "ID_Nepremicnina" = 3;
UPDATE "Nepremicnine" SET "TK_Forum" = 4 WHERE "ID_Nepremicnina" = 4;
UPDATE "Nepremicnine" SET "TK_Forum" = 5 WHERE "ID_Nepremicnina" = 5;

-- 6. Ocene nastanitev (TK_Rezervacija kaže na Rezervacija.ID_Rezervacija)
INSERT INTO "Ocena" ("TK_Forum", "Besedilo", "Ime_uporabnika", "TK_Uporabnik", "Ocena", "TK_Rezervacija") VALUES
(1, 'Odlična nastanitev, priporočam!', 'Luka_King', 2, 5, 1),
(3, 'Zamude pri komunikaciji z lastnikom.', 'Ana_Pro', 3, 3, 3),
(4, 'Zelo ugodna cena za tako lepo hišo.', 'Ghost_Player', 5, 4, 5),
(5, 'Lastnik ni bil odziven.', 'Luka_King', 2, 2, 6),
(2, 'Vrhunska izkušnja, vrnili se bomo.', 'Ghost_Player', 5, 5, 7);


--Dodaj še povpraševanja!

-- 1. Katere nepremičnine so najbolj rentane (glede na trenutno zasedenost
--    kapacitete) — enaka logika kot uporablja GET /api/statistika/top
SELECT
    n."Ime_nepremicnine",
    n."Lokacija",
    n."Trenutno_gostov"    AS Trenutno_gostov,
    n."Max_gostov"         AS Kapaciteta,
    ROUND(100.0 * n."Trenutno_gostov" / NULLIF(n."Max_gostov", 0), 1) AS Zasedenost_pct
FROM "Nepremicnine" n
ORDER BY Zasedenost_pct DESC;

-- 2. Kateri najemniki imajo največ rezervacij
SELECT
    u."Username"                AS Najemnik,
    COUNT(r."ID_Rezervacija")   AS Stevilo_rezervacij
FROM "Uporabnik" u
JOIN "Rezervacija" r ON u."ID_Uporabnik" = r."TK_Uporabnik"
GROUP BY u."ID_Uporabnik", u."Username"
ORDER BY Stevilo_rezervacij DESC;

-- 3. Povprečna ocena po nepremičnini
SELECT
    n."Ime_nepremicnine",
    ROUND(AVG(o."Ocena"), 2) AS Povprecna_ocena,
    COUNT(o."ID_Ocena")      AS Stevilo_ocen
FROM "Nepremicnine" n
JOIN "Rezervacija" r ON r."TK_Nepremicnina" = n."ID_Nepremicnina"
JOIN "Ocena" o        ON o."TK_Rezervacija" = r."ID_Rezervacija"
GROUP BY n."ID_Nepremicnina", n."Ime_nepremicnine"
ORDER BY Povprecna_ocena DESC;