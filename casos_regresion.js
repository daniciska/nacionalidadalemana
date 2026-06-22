/* =========================================================================
   Test de regresión del motor de evaluación (index.html)
   Uso:  node casos_regresion.js
   Lee el motor REAL desde index.html, corre los 20 casos validados y
   compara el veredicto contra el esperado. Sale con código !=0 si algo falla.
   ========================================================================= */
const fs = require("fs");
const path = require("path");

// ---- 1. Extraer el motor desde index.html (sin la llamada final a render) ----
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
let engine = html.match(/<script>([\s\S]*?)<\/script>/)[1].trim().replace(/render\(\);\s*$/, "");

// stubs por si algún cuerpo de función referencia el DOM (no se ejecutan)
global.document = { getElementById: () => ({ style:{}, classList:{toggle(){}}, textContent:"", innerHTML:"" }), documentElement:{} };
global.localStorage = { getItem: () => null, setItem(){} };
global.fetch = () => Promise.resolve({ ok:true });

// Evaluar el motor y exponer accesores en el mismo ámbito
eval(engine + `
  global.__analyze = analyze;
  global.__blank = blank;
  global.__setState = (s) => { state = Object.assign(blank(), s); };
`);

// ---- 2. Helpers de construcción ----
const ap = (n,y,c)=>({name:n,birthYear:y,country:c});
const L  = (rel,n,y,c,w,gc,mar)=>({rel,name:n,birthYear:y,country:c,childInWedlock:w,germanCitizen:gc,marriageYear:mar});
const sig = (vias)=> vias.map(v=>v.k+":"+v.state).sort();

