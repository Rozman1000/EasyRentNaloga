
-- brisanje tabel
DROP TABLE IF EXISTS "Feedback" CASCADE;
DROP TABLE IF EXISTS "Prijava" CASCADE;
DROP TABLE IF EXISTS "Forum" CASCADE;
DROP TABLE IF EXISTS "Obvestila" CASCADE;
DROP TABLE IF EXISTS "Nagrada" CASCADE;
DROP TABLE IF EXISTS "Turnir" CASCADE;
DROP TABLE IF EXISTS "Moderacija" CASCADE;
DROP TABLE IF EXISTS "Igra" CASCADE;
DROP TABLE IF EXISTS "Bracket" CASCADE;
DROP TABLE IF EXISTS "Gost" CASCADE;


-- ustvarjanje tabel

-- Katalog tipov nepremičnin (prej: katalog video-iger)
CREATE TABLE "Igra" (
                        "ID_Igra"      SERIAL PRIMARY KEY,
                        "Naslov_igre"  VARCHAR(255) NOT NULL, -- npr. "Hiša", "Apartma", "Vila", "Kabina"
                        "Žanr"         VARCHAR(255) NOT NULL, -- npr. kategorija: "Družinska", "Luksuzna", "Mestna"
                        "Platforma"    VARCHAR(255) NOT NULL  -- npr. dodatna oznaka: "Samostojna hiša", "Večstanovanjska"
);

-- "Paket pogojev najema", vezan na nepremičnino (prej: format turnirskega bracketa)
CREATE TABLE "Bracket" (
                           "ID_Bracket"  SERIAL PRIMARY KEY,
                           "Tip_sistema" VARCHAR(255) NOT NULL, -- npr. "Kratkoročni najem", "Dolgoročni najem"
                           "Št_krogov"   INTEGER      NOT NULL, -- npr. minimalno število noči
                           "Pravila"     VARCHAR(255) NOT NULL  -- npr. hišni red / pogoji bivanja
);

-- Uporabniki platforme (najemniki, lastniki, administratorji)
CREATE TABLE "Gost" (
                        "ID_Uporabniki" SERIAL PRIMARY KEY,
                        "Username"      VARCHAR(255) NOT NULL,
                        "Email"         VARCHAR(255) NOT NULL,
                        "Geslo"         VARCHAR(255) NOT NULL,
                        "Vloga"         VARCHAR(255) NOT NULL, -- 'najemnik' | 'lastnik' | 'administrator' | 'blokiran'
                        "Drzava"        VARCHAR(255)           -- NOVO: prej shranjeno v odstranjeni tabeli "Igralci"
);

CREATE TABLE "Moderacija" (
                              "ID_Moderacija" SERIAL PRIMARY KEY,
                              "TK_Turnir"     INTEGER      NOT NULL, -- nepremičnina/vsebina, na katero se ukrep nanaša
                              "Datum"         DATE         NOT NULL,
                              "Razlog"        VARCHAR(255) NOT NULL,
                              "Vrsta_ukrepa"  VARCHAR(255) NOT NULL
);

-- Nepremičnine za najem (prej: turnirji)
CREATE TABLE "Turnir" (
                          "ID_Turnir"     SERIAL PRIMARY KEY,
                          "TK_Uporabniki" INTEGER      NOT NULL, -- lastnik, ki je nepremičnino objavil
                          "TK_Igra"       INTEGER      NOT NULL, -- tip nepremičnine (glej tabelo "Igra")
                          "TK_Forum"      INTEGER,
                          "TK_Bracket"    INTEGER      NOT NULL, -- paket pogojev najema
                          "Ime_turnirja"  VARCHAR(255) NOT NULL, -- naziv nepremičnine
                          "Opis"          VARCHAR(255),
                          "Datum"         DATE         NOT NULL, -- na voljo od
                          "Lokacija"      VARCHAR(255) NOT NULL,
                          "Status"        VARCHAR(255) NOT NULL, -- 'live' (prosto) | 'upcoming' (kmalu prosto) | 'completed' (zasedeno) | 'blokiran'
                          "Lat"           VARCHAR(255) NOT NULL, -- zemljepisna širina (za Google Maps)
                          "Lng"           VARCHAR(255) NOT NULL, -- zemljepisna dolžina (za Google Maps)
                          "Max_ekip"      INTEGER      NOT NULL, -- kapaciteta (največje število gostov)
                          "Prijavljene_ekipe" INTEGER  NOT NULL, -- trenutno nastanjenih/rezerviranih gostov
                          "Nagradni_sklad"    VARCHAR(255) NOT NULL -- cena najema na noč (€)
);

