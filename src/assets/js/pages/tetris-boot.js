/* Word Tetris -- letters drop in columns. Type a 3+ letter word
   that matches the top letters of consecutive columns to clear
   them. Grid fills up = game over. */

import { getActive, updateActive } from "../profiles.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";

const COLS = 8, ROWS = 15;
const STAGE_W = 400, STAGE_H = 600;
const CELL = STAGE_W / COLS;
const LETTER_WEIGHTS = "eeeeeeeeeeeeeaaaaaaaaaiiiiiiiiooooooootttttttnnnnnssssssrrrrrhhhhhddddllllccccuuummmwwffgypbvkjxqz";

const COMMON_WORDS = new Set([
  "and","the","for","you","are","but","not","all","can","was","one","out","get","new","two","may","day","let","put","run",
  "his","her","him","she","they","this","that","with","have","from","what","when","make","like","time","just","over","into","more","some","than","then","them","take","also","know","want","tell","call","work","life","year","good","most","look","made","such","very","well","each","find","back","feel","much","seem","keep","help","play","turn","move","need","show","hand","part","case","fact","read","head","next","face","done","week","name","came","sent","line","four","told","high","near","gave","whom","best","both","came","give","held","kept","laid","late","left","less","long","main","mind","nice","once","open","pass","past","real","rest","side","slow","sort","star","step","stop","tend","that","then","they","this","turn","unto","upon","used","very","wait","walk","wall","want","ward","warm","wash","wear","week","well","were","west","what","when","whom","wife","wild","wing","wise","wish","with","wood","word","work","yard","year","your","said","each","much","came","most","sure","seem","kind","find","done","told","both","line","feet","ever","sent","keep","gave","fell","seen","felt","held","ride","time","year",
  "able","across","after","again","along","among","area","army","away","back","ball","band","bank","base","bath","bear","beat","been","beer","bell","belt","bend","best","bike","bill","bird","bite","blow","blue","boat","body","bone","book","boot","born","both","bowl","bowl","brief","bring","broke","broad","build","built","burst","busy","cable","cake","calm","camp","care","cart","case","cash","cast","cell","cent","chain","chair","chase","cheap","check","chest","chief","child","claim","class","clean","clear","clerk","click","cliff","climb","clock","close","cloth","cloud","coach","coast","coat","code","cold","color","comma","cool","copy","corn","cost","could","count","court","cover","crack","craft","crash","cream","creek","crew","crime","cross","crowd","crown","crush","cure","curve","cycle","daily","damp","dance","dare","dark","data","date","dawn","dead","deal","dean","dear","debt","deep","deer","desk","dial","dice","died","dimm","dine","dirt","dish","dock","doer","done","door","dose","draw","drew","drink","drive","drop","drug","drum","duck","dust","each","early","earn","ease","east","easy","eaten","edge","edit","eels","eggs","eight","elder","elect","else","empty","ended","enemy","enjoy","enter","entry","equal","error","every","exact","exist","extra","face","fact","fade","fail","fair","fake","fall","fame","farm","fast","fate","fear","feed","feel","fell","felt","fence","fewer","field","fifth","fifty","fight","file","fill","film","final","find","fine","fire","firm","first","fish","fist","five","flag","flame","flash","flat","flesh","flew","flick","flies","flight","flip","float","flood","floor","flour","flow","flown","fluid","flush","flute","fold","folk","food","fool","foot","force","fork","form","forth","forty","found","four","frame","frank","free","fresh","friend","front","frost","fruit","full","fully","fund","funny","gain","game","gang","gear","gene","ghost","gift","gild","girl","give","glad","glass","goal","goat","gold","good","gosh","gown","grab","grade","grain","grand","grant","grape","grasp","grass","grave","great","green","greet","grew","grid","grief","grim","grip","grit","gross","ground","group","grove","grown","growth","guard","guess","guest","guide","guilt","gulf","habit","hair","half","hall","halt","hand","hang","happy","hard","harm","hash","hate","head","heap","hear","heart","heat","heavy","heel","held","help","hen","herb","here","hero","hers","high","hill","hint","hire","hold","hole","holy","home","honor","hook","hope","horn","horse","host","hour","house","huge","human","hung","hunt","hurt","ice","idea","ill","image","inch","income","index","ink","inn","into","iron","item","jack","jail","jam","jar","jazz","jeep","jewel","job","join","joke","joy","judge","juice","jump","june","just","kept","kick","kid","kill","kind","king","kiss","kiln","knee","knew","knock","know","lab","lace","lack","lady","lake","lamp","land","lane","large","last","late","later","latin","laugh","law","lawn","laws","lay","lazy","lead","leaf","lean","leap","learn","least","leave","led","left","leg","legal","lemon","lend","length","lens","less","let","level","liar","lid","lie","life","lift","light","like","limb","lime","line","link","lion","lip","list","live","load","loan","local","lock","logic","long","look","loose","lord","lose","loss","lost","loud","love","lower","luck","lunch","mad","made","mail","main","make","male","mall","man","map","march","mark","mass","match","matter","mayor","meal","mean","meat","medal","media","melt","memo","men","mercy","mere","mesh","mess","met","metal","meter","mice","middle","might","mild","mile","milk","mill","mind","mine","minor","mint","minus","mist","mix","mode","model","moist","mole","money","monk","month","moon","moral","more","most","motor","mount","mouse","mouth","move","movie","much","mud","mug","music","must","mute","myth","nail","naked","name","nasal","navy","near","neck","need","negative","neon","nerve","nest","never","new","news","next","nice","night","nine","noise","none","noon","nor","norm","north","nose","not","note","noun","novel","now","null","number","oak","oath","obey","ocean","odd","off","offer","often","oil","old","olive","once","one","only","onto","open","opera","opt","oral","orange","orbit","order","ore","organ","other","ought","ounce","our","out","oven","over","owe","owl","own","owner","pace","pack","page","paid","pain","paint","pair","palace","pale","palm","pan","panel","paper","park","part","party","pass","past","path","pause","pay","peace","peak","pearl","pen","penny","per","perch","person","pet","phase","phone","photo","piano","pick","piece","pig","pile","pilot","pin","pinch","pine","pink","pipe","pirate","pitch","pizza","place","plain","plan","plane","plant","plate","play","plead","please","plot","plow","plug","plumb","plus","poem","poet","point","pole","police","policy","pond","pool","poor","pop","porch","port","pose","post","pot","pound","pour","power","praise","pray","press","price","pride","prime","prince","print","prior","prize","prob","proof","proud","prove","public","pull","punch","pure","purse","push","put","quart","quasi","queen","queer","query","quest","quick","quiet","quill","quit","quite","quiz","rabbit","race","rack","radio","raft","rage","raid","rail","rain","raise","range","rank","rapid","rare","rat","rate","raw","reach","react","read","ready","real","rebel","recall","recent","record","red","reef","refer","refund","regret","relax","remain","remix","remote","renew","rent","repair","repeat","reply","report","rescue","reset","resin","rest","resume","retain","retire","return","reuse","reveal","review","revoke","reward","rib","rice","rich","ride","rider","ridge","rifle","right","rigid","rim","ring","rinse","ripe","rise","risk","river","road","roar","roast","robe","robot","rock","rod","rode","roll","roof","room","root","rose","rough","round","route","row","royal","ruby","rude","ruin","rule","ruler","run","rush","sad","safe","sail","saint","salad","sale","salt","same","sample","sand","sane","sang","sank","sat","sauce","save","scale","scan","scar","scene","scent","scope","score","scout","scrap","screen","sea","seal","seam","sear","seat","second","secret","sector","seed","seek","seem","seen","seize","self","sell","send","sense","sent","septa","series","serve","session","set","seven","sever","sew","shade","shake","shall","shame","shape","share","sharp","she","shed","sheep","sheet","shelf","shell","shift","shine","ship","shirt","shock","shoe","shoot","shop","shore","short","shot","should","shoulder","show","shut","sick","side","sigh","sight","sign","silk","silly","silver","simple","since","sing","single","sink","sir","sister","sit","site","six","size","skate","skin","skip","skirt","sky","slab","slang","slate","slave","sleep","slice","slide","slim","slip","slope","slot","slow","slug","small","smart","smell","smile","smoke","smooth","snap","snow","soak","soap","sob","sock","soda","sofa","soft","soil","sold","solid","solo","solve","some","son","song","soon","sorry","sort","soul","sound","soup","sour","south","sow","space","spam","span","spare","speak","speed","spell","spend","spent","spice","spike","spin","spine","spirit","spoke","sport","spot","spray","spring","sprint","spy","square","squash","squat","stage","stain","stair","stake","stalk","stamp","stand","star","stare","start","state","stay","steady","steal","steam","steel","step","stick","stiff","still","sting","stir","stock","stone","stood","stool","stop","store","storm","story","stove","strap","straw","stream","street","strict","strike","string","strip","strong","stuck","study","stuff","style","subway","such","suit","sum","sun","sunk","super","sure","surf","sweep","sweet","swift","swim","swing","sword","tab","table","tack","tag","tail","tailor","take","tale","talk","tall","tank","tape","tar","task","taste","taut","taxi","tea","teach","team","tear","tech","teen","tell","ten","tend","term","test","text","than","that","theft","their","them","then","there","these","they","thick","thin","thing","think","third","thirty","this","those","thou","though","thread","three","throw","thumb","thus","tick","tide","tie","tiger","tight","till","time","tin","tiny","tip","tire","title","toast","today","toe","told","tomb","tonal","tone","tongue","tonic","too","took","tool","tooth","top","topic","torch","tore","torn","toss","total","touch","tough","tour","tow","toward","towel","tower","town","toxic","toy","trace","track","trade","train","trait","trap","trash","travel","tray","tread","treat","tree","trend","trial","tribe","trick","tried","trio","trip","trout","truck","true","trunk","trust","truth","try","tube","tuck","tugs","tune","tunnel","turn","turtle","tutor","twin","twist","two","type","under","undo","unfit","union","unite","unity","until","upon","upper","upset","urge","usage","use","useful","user","usual","value","van","vary","vast","vat","verb","verse","very","vest","veto","via","vice","video","view","vile","villa","vine","viral","virus","visa","visit","vital","voice","void","vote","vow","wage","wait","wake","walk","wall","want","war","warm","warn","wash","waste","watch","water","wave","wax","way","weak","wealth","weapon","wear","weave","web","week","weep","weigh","weight","weird","welch","well","went","were","west","whale","wheat","wheel","when","where","which","while","whip","whirl","white","who","whole","whom","whose","why","wide","wife","wild","will","win","wind","wine","wing","wink","winter","wipe","wire","wise","wish","with","wolf","woman","won","wonder","wood","wool","word","work","world","worm","worn","worry","worse","worth","would","wound","wrap","wrist","write","wrong","yard","yarn","yawn","year","yell","yellow","yes","yet","yield","yoga","yolk","you","young","your","youth","yummy","zero","zone","zoo","zoom","zip"
]);

