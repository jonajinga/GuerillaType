import fs from "node:fs";

const path = "src/data/poetry.json";
const cur = JSON.parse(fs.readFileSync(path, "utf8"));
const idHave = new Set(cur.map(p => p.id));

const NEW = [
  {
    id: "po-shelley-mont-blanc",
    title: "Mont Blanc (excerpt)",
    author: "Percy Bysshe Shelley",
    year: "1817",
    source: "Public domain",
    tags: ["nature","mountain"],
    text: "The everlasting universe of things\nFlows through the mind, and rolls its rapid waves,\nNow dark -- now glittering -- now reflecting gloom --\nNow lending splendour, where from secret springs\nThe source of human thought its tribute brings\nOf waters."
  },
  {
    id: "po-coleridge-rime",
    title: "The Rime of the Ancient Mariner (opening)",
    author: "Samuel Taylor Coleridge",
    year: "1798",
    source: "Public domain",
    tags: ["narrative","sea"],
    text: "It is an ancient Mariner,\nAnd he stoppeth one of three.\n\"By thy long grey beard and glittering eye,\nNow wherefore stopp'st thou me?\n\nThe Bridegroom's doors are opened wide,\nAnd I am next of kin;\nThe guests are met, the feast is set:\nMay'st hear the merry din.\""
  },
  {
    id: "po-wordsworth-prelude-2",
    title: "The Prelude (opening)",
    author: "William Wordsworth",
    year: "1850",
    source: "Public domain",
    tags: ["autobiographical","nature"],
    text: "O there is blessing in this gentle breeze,\nA visitant that while it fans my cheek\nDoth seem half-conscious of the joy it brings\nFrom the green fields, and from yon azure sky."
  },
  {
    id: "po-tennyson-lady-shalott",
    title: "The Lady of Shalott (opening)",
    author: "Alfred, Lord Tennyson",
    year: "1842",
    source: "Public domain",
    tags: ["narrative","arthurian"],
    text: "On either side the river lie\nLong fields of barley and of rye,\nThat clothe the wold and meet the sky;\nAnd thro' the field the road runs by\n   To many-tower'd Camelot;\nAnd up and down the people go,\nGazing where the lilies blow\nRound an island there below,\n   The island of Shalott."
  },
  {
    id: "po-browning-rabbi-ben",
    title: "Rabbi Ben Ezra (opening)",
    author: "Robert Browning",
    year: "1864",
    source: "Public domain",
    tags: ["wisdom","aging"],
    text: "Grow old along with me!\nThe best is yet to be,\nThe last of life, for which the first was made:\nOur times are in His hand\nWho saith, \"A whole I planned,\nYouth shows but half; trust God: see all, nor be afraid!\""
  },
  {
    id: "po-arnold-scholar-gypsy",
    title: "The Scholar-Gypsy (excerpt)",
    author: "Matthew Arnold",
    year: "1853",
    source: "Public domain",
    tags: ["pastoral","longing"],
    text: "Glad meadows lie behind, and far below\nMy plough; or shadow on this lonely down\nOf airy clouds; the gay\nLong line of summer fields against the sky --\nAnd thou and I -- we sigh, and turn away."
  },
  {
    id: "po-rossetti-goblin",
    title: "Goblin Market (opening)",
    author: "Christina Rossetti",
    year: "1862",
    source: "Public domain",
    tags: ["narrative","fantasy"],
    text: "Morning and evening\nMaids heard the goblins cry:\n\"Come buy our orchard fruits,\nCome buy, come buy:\nApples and quinces,\nLemons and oranges,\nPlump unpecked cherries,\nMelons and raspberries,\nBloom-down-cheeked peaches,\nSwart-headed mulberries.\""
  },
  {
    id: "po-frost-out-out",
    title: "'Out, Out--' (opening)",
    author: "Robert Frost",
    year: "1916",
    source: "Public domain",
    tags: ["narrative","tragedy"],
    text: "The buzz-saw snarled and rattled in the yard\nAnd made dust and dropped stove-length sticks of wood,\nSweet-scented stuff when the breeze drew across it.\nAnd from there those that lifted eyes could count\nFive mountain ranges one behind the other\nUnder the sunset far into Vermont."
  },
  {
    id: "po-frost-tuft-flowers",
    title: "The Tuft of Flowers (excerpt)",
    author: "Robert Frost",
    year: "1913",
    source: "Public domain",
    tags: ["nature","work"],
    text: "I went to turn the grass once after one\nWho mowed it in the dew before the sun.\n\nThe dew was gone that made his blade so keen\nBefore I came to view the levelled scene.\n\nI looked for him behind an isle of trees;\nI listened for his whetstone on the breeze."
  },
  {
    id: "po-dickinson-i-heard-fly",
    title: "I heard a Fly buzz when I died",
    author: "Emily Dickinson",
    year: "c. 1862",
    source: "Public domain",
    tags: ["death"],
    text: "I heard a Fly buzz -- when I died --\nThe Stillness in the Room\nWas like the Stillness in the Air --\nBetween the Heaves of Storm --\n\nThe Eyes around -- had wrung them dry --\nAnd Breaths were gathering firm\nFor that last Onset -- when the King\nBe witnessed -- in the Room --"
  },
  {
    id: "po-dickinson-much-madness",
    title: "Much Madness is divinest Sense",
    author: "Emily Dickinson",
    year: "c. 1862",
    source: "Public domain",
    tags: ["wisdom","short"],
    text: "Much Madness is divinest Sense --\nTo a discerning Eye --\nMuch Sense -- the starkest Madness --\n'Tis the Majority\nIn this, as All, prevail --\nAssent -- and you are sane --\nDemur -- you're straightway dangerous --\nAnd handled with a Chain --"
  },
  {
    id: "po-whitman-out-cradle",
    title: "Out of the Cradle Endlessly Rocking (opening)",
    author: "Walt Whitman",
    year: "1859",
    source: "Public domain",
    tags: ["sea","memory"],
    text: "Out of the cradle endlessly rocking,\nOut of the mocking-bird's throat, the musical shuttle,\nOut of the Ninth-month midnight,\nOver the sterile sands and the fields beyond, where the child leaving his bed wander'd alone, bareheaded, barefoot,\nDown from the shower'd halo,\nUp from the mystic play of shadows twining and twisting as if they were alive."
  },
  {
    id: "po-whitman-i-hear",
    title: "I Hear America Singing",
    author: "Walt Whitman",
    year: "1860",
    source: "Public domain",
    tags: ["america","work"],
    text: "I hear America singing, the varied carols I hear,\nThose of mechanics, each one singing his as it should be blithe and strong,\nThe carpenter singing his as he measures his plank or beam,\nThe mason singing his as he makes ready for work, or leaves off work,\nThe boatman singing what belongs to him in his boat, the deckhand singing on the steamboat deck."
  },
  {
    id: "po-yeats-coole",
    title: "The Wild Swans at Coole (opening)",
    author: "William Butler Yeats",
    year: "1917",
    source: "Public domain",
    tags: ["nature","aging"],
    text: "The trees are in their autumn beauty,\nThe woodland paths are dry,\nUnder the October twilight the water\nMirrors a still sky;\nUpon the brimming water among the stones\nAre nine-and-fifty swans."
  },
  {
    id: "po-eliot-preludes",
    title: "Preludes (excerpt)",
    author: "T. S. Eliot",
    year: "1917",
    source: "Public domain",
    tags: ["modern","city"],
    text: "The winter evening settles down\nWith smell of steaks in passageways.\nSix o'clock.\nThe burnt-out ends of smoky days.\nAnd now a gusty shower wraps\nThe grimy scraps\nOf withered leaves about your feet\nAnd newspapers from vacant lots."
  },
  {
    id: "po-pound-canto-1",
    title: "Canto I (opening)",
    author: "Ezra Pound",
    year: "1917",
    source: "Public domain",
    tags: ["modern","epic"],
    text: "And then went down to the ship,\nSet keel to breakers, forth on the godly sea, and\nWe set up mast and sail on that swart ship,\nBore sheep aboard her, and our bodies also\nHeavy with weeping, and winds from sternward\nBore us out onward with bellying canvas."
  },
  {
    id: "po-cummings-spring",
    title: "in Just-",
    author: "E. E. Cummings",
    year: "1923",
    source: "Public domain",
    tags: ["spring","children"],
    text: "in Just-\nspring          when the world is mud-\nluscious the little\nlame balloonman\n\nwhistles          far          and wee\n\nand eddieandbill come\nrunning from marbles and\npiracies and it's\nspring"
  },
  {
    id: "po-stevens-emperor",
    title: "The Emperor of Ice-Cream",
    author: "Wallace Stevens",
    year: "1923",
    source: "Public domain",
    tags: ["modern","death"],
    text: "Call the roller of big cigars,\nThe muscular one, and bid him whip\nIn kitchen cups concupiscent curds.\nLet the wenches dawdle in such dress\nAs they are used to wear, and let the boys\nBring flowers in last month's newspapers.\nLet be be finale of seem.\nThe only emperor is the emperor of ice-cream."
  },
  {
    id: "po-williams-asphodel",
    title: "Landscape with the Fall of Icarus",
    author: "William Carlos Williams",
    year: "1962",
    source: "Public domain",
    tags: ["art","myth"],
    text: "According to Brueghel\nwhen Icarus fell\nit was spring\n\na farmer was ploughing\nhis field\nthe whole pageantry\n\nof the year was\nawake tingling\nnear\n\nthe edge of the sea\nconcerned\nwith itself"
  },
  {
    id: "po-millay-pity",
    title: "Pity me not because the light of day",
    author: "Edna St. Vincent Millay",
    year: "1923",
    source: "Public domain",
    tags: ["sonnet","love"],
    text: "Pity me not because the light of day\nAt close of day no longer walks the sky;\nPity me not for beauties passed away\nFrom field and thicket as the year goes by;\nPity me not the waning of the moon,\nNor that the ebbing tide goes out to sea,\nNor that a man's desire is hushed so soon,\nAnd you no longer look with love on me."
  },
  {
    id: "po-hopkins-felix",
    title: "Felix Randal",
    author: "Gerard Manley Hopkins",
    year: "1880",
    source: "Public domain",
    tags: ["sonnet","grief"],
    text: "Felix Randal the farrier, O is he dead then? my duty all ended,\nWho have watched his mould of man, big-boned and hardy-handsome\nPining, pining, till time when reason rambled in it, and some\nFatal four disorders, fleshed there, all contended?"
  },
  {
    id: "po-housman-merry",
    title: "On Wenlock Edge",
    author: "A. E. Housman",
    year: "1896",
    source: "Public domain",
    tags: ["nature","mortality"],
    text: "On Wenlock Edge the wood's in trouble;\nHis forest fleece the Wrekin heaves;\nThe gale, it plies the saplings double,\nAnd thick on Severn snow the leaves.\n\n'Twould blow like this through holt and hanger\nWhen Uricon the city stood:\n'Tis the old wind in the old anger,\nBut then it threshed another wood."
  },
  {
    id: "po-poe-helen",
    title: "To Helen",
    author: "Edgar Allan Poe",
    year: "1831",
    source: "Public domain",
    tags: ["love","short"],
    text: "Helen, thy beauty is to me\nLike those Nicean barks of yore,\nThat gently, o'er a perfumed sea,\nThe weary, way-worn wanderer bore\nTo his own native shore.\n\nOn desperate seas long wont to roam,\nThy hyacinth hair, thy classic face,\nThy Naiad airs have brought me home\nTo the glory that was Greece,\nAnd the grandeur that was Rome."
  },
  {
    id: "po-poe-alone",
    title: "Alone",
    author: "Edgar Allan Poe",
    year: "1875",
    source: "Public domain",
    tags: ["solitude"],
    text: "From childhood's hour I have not been\nAs others were -- I have not seen\nAs others saw -- I could not bring\nMy passions from a common spring.\nFrom the same source I have not taken\nMy sorrow; I could not awaken\nMy heart to joy at the same tone."
  },
  {
    id: "po-longfellow-hiawatha",
    title: "The Song of Hiawatha (opening)",
    author: "Henry Wadsworth Longfellow",
    year: "1855",
    source: "Public domain",
    tags: ["narrative","native-american"],
    text: "By the shores of Gitche Gumee,\nBy the shining Big-Sea-Water,\nStood the wigwam of Nokomis,\nDaughter of the Moon, Nokomis.\nDark behind it rose the forest,\nRose the black and gloomy pine-trees,\nRose the firs with cones upon them;\nBright before it beat the water."
  },
  {
    id: "po-blake-songs-2",
    title: "The Sick Rose",
    author: "William Blake",
    year: "1794",
    source: "Public domain",
    tags: ["short","symbolism"],
    text: "O Rose thou art sick.\nThe invisible worm,\nThat flies in the night\nIn the howling storm:\n\nHas found out thy bed\nOf crimson joy:\nAnd his dark secret love\nDoes thy life destroy."
  },
  {
    id: "po-gray-bard",
    title: "The Bard (excerpt)",
    author: "Thomas Gray",
    year: "1757",
    source: "Public domain",
    tags: ["narrative","ode"],
    text: "Ruin seize thee, ruthless King!\nConfusion on thy banners wait,\nTho' fanned by Conquest's crimson wing\nThey mock the air with idle state.\nHelm, nor hauberk's twisted mail,\nNor even thy virtues, tyrant, shall avail\nTo save thy secret soul from nightly fears,\nFrom Cambria's curse, from Cambria's tears!"
  },
  {
    id: "po-pope-rape-lock",
    title: "The Rape of the Lock (opening)",
    author: "Alexander Pope",
    year: "1714",
    source: "Public domain",
    tags: ["mock-epic"],
    text: "What dire offence from am'rous causes springs,\nWhat mighty contests rise from trivial things,\nI sing -- This verse to Caryl, Muse! is due:\nThis, ev'n Belinda may vouchsafe to view:\nSlight is the subject, but not so the praise,\nIf she inspire, and he approve my lays."
  },
  {
    id: "po-marvell-garden",
    title: "The Garden (excerpt)",
    author: "Andrew Marvell",
    year: "c. 1681",
    source: "Public domain",
    tags: ["nature","contemplation"],
    text: "How vainly men themselves amaze\nTo win the palm, the oak, or bays;\nAnd their uncessant labours see\nCrown'd from some single herb or tree,\nWhose short and narrow verged shade\nDoes prudently their toils upbraid;\nWhile all the flowers and trees do close\nTo weave the garlands of repose."
  },
  {
    id: "po-spenser-prothalamion",
    title: "Prothalamion (opening)",
    author: "Edmund Spenser",
    year: "1596",
    source: "Public domain",
    tags: ["wedding"],
    text: "Calm was the day, and through the trembling air\nSweet breathing Zephyrus did softly play,\nA gentle spirit, that lightly did delay\nHot Titan's beams, which then did glister fair;\nWhen I (whom sullen care,\nThrough discontent of my long fruitless stay\nIn princes' court, and expectation vain\nOf idle hopes, which still do fly away,\nLike empty shadows, did afflict my brain)\nWalked forth to ease my pain."
  },
];

const added = NEW.filter(p => !idHave.has(p.id));
const out = [...cur, ...added];
fs.writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`Added ${added.length} poems. Total: ${out.length}.`);