-- Promocijski popusti/nagrade za posamezno nepremičnino (prej: turnirske nagrade)
CREATE TABLE "Nagrada" (
                           "ID_Nagrada"           SERIAL PRIMARY KEY,
                           "TK_Turnir"            INTEGER      NOT NULL,
                           "Vrsta_nagrade"        VARCHAR(255) NOT NULL,
                           "Vrednost"             INTEGER      NOT NULL,
                           "Uvrstitev_za_nagrado" SMALLINT     NOT NULL
);

CREATE TABLE "Obvestila" (
                             "ID_Obvestila"  SERIAL PRIMARY KEY,
                             "TK_Turnir"     INTEGER      NOT NULL,
                             "Vsebina"       VARCHAR(255) NOT NULL,
                             "Tip_obvestila" INTEGER      NOT NULL,
                             "TK_Gost"       INTEGER      NOT NULL
);

CREATE TABLE "Forum" (
                         "ID_Forum"                SERIAL PRIMARY KEY,
                         "Naslov"                  VARCHAR(255) NOT NULL,
                         "Vsebina"                 VARCHAR(255) NOT NULL,
                         "Datum_objave"            DATE         NOT NULL,
                         "ModeracijaID_Moderacija" INTEGER      NOT NULL,
                         "UporabnikiID_Uporabniki" INTEGER
);

-- Rezervacije (prej: prijava EKIPE na turnir — zdaj rezervira POSAMEZNIK)
CREATE TABLE "Prijava" (
                           "ID_Prijava"         SERIAL PRIMARY KEY,
                           "Datum_prijave"      DATE         NOT NULL, -- datum rezervacije
                           "TK_Turnir"          INTEGER      NOT NULL, -- rezervirana nepremičnina
                           "TK_Gost"            INTEGER      NOT NULL  -- uporabnik, ki je rezerviral (prej: TK_Ekipe)
                           -- OPOMBA: stolpec "TK_Turnir2" (podvojen tuji ključ na Turnir, verjetno
                           -- napaka v prejšnji shemi) je bil odstranjen.
);

-- Ocene nastanitev (prej: ocene turnirjev/igralcev)
CREATE TABLE "Feedback" (
                            "ID_Komentarji"  SERIAL PRIMARY KEY,
                            "TK_Forum"       INTEGER,
                            "Besedilo"       VARCHAR(255) NOT NULL,
                            "Ime_uporabnika" VARCHAR(255) NOT NULL,
                            "TK_Uporabniki"  INTEGER,
                            "Ocena"          SMALLINT     NOT NULL CHECK ("Ocena" BETWEEN 1 AND 5),
                            "TK_Igralci"     INTEGER      NOT NULL, -- kaže na "Prijava"("ID_Prijava") — glej opombo zgoraj
                            "ForumID_Forum"  INTEGER      NOT NULL
);


-- tuji ključi
ALTER TABLE "Turnir"      ADD CONSTRAINT fk_turnir_gost          FOREIGN KEY ("TK_Uporabniki")           REFERENCES "Gost"("ID_Uporabniki");
ALTER TABLE "Turnir"      ADD CONSTRAINT fk_turnir_igra          FOREIGN KEY ("TK_Igra")                 REFERENCES "Igra"("ID_Igra");
ALTER TABLE "Turnir"      ADD CONSTRAINT fk_turnir_bracket       FOREIGN KEY ("TK_Bracket")              REFERENCES "Bracket"("ID_Bracket");
ALTER TABLE "Turnir"      ADD CONSTRAINT fk_turnir_forum         FOREIGN KEY ("TK_Forum")                REFERENCES "Forum"("ID_Forum");
ALTER TABLE "Nagrada"     ADD CONSTRAINT fk_nagrada_turnir       FOREIGN KEY ("TK_Turnir")               REFERENCES "Turnir"("ID_Turnir");
ALTER TABLE "Obvestila"   ADD CONSTRAINT fk_obvestila_turnir     FOREIGN KEY ("TK_Turnir")               REFERENCES "Turnir"("ID_Turnir");
ALTER TABLE "Obvestila"   ADD CONSTRAINT fk_obvestila_gost       FOREIGN KEY ("TK_Gost")                 REFERENCES "Gost"("ID_Uporabniki");
ALTER TABLE "Forum"       ADD CONSTRAINT fk_forum_moderacija     FOREIGN KEY ("ModeracijaID_Moderacija") REFERENCES "Moderacija"("ID_Moderacija");
ALTER TABLE "Moderacija"  ADD CONSTRAINT fk_moderacija_turnir    FOREIGN KEY ("TK_Turnir")               REFERENCES "Turnir"("ID_Turnir");
ALTER TABLE "Prijava"     ADD CONSTRAINT fk_prijava_turnir       FOREIGN KEY ("TK_Turnir")               REFERENCES "Turnir"("ID_Turnir");
ALTER TABLE "Prijava"     ADD CONSTRAINT fk_prijava_gost         FOREIGN KEY ("TK_Gost")                 REFERENCES "Gost"("ID_Uporabniki");
ALTER TABLE "Feedback"    ADD CONSTRAINT fk_feedback_prijava     FOREIGN KEY ("TK_Igralci")              REFERENCES "Prijava"("ID_Prijava");
ALTER TABLE "Feedback"    ADD CONSTRAINT fk_feedback_forum       FOREIGN KEY ("ForumID_Forum")           REFERENCES "Forum"("ID_Forum");