let cols = [];     // each col is an array of letters from bottom to top
let score = 0;
let cleared = 0;
let level = 1;
let running = false;
let paused = false;
let dropInterval = 800;
let lastDropTs = 0;
let rafHandle = null;

const profile = getActive();
const svg = document.getElementById("tetris-svg");
const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const pauseBtn = document.getElementById("game-pause");
const resetBtn = document.getElementById("game-reset");
const scoreEl = document.querySelector("[data-score]");
const clearedEl = document.querySelector("[data-cleared]");
const levelEl = document.querySelector("[data-level]");
const bestEl = document.querySelector("[data-best]");

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  return (gs.byMode || {}).tetris || { highScore: 0, bestStreak: 0 };
}

function pickLetter() {
  return LETTER_WEIGHTS[Math.floor(Math.random() * LETTER_WEIGHTS.length)];
}

function resetState() {
  cols = Array.from({ length: COLS }, () => []);
  score = 0;
  cleared = 0;
  level = 1;
  dropInterval = 800;
}

function paint() {
  let s = `<rect x="0" y="0" width="${STAGE_W}" height="${STAGE_H}" fill="var(--bg-2)"/>`;
  // Subtle grid.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((r + c) % 2 === 0) s += `<rect x="${c*CELL}" y="${r*CELL}" width="${CELL}" height="${CELL}" fill="rgba(255,255,255,0.02)"/>`;
    }
  }
  // Letters in columns (from bottom).
  for (let c = 0; c < COLS; c++) {
    const stack = cols[c];
    for (let i = 0; i < stack.length; i++) {
      const isTop = i === stack.length - 1;
      const y = ROWS - 1 - i;
      const px = c * CELL + 4;
      const py = y * CELL + 4;
      s += `<rect x="${px}" y="${py}" width="${CELL-8}" height="${CELL-8}" fill="${isTop ? "color-mix(in oklab, var(--accent) 75%, var(--bg-1))" : "color-mix(in oklab, var(--accent) 35%, var(--bg-1))"}" rx="4"/>`;
      s += `<text x="${px + (CELL-8)/2}" y="${py + (CELL-8)/2 + 7}" text-anchor="middle" font-family="var(--font-mono)" font-size="20" font-weight="600" fill="var(--fg-0)">${stack[i].toUpperCase()}</text>`;
    }
  }
  // Danger line (top row).
  s += `<line x1="0" x2="${STAGE_W}" y1="${CELL}" y2="${CELL}" stroke="var(--bad, #d76050)" stroke-dasharray="6 4" opacity="0.6"/>`;
  svg.innerHTML = s;
}

