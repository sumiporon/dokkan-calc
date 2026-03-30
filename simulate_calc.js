const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('dokkan_calc_final.html', 'utf8');
const script = fs.readFileSync('dokkan_calc_final.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "outside-only" });
const document = dom.window.document;

// Mock enough DOM for addScenarioCard
const container = document.getElementById('scenario-cards-container');

// Evaluate the script in the context of the DOM
try {
  dom.window.eval(script);
} catch (e) {
  // It will throw because of some missing browser APIs, but we just want the functions
}

// Just extract the core logic for the damage calculation
const final_def = 3000000;
const d = {
  name: "フリーザ(フルパワー)",
  baseAtk: 750000,
  saMulti: 2.8,
  saBuffMod: 0.5,
  aoeDamage: 0,
  hasSaCrit: true,
  critAtkUp: 0,
  critDefDown: 0
};
const dr_mod = 1.0;
const group1_advantage_status = 'neutral';
const is_guard = false;
const attr_def_up = 0;

const critAtkUpVal = 0; // scenarioData.crit_atk_up
const critDefDownVal = 0;

let atkCritMod_local = 1.0;
let defForCalc = final_def;
let attrMod_local = 1.0;
let guardMod_local = 1.0;

const boostedAtk = 750000;
const trueSaMulti = 3.3;
const atkValue = Math.floor(boostedAtk * trueSaMulti); // 2475000

const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);

if (isCritUnconfigured) {
    console.log("RESULT: -- (Unconfigured)");
} else {
    atkCritMod_local = 1 + (critAtkUpVal / 100);
    defForCalc = final_def * (1 - (critDefDownVal / 100));
    const dmg = Math.max(0, ((atkValue * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
    console.log("RESULT DMG:", dmg);
}

// Now test what happens if critAtkUpVal is 90
const critAtkUpVal90 = 90;
const atkCritMod_local90 = 1 + (critAtkUpVal90 / 100);
const dmg90 = Math.max(0, ((atkValue * atkCritMod_local90) * attrMod_local * dr_mod - final_def)) * guardMod_local;
console.log("RESULT DMG (90%):", dmg90);