-- 1. Osnovne tabele

-- Tipi nepremičnin (prej: video-igre)
INSERT INTO "Igra" ("Naslov_igre", "Žanr", "Platforma") VALUES
('Hiša',    'Družinska', 'Samostojna hiša'),
('Apartma', 'Mestna',    'Večstanovanjska stavba'),
('Vila',    'Luksuzna',  'Samostojna hiša'),
('Kabina',  'Počitniška','Lesena koča'),
('Apartma', 'Študentska','Večstanovanjska stavba'),
('Hiša',    'Kmečka',    'Samostojna hiša');

-- Paketi pogojev najema (prej: bracket formati)
INSERT INTO "Bracket" ("Tip_sistema", "Št_krogov", "Pravila") VALUES
('Kratkoročni najem', 1,  'Minimalno 1 noč, brez hišnih ljubljenčkov'),
('Dolgoročni najem',  30, 'Minimalno 30 dni, dovoljeni hišni ljubljenčki'),
('Kratkoročni najem', 2,  'Minimalno 2 noči, kajenje prepovedano'),
('Vikend najem',      3,  'Minimalno 3 noči, samo vikendi'),
('Kratkoročni najem', 1,  'Minimalno 1 noč, brez zabav in prireditev'),
('Dolgoročni najem',  90, 'Minimalno 90 dni, primerno za družine'),
('Kratkoročni najem', 5,  'Minimalno 5 noči, primerno za skupine do 10 oseb');

INSERT INTO "Gost" ("Username", "Email", "Geslo", "Vloga", "Drzava") VALUES
('Admin_Marko', 'marko@easyrent.si', '$2b$10$IIHhqe9tKP58pnLVKBZGIudpI7n3gEEF1FnZCRy8FCRmU2gvdo.7G', 'Administrator', 'Slovenija'), --test: geslo123
('Luka_King', 'luka@gmail.com', '$2b$10$J2Kk1GdLn84aeg.3Wn6d..yUHMykaXWiLK3N6b3VObk/dajb2RYKC', 'najemnik', 'Slovenija'),--test: luka123
('Ana_Pro', 'ana.pro@yahoo.com', '$2b$10$2qbfzBsd1SC7BM65UaXG/.qukYggO3OLt/BAZVuyxwwvdxpm5//fW', 'najemnik', 'Hrvaška'),--test: anabanana
('Team_Manager', 'manager@easyrent.si', '$2b$10$LkQlG6H4tQ1Z2aYnz1p9IeW3eq7RHohiQ2zoebM/dhY4.2nAbQt6i', 'lastnik', 'Slovenija'), --test: manager123
('Ghost_Player', 'ghost@gmail.com', '$2b$10$02N.hFJA58HCyutbEsoQOOtzgKAB7d2RlxObqrykswBKryT4Cgxj2', 'najemnik', 'Italija');--test: hidden123

-- 2. Nepremičnine
INSERT INTO "Turnir" ("TK_Uporabniki", "TK_Igra", "TK_Bracket", "Ime_turnirja", "Opis", "Datum", "Lokacija","Status","Lat","Lng","Max_ekip","Prijavljene_ekipe","Nagradni_sklad") VALUES
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

