const bcrypt = require('bcryptjs'); //to knjižnico si mores na racunalnik
// instalirat z "npm install bcryptjs" 

async function registrirajUporabnika(username, email, geslo) {
    const saltRounds = 10; // kao naredi 10 krogov procesiranja
    
    //naredi actual hash, oz. ta funkcija doda salt kar so dodatne crke pri 
    //geslu ki jih sistem sam doda za boljso varnost. Uporabnik pa se vedno rabi
    //dat samo svoj original password in ne sistem ne uporabnik(ta tudi ne rabi vedet) ne vedo tocno kaj ta crka je.
    const hashedPassword = await bcrypt.hash(geslo, saltRounds);
    return hashedPassword;
}   // hash geslja je ustvarjen, in bo shranjen v bazo podatkov pod "Gost"

async function prijaviUporabnika(vnesenoGeslo, hashIzBaze) {
    // primerja hash pa geslo in ce se ujema je ok, ce ne pa nah.
    const isMatch = await bcrypt.compare(vnesenoGeslo, hashIzBaze);
    return isMatch;
}

module.exports = {registrirajUporabnika, prijaviUporabnika};