// ---- 3. Los 20 casos validados (descripción · estado · veredicto esperado) ----
const CASES = [
 {id:"01", desc:"Línea paterna limpia, emig. post-1914",
  st:{applicant:ap("Ana",1995,"chile"),chain:[L("padre","Roberto",1965,"chile","si"),L("padre","Karl",1935,"chile","si"),L("padre","Hans",1905,"alemania","si")],facts:{emigYear:"post1914",natz25:"automatica",persecution:"no"}},
  expect:["A:VIABLE"]},
 {id:"02", desc:"Madre alemana, hija 1960 (matrimonial)",
  st:{applicant:ap("Juan",1988,"argentina"),chain:[L("madre","Claudia",1960,"argentina","si"),L("madre","Erika",1930,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO","C:VIABLE"]},
 {id:"03", desc:"Alemán naturalizado antes del nacimiento del hijo",
  st:{applicant:ap("Paula",1985,"brasil"),chain:[L("padre","Ricardo",1948,"brasil","si"),L("padre","Otto",1910,"alemania","si")],facts:{emigYear:"post1914",natz25:"noeu_apeticion",persecution:"no"}},
  expect:["A:POCO"]},
 {id:"04", desc:"Bisabuelo; quiebre materno en Pedro 1956",
  st:{applicant:ap("Diego",2010,"chile"),chain:[L("madre","Carolina",1988,"chile","si"),L("padre","Pedro",1956,"chile","si"),L("madre","Elena",1927,"chile","si"),L("padre","Friedrich",1898,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO","C:VIABLE"]},
 {id:"05", desc:"Hijo no matrimonial 1938 (antes de 1949 → sin §5)",
  st:{applicant:ap("Sofia",2002,"uruguay"),chain:[L("madre","Laura",1970,"uruguay","si"),L("padre","Miguel",1938,"uruguay","si"),L("padre","Wilhelm",1909,"alemania","no")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO"]},
 {id:"06", desc:"Madre alemana, hija 1965",
  st:{applicant:ap("Andres",1995,"chile"),chain:[L("madre","Patricia",1965,"chile","si"),L("madre","Ingrid",1938,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO","C:VIABLE"]},
 {id:"07", desc:"Persecución nazi (privación 116(2))",
  st:{applicant:ap("Camila",2001,"chile"),chain:[L("padre","Daniel",1970,"chile","si"),L("madre","Ruth",1942,"chile","si"),L("padre","David",1915,"alemania","si")],facts:{emigYear:"post1914",persecution:"si",persecution_type:"d116",natz25:"automatica"}},
  expect:["A:POCO","B:VIABLE"]},
 {id:"08", desc:"Alemana pierde nacionalidad por matrimonio (pre-1953)",
  st:{applicant:ap("Sol",2000,"chile"),chain:[L("madre","Nieta",1975,"chile","si"),L("madre","Hija",1948,"chile","si"),L("madre","Helga",1920,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"no",marriageloss:"si"}},
  expect:["A:POCO","C:DUDOSO"]},
 {id:"09", desc:"Naturalización estadounidense 1955",
  st:{applicant:ap("Sol",2004,"usa"),chain:[L("padre","P1982",1982,"usa","si"),L("padre","Hijo",1957,"usa","si"),L("padre","Heinrich",1922,"alemania","si")],facts:{emigYear:"post1914",natz25:"noeu_apeticion",persecution:"no"}},
  expect:["A:POCO"]},
 {id:"10", desc:"No matrimonial, padre alemán, hijo 1972 (§5)",
  st:{applicant:ap("Nieta",2003,"chile"),chain:[L("padre","Jorge",1972,"chile","si"),L("padre","Klaus",1940,"alemania","no")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO","C:VIABLE"]},
 {id:"11", desc:"Alemán mantiene pasaporte toda la vida",
  st:{applicant:ap("Bisnieta",2005,"chile"),chain:[L("padre","Nieto",1980,"chile","si"),L("padre","Hijo",1955,"chile","si"),L("padre","Georg",1930,"alemania","si")],facts:{emigYear:"post1914",matrikel:"si",persecution:"no",natz25:"automatica"}},
  expect:["A:VIABLE"]},
 {id:"12", desc:"Adopción internacional del nieto",
  st:{applicant:ap("Sol",2002,"chile"),chain:[L("padre","Adoptado",1995,"chile","si"),L("padre","HijoBio",1978,"chile","si"),L("padre","Thomas",1950,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica",adoption:"si"}},
  expect:["A:DUDOSO"]},
 {id:"13", desc:"Descendencia 100% femenina, quiebre Eva 1950",
  st:{applicant:ap("Sofia",2000,"chile"),chain:[L("madre","Maria",1976,"chile","si"),L("madre","Eva",1950,"chile","si"),L("madre","Gertrud",1925,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO","C:VIABLE"]},
 {id:"14", desc:"Emigración a Sudáfrica 1933, paterna",
  st:{applicant:ap("Sol",2000,"sudafrica"),chain:[L("padre","Nieto",1970,"sudafrica","si"),L("padre","Hijo",1940,"sudafrica","si"),L("padre","Albert",1912,"alemania","si")],facts:{emigYear:"post1914",natz25:"no",persecution:"no"}},
  expect:["A:VIABLE"]},
 {id:"15", desc:"Nieto de alemana discriminada (hija 1962)",
  st:{applicant:ap("Nieto",1990,"chile"),chain:[L("madre","Hija",1962,"chile","si"),L("madre","Ursula",1936,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO","C:VIABLE"]},
 {id:"16", desc:"Alemán nacido fuera de Alemania (ciudadano)",
  st:{applicant:ap("Nieto",2005,"chile"),chain:[L("padre","Hijo",1975,"chile","si"),L("padre","Peter",1945,"chile","si","si")],facts:{emigYear:"no_emig",persecution:"no",natz25:"automatica"}},
  expect:["A:VIABLE"]},
 {id:"17", desc:"Doble línea alemana (sin fechas) → investigar",
  st:{applicant:ap("Solicitante","","chile"),chain:[L("padre","HansVogel","","alemania","si")],facts:{emigYear:"ns",persecution:"no",natz25:"ns"}},
  expect:["A:INFO"]},
 {id:"18", desc:"Emigración muy antigua 1901 → verificar Matrikel",
  st:{applicant:ap("Sol",1995,"chile"),chain:[L("padre","G1965",1965,"chile","si"),L("padre","G1935",1935,"chile","si"),L("padre","G1905",1905,"chile","si"),L("padre","Johann",1878,"alemania","si")],facts:{emigYear:"pre1904",matrikel:"ns",natz1914:"no",persecution:"no",natz25:"automatica"}},
  expect:["A:INFO"]},
 {id:"19", desc:"Padre alemán no reconocido al nacer (hija 1988, §5)",
  st:{applicant:ap("Nieta",2015,"chile"),chain:[L("madre","Hija",1988,"chile","si"),L("padre","Markus",1960,"alemania","no")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO","C:VIABLE"]},
 {id:"20", desc:"Caso extremo (no matrim. materno + adopción)",
  st:{applicant:ap("Benjamin",2022,"chile"),chain:[L("madre","Daniela",1994,"chile","si"),L("padre","Ricardo",1969,"chile","si"),L("madre","Marta",1947,"chile","no"),L("madre","Elsa",1918,"chile","no"),L("padre","Wilhelm",1889,"alemania","si")],facts:{emigYear:"1904_1913",matrikel:"si",persecution:"no",natz25:"automatica",adoption:"si"}},
  expect:["A:DUDOSO"]},
 {id:"21", desc:"Naturalización DESPUÉS del nacimiento del hijo (sin pérdida)",
  st:{applicant:ap("S",1985,"brasil"),chain:[L("padre","H",1948,"brasil","si"),L("padre","Ot",1910,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"noeu_apeticion",natz25_when:"despues"}},
  expect:["A:VIABLE"]},
 {id:"22", desc:"Naturalización ANTES del nacimiento del hijo (pérdida)",
  st:{applicant:ap("S",1985,"brasil"),chain:[L("padre","H",1948,"brasil","si"),L("padre","Ot",1910,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"noeu_apeticion",natz25_when:"antes"}},
  expect:["A:POCO"]},
 {id:"23", desc:"Estado civil de los padres desconocido → investigar",
  st:{applicant:ap("S",1968,"chile"),chain:[L("madre","M",1940,"alemania","ns")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:INFO"]},
 {id:"24", desc:"Adopción siendo adulto (no transmite)",
  st:{applicant:ap("S",2000,"chile"),chain:[L("padre","M",1975,"chile","si"),L("padre","T",1950,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica",adoption:"si",adoption_age:"adulto"}},
  expect:["A:POCO"]},
 {id:"25", desc:"Servicio militar voluntario extranjero (§28)",
  st:{applicant:ap("S",1990,"chile"),chain:[L("padre","P",1962,"chile","si"),L("padre","Ab",1935,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica",mil28:"si"}},
  expect:["A:DUDOSO"]},
 {id:"26", desc:"Naturalización con permiso de conservación (Beibehaltung)",
  st:{applicant:ap("S",1985,"chile"),chain:[L("padre","P",1957,"chile","si"),L("padre","Ab",1925,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"con_permiso"}},
  expect:["A:VIABLE"]},
 {id:"27", desc:"Pérdida por matrimonio sin §5 duplicado",
  st:{applicant:ap("S",1990,"chile"),chain:[L("madre","H",1955,"chile","si"),L("madre","He",1925,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica",marriageloss:"si"}},
  expect:["A:POCO","C:DUDOSO"]},
 {id:"28", desc:"Año de nacimiento del ancestro alemán faltante → investigar",
  st:{applicant:ap("Paula",2000,"chile"),chain:[L("padre","P",1970,"chile","si"),L("padre","Anc","","alemania","si")],facts:{emigYear:"ns",persecution:"no",natz25:"automatica"}},
  expect:["A:INFO"]},
 {id:"29", desc:"Timing de naturalización desconocido → investigar",
  st:{applicant:ap("Daniela",1985,"chile"),chain:[L("padre","Hijo",1958,"chile","si"),L("padre","Klaus",1925,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"noeu_apeticion",natz25_when:"ns"}},
  expect:["A:INFO"]},
 {id:"30", desc:"Legitimación por matrimonio posterior (hijo 1951, casan 1953)",
  st:{applicant:ap("Camila",1990,"chile"),chain:[L("padre","Hijo",1951,"chile","si"),L("padre","Anc",1925,"alemania","no",undefined,"1953")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:DUDOSO"]},
 {id:"31", desc:"Año de matrimonio resuelve estado civil desconocido",
  st:{applicant:ap("Daniel",1995,"chile"),chain:[L("padre","Ricardo",1962,"chile","si"),L("padre","Johann",1935,"alemania","ns",undefined,"1958")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:VIABLE"]},
 {id:"32", desc:"Reconocimiento de padre alemán, nacido post-1993",
  st:{applicant:ap("Antonia",1994,"chile"),chain:[L("padre","Anc",1965,"alemania","no")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:VIABLE"]},
 {id:"33", desc:"Persecución nazi pero emigró antes de 1933 (restitución dudosa)",
  st:{applicant:ap("S",1985,"chile"),chain:[L("padre","P",1955,"chile","si"),L("padre","Ab",1900,"alemania","si")],facts:{emigYear:"1914_1932",persecution:"si",persecution_type:"d116",natz25:"automatica"}},
  expect:["A:VIABLE","B:DUDOSO"]},
 {id:"34", desc:"Persecución nazi con emigración en la era nazi (restitución viable)",
  st:{applicant:ap("S",1985,"chile"),chain:[L("padre","P",1955,"chile","si"),L("padre","Ab",1915,"alemania","si")],facts:{emigYear:"nazi_era",persecution:"si",persecution_type:"d116",natz25:"automatica"}},
  expect:["A:POCO","B:VIABLE"]},
 {id:"35", desc:"Sin raíz alemana confirmada + persecución 'sí' → NO debe dar prometedor (solo investigar)",
  st:{applicant:ap("S",1985,"chile"),chain:[L("padre","P",1955,"chile","ns"),L("padre","Ab",1920,"chile","ns")],facts:{emigYear:"ns",persecution:"si",persecution_type:"d116",natz25:"automatica"}},
  expect:["X:INFO"]},
 {id:"36", desc:"Sin raíz alemana confirmada + vive en Alemania → investigar + §10 residencia",
  st:{applicant:ap("S",1985,"chile"),chain:[L("padre","P",1955,"chile","ns")],facts:{emigYear:"ns",persecution:"ns",natz25:"automatica",lives:"si"}},
  expect:["D:DUDOSO","X:INFO"]},
 {id:"37", desc:"Adopción por persona (adulto) → no transmite (POCO)",
  st:{applicant:ap("S",2000,"chile"),chain:[Object.assign(L("padre","M",1975,"chile","si"),{adopted:"si",adoptedAge:"adulto"}),L("padre","T",1950,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:POCO"]},
 {id:"38", desc:"Servicio militar por persona → baja a DUDOSO",
  st:{applicant:Object.assign(ap("S",1990,"chile"),{military:"si"}),chain:[L("padre","P",1962,"chile","si"),L("padre","Ab",1935,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:DUDOSO"]},
 {id:"39", desc:"Caso real: adopción en la línea sin saber la edad del adoptado → no debe pasar como viable sin revisión (DUDOSO)",
  st:{applicant:ap("S",2000,"chile"),chain:[Object.assign(L("padre","M",1975,"chile","si"),{adopted:"si",adoptedAge:"ns"}),L("padre","T",1950,"alemania","si")],facts:{emigYear:"post1914",persecution:"no",natz25:"automatica"}},
  expect:["A:DUDOSO"]},
 {id:"40", desc:"Caso real: no se sabe si hubo un alemán y nadie nació en Alemania (todo 'no sé') → solo investigar, jamás prometedor",
  st:{applicant:ap("S",1985,"chile"),chain:[L("padre","P",1955,"chile","ns"),L("padre","Ab",1925,"chile","ns")],facts:{emigYear:"ns",persecution:"ns",natz25:"ns"}},
  expect:["X:INFO"]},
 {id:"41", desc:"Caso real: corte por mujer (madre) pero SIN raíz alemana confirmada → NO debe ofrecer §5 (solo investigar)",
  st:{applicant:ap("Nieto",1970,"chile"),chain:[L("madre","Rosa Calderon",1945,"chile","si"),L("madre","Bisabuela",1920,"chile","ns")],facts:{emigYear:"ns",persecution:"ns",natz25:"ns"}},
  expect:["X:INFO"]},
];

// ---- 4. Correr y comparar ----
let pass=0, fail=0;
console.log("\n  Test de regresión — 20 casos\n  " + "─".repeat(60));
for(const c of CASES){
  global.__setState(c.st);
  const got = sig(global.__analyze().vias);
  const exp = [...c.expect].sort();
  const ok = JSON.stringify(got)===JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(`  ${ok?"✅":"❌"} ${c.id}  ${c.desc}`);
  if(!ok) console.log(`        esperado: [${exp}]\n        obtenido: [${got}]`);
}
console.log("  " + "─".repeat(60));
console.log(`  ${pass}/${CASES.length} OK` + (fail?`  · ${fail} FALLARON ⚠️`:"  · todo en verde 🎉") + "\n");
process.exitCode = fail ? 1 : 0;