-- 3. Nagrade/popusti, Obvestila in Moderacija
INSERT INTO "Nagrada" ("TK_Turnir", "Vrsta_nagrade", "Vrednost", "Uvrstitev_za_nagrado") VALUES
(1, 'Popust za zgodnjo rezervacijo', 10, 1),
(1, 'Popust za daljše bivanje', 15, 2),
(2, 'Brezplačen zajtrk', 0, 1),
(4, 'Darilni bon', 20, 3),
(5, 'Popust za stalne goste', 5, 1);

INSERT INTO "Obvestila" ("TK_Turnir", "Vsebina", "Tip_obvestila", "TK_Gost") VALUES
(1, 'Rezervacije so odprte!', 1, 1),
(2, 'Cena najema je bila posodobljena.', 2, 4),
(1, 'Vaša rezervacija se potrdi v 15 minutah.', 3, 2),
(4, 'Rezervacija preklicana s strani najemnika.', 4, 1),
(5, 'Nepremičnina začasno ni na voljo.', 2, 5);

INSERT INTO "Moderacija" ("TK_Turnir", "Datum", "Razlog", "Vrsta_ukrepa") VALUES
(1, '2024-06-01', 'Neprimerno vedenje v komentarjih', 'Warning'),
(2, '2024-07-01', 'Lažna objava nepremičnine', 'Ban'),
(4, '2024-09-01', 'Neustrezen naziv objave', 'Force change'),
(1, '2024-06-10', 'Spamanje v komentarjih', 'Mute'),
(2, '2024-07-05', 'Deljenje računa med več uporabniki', 'Permanent Ban');

-- 4. Forum
INSERT INTO "Forum" ("Naslov", "Vsebina", "Datum_objave", "ModeracijaID_Moderacija", "UporabnikiID_Uporabniki") VALUES
('Pravila skupnosti', 'Prosimo, preberite pravila pred objavo.', '2024-05-20', 1, 1),
('Iščem sostanovalca', 'Iščem mirnega sostanovalca za deljeno stanovanje.', '2024-05-21', 4, 2),
('Težave s spletno stranjo', 'Stran se občasno ne odziva.', '2024-06-16', 3, 3),
('Uspešna izkušnja', 'Čestitke ekipi Easy Rent za odlično platformo!', '2024-06-17', 1, 5),
('Pritožba glede rezervacije', 'Napačen datum na potrditvi rezervacije.', '2024-07-21', 2, 4);

-- 5. Rezervacije (prej: prijava ekip na turnirje — zdaj rezervacije posameznikov)
INSERT INTO "Prijava" ("Datum_prijave", "TK_Turnir", "TK_Gost") VALUES
('2024-05-01', 1, 2),
('2024-05-02', 1, 3),
('2024-06-01', 2, 3),
('2024-08-01', 4, 5),
('2024-09-01', 5, 2),
('2024-04-10', 7, 2),
('2024-04-05', 8, 5);

-- za vsako nepremičnino dodamo forum (dodatno delo zaradi krožnih povezav)
UPDATE "Turnir" SET "TK_Forum" = 1 WHERE "ID_Turnir" = 1;
UPDATE "Turnir" SET "TK_Forum" = 2 WHERE "ID_Turnir" = 2;
UPDATE "Turnir" SET "TK_Forum" = 3 WHERE "ID_Turnir" = 3;
UPDATE "Turnir" SET "TK_Forum" = 4 WHERE "ID_Turnir" = 4;
UPDATE "Turnir" SET "TK_Forum" = 5 WHERE "ID_Turnir" = 5;

-- 6. Ocene nastanitev (TK_Igralci zdaj kaže na Prijava.ID_Prijava — glej opombo na vrhu)
INSERT INTO "Feedback" ("TK_Forum", "Besedilo", "Ime_uporabnika", "TK_Uporabniki", "Ocena", "TK_Igralci", "ForumID_Forum") VALUES
(1, 'Odlična nastanitev, priporočam!', 'Luka_King', 2, 5, 1, 1),
(3, 'Zamude pri komunikaciji z lastnikom.', 'Ana_Pro', 3, 3, 3, 3),
(4, 'Zelo ugodna cena za tako lepo hišo.', 'Ghost_Player', 5, 4, 5, 4),
(5, 'Lastnik ni bil odziven.', 'Luka_King', 2, 2, 6, 5),
(2, 'Vrhunska izkušnja, vrnili se bomo.', 'Ghost_Player', 5, 5, 7, 2);


--Dodaj še povpraševanja!