function paintStats() {
  scoreEl.textContent = String(score);
  clearedEl.textContent = String(cleared);
  levelEl.textContent = String(level);
  bestEl.textContent = String(readBest().highScore || 0);
}

function drop() {
  // Pick a column with the lowest stack height to keep the grid more even,
  // with random tie-breaking.
  const heights = cols.map((c) => c.length);
  const minH = Math.min(...heights);
  const candidates = [];
  for (let i = 0; i < COLS; i++) if (heights[i] <= minH + 2) candidates.push(i);
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  cols[target].push(pickLetter());
  // Game-over check: any column at ROWS.
  if (cols.some((c) => c.length >= ROWS)) {
    endRound();
    return;
  }
  // Level up every 30 letters dropped.
  const totalLetters = cols.reduce((n, c) => n + c.length, 0);
  const newLevel = 1 + Math.floor(totalLetters / 30);
  if (newLevel > level) {
    level = newLevel;
    dropInterval = Math.max(220, 800 - (level - 1) * 70);
  }
}

function attemptWord(word) {
  const w = (word || "").toLowerCase();
  if (w.length < 3 || !/^[a-z]+$/.test(w)) { playMistake(); return false; }
  if (!COMMON_WORDS.has(w)) { playMistake(); return false; }
  // Match each letter of the typed word against the TOP letter of
  // some column. Columns can be in ANY order -- the original
  // "must be consecutive adjacent columns" rule was too strict to
  // ever satisfy with random drops, so the game felt frozen.
  // Greedy by letter order: for letter i, find the first unused
  // column whose top letter matches.
  const usedCols = new Set();
  const colMap = [];
  for (let i = 0; i < w.length; i++) {
    let foundCol = -1;
    for (let c = 0; c < COLS; c++) {
      if (usedCols.has(c)) continue;
      const stack = cols[c];
      if (!stack.length) continue;
      if (stack[stack.length - 1] === w[i]) { foundCol = c; break; }
    }
    if (foundCol === -1) { playMistake(); return false; }
    usedCols.add(foundCol);
    colMap.push(foundCol);
  }
  // Match found -- pop the top letter off each matched column.
  for (const c of colMap) cols[c].pop();
  const gain = w.length * w.length;
  score += gain;
  cleared++;
  playKey();
  return true;
}

function loop(now) {
  if (!running) return;
  if (!paused && now - lastDropTs >= dropInterval) {
    lastDropTs = now;
    drop();
  }
  paint();
  paintStats();
  rafHandle = requestAnimationFrame(loop);
}

function startRound() {
  if (running) return;
  resetState();
  running = true;
  paused = false;
  lastDropTs = performance.now();
  startBtn.hidden = true;
  pauseBtn.hidden = false;
  resetBtn.hidden = false;
  input.value = "";
  input.focus({ preventScroll: true });
  Analytics.gameStart({ mode: "tetris", speed: 1 });
  paint();
  paintStats();
  rafHandle = requestAnimationFrame(loop);
}

function endRound() {
  if (!running) return;
  running = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  Analytics.gameOver({ mode: "tetris", score, caught: cleared, missed: 0, bestStreak: 0, speed: 1 });
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode.tetris || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (score > m.highScore) { m.highScore = score; isNewBest = true; }
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + cleared;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode.tetris = m;
      return p;
    });
  } catch {}
  if (isNewBest) try { Analytics.gameNewBest({ mode: "tetris", score }); } catch {}
  playFinish();
  let s = svg.innerHTML;
  s += `<rect x="0" y="0" width="${STAGE_W}" height="${STAGE_H}" fill="rgba(20,22,30,.85)"/>`;
  s += `<text x="${STAGE_W/2}" y="${STAGE_H/2-40}" text-anchor="middle" fill="var(--accent)" font-family="var(--font-display)" font-size="36" font-weight="500">Stack overflow</text>`;
  s += `<text x="${STAGE_W/2}" y="${STAGE_H/2}" text-anchor="middle" fill="var(--fg-1)" font-family="var(--font-mono)" font-size="14">${score} pts · ${cleared} clears · level ${level}</text>`;
  if (isNewBest) s += `<text x="${STAGE_W/2}" y="${STAGE_H/2+24}" text-anchor="middle" fill="var(--good, #76c893)" font-family="var(--font-mono)" font-size="11" letter-spacing="0.12em">NEW PERSONAL BEST</text>`;
  s += `<text x="${STAGE_W/2}" y="${STAGE_H/2+56}" text-anchor="middle" fill="var(--fg-3)" font-family="var(--font-mono)" font-size="12">Click Reset, then Start.</text>`;
  svg.innerHTML = s;
  startBtn.textContent = "Play again";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  try { input.blur(); } catch {}
}

function reset() {
  running = false;
  paused = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  resetState();
  paint();
  paintStats();
  startBtn.textContent = "Start";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  resetBtn.hidden = true;
}

input.addEventListener("input", () => {
  if (!running || paused) return;
  const v = input.value;
  if (v.endsWith(" ")) {
    attemptWord(v.trim());
    input.value = "";
    paint();
    paintStats();
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    attemptWord(input.value.trim());
    input.value = "";
    paint();
    paintStats();
    e.preventDefault();
  }
});

startBtn.addEventListener("click", startRound);
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
});
resetBtn.addEventListener("click", reset);

setSoundPrefs({
  theme: (profile.preferences && profile.preferences.soundTheme) || "off",
  volume: (profile.preferences && profile.preferences.soundVolume) || 0.5,
});
resetState();
paint();
paintStats();
