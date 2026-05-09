/* Append public-domain poems to src/data/poetry.json. All entries are
   secular-leaning canonical works (no explicitly religious verse).
   Texts are short complete poems or self-contained excerpts. Skips
   any poem whose id is already present. */

import fs from "node:fs";

const path = "src/data/poetry.json";
const cur = JSON.parse(fs.readFileSync(path, "utf8"));
const idHave = new Set(cur.map(p => p.id));

const NEW = [
  {
    id: "po-shakespeare-29",
    title: "Sonnet 29",
    author: "William Shakespeare",
    year: "1609",
    source: "Public domain",
    tags: ["sonnet","love","despair"],
    text: "When, in disgrace with fortune and men's eyes,\nI all alone beweep my outcast state,\nAnd trouble deaf heaven with my bootless cries,\nAnd look upon myself, and curse my fate,\nWishing me like to one more rich in hope,\nFeatured like him, like him with friends possess'd,\nDesiring this man's art and that man's scope,\nWith what I most enjoy contented least;\nYet in these thoughts myself almost despising,\nHaply I think on thee, and then my state,\nLike to the lark at break of day arising\nFrom sullen earth, sings hymns at heaven's gate;\nFor thy sweet love remember'd such wealth brings\nThat then I scorn to change my state with kings."
  },
  {
    id: "po-shakespeare-116",
    title: "Sonnet 116",
    author: "William Shakespeare",
    year: "1609",
    source: "Public domain",
    tags: ["sonnet","love","constancy"],
    text: "Let me not to the marriage of true minds\nAdmit impediments. Love is not love\nWhich alters when it alteration finds,\nOr bends with the remover to remove:\nO no! it is an ever-fixed mark\nThat looks on tempests and is never shaken;\nIt is the star to every wandering bark,\nWhose worth's unknown, although his height be taken.\nLove's not Time's fool, though rosy lips and cheeks\nWithin his bending sickle's compass come;\nLove alters not with his brief hours and weeks,\nBut bears it out even to the edge of doom.\nIf this be error and upon me proved,\nI never writ, nor no man ever loved."
  },
  {
    id: "po-shakespeare-130",
    title: "Sonnet 130",
    author: "William Shakespeare",
    year: "1609",
    source: "Public domain",
    tags: ["sonnet","love","satire"],
    text: "My mistress' eyes are nothing like the sun;\nCoral is far more red than her lips' red;\nIf snow be white, why then her breasts are dun;\nIf hairs be wires, black wires grow on her head.\nI have seen roses damask'd, red and white,\nBut no such roses see I in her cheeks;\nAnd in some perfumes is there more delight\nThan in the breath that from my mistress reeks.\nI love to hear her speak, yet well I know\nThat music hath a far more pleasing sound;\nI grant I never saw a goddess go;\nMy mistress, when she walks, treads on the ground:\n   And yet, by heaven, I think my love as rare\n   As any she belied with false compare."
  },
  {
    id: "po-keats-grecian",
    title: "Ode on a Grecian Urn (excerpt)",
    author: "John Keats",
    year: "1819",
    source: "Public domain",
    tags: ["ode","beauty","art"],
    text: "Thou still unravish'd bride of quietness,\n   Thou foster-child of silence and slow time,\nSylvan historian, who canst thus express\n   A flowery tale more sweetly than our rhyme:\nWhat leaf-fring'd legend haunts about thy shape\n   Of deities or mortals, or of both,\n      In Tempe or the dales of Arcady?\n   What men or gods are these? What maidens loth?\nWhat mad pursuit? What struggle to escape?\n      What pipes and timbrels? What wild ecstasy?\n\n\"Beauty is truth, truth beauty, -- that is all\n   Ye know on earth, and all ye need to know.\""
  },
  {
    id: "po-keats-nightingale",
    title: "Ode to a Nightingale (excerpt)",
    author: "John Keats",
    year: "1819",
    source: "Public domain",
    tags: ["ode","nature"],
    text: "My heart aches, and a drowsy numbness pains\n   My sense, as though of hemlock I had drunk,\nOr emptied some dull opiate to the drains\n   One minute past, and Lethe-wards had sunk:\n'Tis not through envy of thy happy lot,\n   But being too happy in thine happiness, --\n      That thou, light-winged Dryad of the trees,\n         In some melodious plot\n   Of beechen green, and shadows numberless,\n      Singest of summer in full-throated ease."
  },
  {
    id: "po-shelley-ozymandias",
    title: "Ozymandias",
    author: "Percy Bysshe Shelley",
    year: "1818",
    source: "Public domain",
    tags: ["sonnet","ruin","power"],
    text: "I met a traveller from an antique land,\nWho said -- \"Two vast and trunkless legs of stone\nStand in the desert. . . . Near them, on the sand,\nHalf sunk a shattered visage lies, whose frown,\nAnd wrinkled lip, and sneer of cold command,\nTell that its sculptor well those passions read\nWhich yet survive, stamped on these lifeless things,\nThe hand that mocked them, and the heart that fed;\nAnd on the pedestal, these words appear:\nMy name is Ozymandias, King of Kings;\nLook on my Works, ye Mighty, and despair!\nNothing beside remains. Round the decay\nOf that colossal Wreck, boundless and bare\nThe lone and level sands stretch far away.\""
  },
  {
    id: "po-byron-she-walks",
    title: "She Walks in Beauty",
    author: "Lord Byron",
    year: "1814",
    source: "Public domain",
    tags: ["love","beauty"],
    text: "She walks in beauty, like the night\n   Of cloudless climes and starry skies;\nAnd all that's best of dark and bright\n   Meet in her aspect and her eyes;\nThus mellowed to that tender light\n   Which heaven to gaudy day denies.\n\nOne shade the more, one ray the less,\n   Had half impaired the nameless grace\nWhich waves in every raven tress,\n   Or softly lightens o'er her face;\nWhere thoughts serenely sweet express,\n   How pure, how dear their dwelling-place.\n\nAnd on that cheek, and o'er that brow,\n   So soft, so calm, yet eloquent,\nThe smiles that win, the tints that glow,\n   But tell of days in goodness spent,\nA mind at peace with all below,\n   A heart whose love is innocent!"
  },
  {
    id: "po-wordsworth-prelude",
    title: "Lines Composed a Few Miles Above Tintern Abbey (excerpt)",
    author: "William Wordsworth",
    year: "1798",
    source: "Public domain",
    tags: ["nature","memory"],
    text: "And I have felt\nA presence that disturbs me with the joy\nOf elevated thoughts; a sense sublime\nOf something far more deeply interfused,\nWhose dwelling is the light of setting suns,\nAnd the round ocean and the living air,\nAnd the blue sky, and in the mind of man:\nA motion and a spirit, that impels\nAll thinking things, all objects of all thought,\nAnd rolls through all things."
  },
  {
    id: "po-coleridge-kubla",
    title: "Kubla Khan (opening)",
    author: "Samuel Taylor Coleridge",
    year: "1816",
    source: "Public domain",
    tags: ["dream","imagination"],
    text: "In Xanadu did Kubla Khan\nA stately pleasure-dome decree:\nWhere Alph, the sacred river, ran\nThrough caverns measureless to man\n   Down to a sunless sea.\nSo twice five miles of fertile ground\nWith walls and towers were girdled round;\nAnd there were gardens bright with sinuous rills,\nWhere blossomed many an incense-bearing tree;\nAnd here were forests ancient as the hills,\nEnfolding sunny spots of greenery."
  },
  {
    id: "po-tennyson-ulysses",
    title: "Ulysses (closing)",
    author: "Alfred, Lord Tennyson",
    year: "1842",
    source: "Public domain",
    tags: ["adventure","aging"],
    text: "Tho' much is taken, much abides; and tho'\nWe are not now that strength which in old days\nMoved earth and heaven, that which we are, we are;\nOne equal temper of heroic hearts,\nMade weak by time and fate, but strong in will\nTo strive, to seek, to find, and not to yield."
  },
  {
    id: "po-tennyson-charge",
    title: "The Charge of the Light Brigade (opening)",
    author: "Alfred, Lord Tennyson",
    year: "1854",
    source: "Public domain",
    tags: ["war","duty"],
    text: "Half a league, half a league,\nHalf a league onward,\nAll in the valley of Death\n   Rode the six hundred.\n\"Forward, the Light Brigade!\nCharge for the guns!\" he said.\nInto the valley of Death\n   Rode the six hundred.\n\n\"Forward, the Light Brigade!\"\nWas there a man dismay'd?\nNot tho' the soldier knew\n   Some one had blunder'd.\nTheirs not to make reply,\nTheirs not to reason why,\nTheirs but to do and die.\nInto the valley of Death\n   Rode the six hundred."
  },
  {
    id: "po-browning-pippa",
    title: "Pippa's Song",
    author: "Robert Browning",
    year: "1841",
    source: "Public domain",
    tags: ["nature","optimism"],
    text: "The year's at the spring,\nAnd day's at the morn;\nMorning's at seven;\nThe hill-side's dew-pearled;\nThe lark's on the wing;\nThe snail's on the thorn;\nGod's in His heaven --\nAll's right with the world!"
  },
  {
    id: "po-rossetti-remember",
    title: "Remember",
    author: "Christina Rossetti",
    year: "1862",
    source: "Public domain",
    tags: ["death","love"],
    text: "Remember me when I am gone away,\n   Gone far away into the silent land;\n   When you can no more hold me by the hand,\nNor I half turn to go yet turning stay.\nRemember me when no more day by day\n   You tell me of our future that you plann'd:\n   Only remember me; you understand\nIt will be late to counsel then or pray.\nYet if you should forget me for a while\n   And afterwards remember, do not grieve:\n   For if the darkness and corruption leave\n   A vestige of the thoughts that once I had,\nBetter by far you should forget and smile\n   Than that you should remember and be sad."
  },
  {
    id: "po-dickinson-cars",
    title: "I like to see it lap the Miles",
    author: "Emily Dickinson",
    year: "c. 1862",
    source: "Public domain",
    tags: ["industry","observation"],
    text: "I like to see it lap the Miles --\nAnd lick the Valleys up --\nAnd stop to feed itself at Tanks --\nAnd then -- prodigious step\n\nAround a Pile of Mountains --\nAnd supercilious peer\nIn Shanties -- by the sides of Roads --\nAnd then a Quarry pare\n\nTo fit its Ribs\nAnd crawl between\nComplaining all the while\nIn horrid -- hooting stanza --\nThen chase itself down Hill --\n\nAnd neigh like Boanerges --\nThen -- punctual as a Star\nStop -- docile and omnipotent\nAt its own stable door --"
  },
  {
    id: "po-dickinson-snake",
    title: "A narrow Fellow in the Grass",
    author: "Emily Dickinson",
    year: "c. 1865",
    source: "Public domain",
    tags: ["nature","fear"],
    text: "A narrow Fellow in the Grass\nOccasionally rides --\nYou may have met him? Did you not\nHis notice instant is --\n\nThe Grass divides as with a Comb,\nA spotted Shaft is seen,\nAnd then it closes at your Feet\nAnd opens further on --\n\nSeveral of Nature's People\nI know, and they know me;\nI feel for them a transport\nOf Cordiality;\n\nBut never met this Fellow,\nAttended or alone,\nWithout a tighter breathing,\nAnd Zero at the Bone."
  },
  {
    id: "po-dickinson-because",
    title: "Because I could not stop for Death",
    author: "Emily Dickinson",
    year: "c. 1863",
    source: "Public domain",
    tags: ["death","journey"],
    text: "Because I could not stop for Death --\nHe kindly stopped for me --\nThe Carriage held but just Ourselves --\nAnd Immortality.\n\nWe slowly drove -- He knew no haste\nAnd I had put away\nMy labor and my leisure too,\nFor His Civility --\n\nWe passed the School, where Children strove\nAt Recess -- in the Ring --\nWe passed the Fields of Gazing Grain --\nWe passed the Setting Sun --"
  },
  {
    id: "po-frost-stopping",
    title: "Stopping by Woods on a Snowy Evening",
    author: "Robert Frost",
    year: "1923",
    source: "Public domain",
    tags: ["nature","winter"],
    text: "Whose woods these are I think I know.\nHis house is in the village though;\nHe will not see me stopping here\nTo watch his woods fill up with snow.\n\nMy little horse must think it queer\nTo stop without a farmhouse near\nBetween the woods and frozen lake\nThe darkest evening of the year.\n\nHe gives his harness bells a shake\nTo ask if there is some mistake.\nThe only other sound's the sweep\nOf easy wind and downy flake.\n\nThe woods are lovely, dark and deep,\nBut I have promises to keep,\nAnd miles to go before I sleep,\nAnd miles to go before I sleep."
  },
  {
    id: "po-frost-fire",
    title: "Fire and Ice",
    author: "Robert Frost",
    year: "1920",
    source: "Public domain",
    tags: ["short","destruction"],
    text: "Some say the world will end in fire,\nSome say in ice.\nFrom what I've tasted of desire\nI hold with those who favor fire.\nBut if it had to perish twice,\nI think I know enough of hate\nTo say that for destruction ice\nIs also great\nAnd would suffice."
  },
  {
    id: "po-frost-mending",
    title: "Mending Wall (opening)",
    author: "Robert Frost",
    year: "1914",
    source: "Public domain",
    tags: ["neighbors","tradition"],
    text: "Something there is that doesn't love a wall,\nThat sends the frozen-ground-swell under it,\nAnd spills the upper boulders in the sun;\nAnd makes gaps even two can pass abreast.\nThe work of hunters is another thing:\nI have come after them and made repair\nWhere they have left not one stone on a stone,\nBut they would have the rabbit out of hiding,\nTo please the yelping dogs."
  },
  {
    id: "po-yeats-innisfree",
    title: "The Lake Isle of Innisfree",
    author: "William Butler Yeats",
    year: "1888",
    source: "Public domain",
    tags: ["nature","peace"],
    text: "I will arise and go now, and go to Innisfree,\nAnd a small cabin build there, of clay and wattles made;\nNine bean-rows will I have there, a hive for the honey-bee,\nAnd live alone in the bee-loud glade.\n\nAnd I shall have some peace there, for peace comes dropping slow,\nDropping from the veils of the morning to where the cricket sings;\nThere midnight's all a glimmer, and noon a purple glow,\nAnd evening full of the linnet's wings.\n\nI will arise and go now, for always night and day\nI hear lake water lapping with low sounds by the shore;\nWhile I stand on the roadway, or on the pavements grey,\nI hear it in the deep heart's core."
  },
  {
    id: "po-yeats-second-coming",
    title: "The Second Coming (opening)",
    author: "William Butler Yeats",
    year: "1919",
    source: "Public domain",
    tags: ["apocalyptic","modern"],
    text: "Turning and turning in the widening gyre\nThe falcon cannot hear the falconer;\nThings fall apart; the centre cannot hold;\nMere anarchy is loosed upon the world,\nThe blood-dimmed tide is loosed, and everywhere\nThe ceremony of innocence is drowned;\nThe best lack all conviction, while the worst\nAre full of passionate intensity."
  },
  {
    id: "po-eliot-prufrock",
    title: "The Love Song of J. Alfred Prufrock (opening)",
    author: "T. S. Eliot",
    year: "1915",
    source: "Public domain",
    tags: ["modern","alienation"],
    text: "Let us go then, you and I,\nWhen the evening is spread out against the sky\nLike a patient etherized upon a table;\nLet us go, through certain half-deserted streets,\nThe muttering retreats\nOf restless nights in one-night cheap hotels\nAnd sawdust restaurants with oyster-shells:\nStreets that follow like a tedious argument\nOf insidious intent\nTo lead you to an overwhelming question. . . .\nOh, do not ask, \"What is it?\"\nLet us go and make our visit."
  },
  {
    id: "po-hopkins-pied",
    title: "Pied Beauty",
    author: "Gerard Manley Hopkins",
    year: "1877",
    source: "Public domain",
    tags: ["nature","praise"],
    text: "Glory be to God for dappled things --\n   For skies of couple-colour as a brinded cow;\n      For rose-moles all in stipple upon trout that swim;\nFresh-firecoal chestnut-falls; finches' wings;\n   Landscape plotted and pieced -- fold, fallow, and plough;\n      And áll trádes, their gear and tackle and trim.\n\nAll things counter, original, spare, strange;\n   Whatever is fickle, freckled (who knows how?)\n      With swift, slow; sweet, sour; adazzle, dim;\nHe fathers-forth whose beauty is past change:\n            Praise him."
  },
  {
    id: "po-hardy-darkling",
    title: "The Darkling Thrush",
    author: "Thomas Hardy",
    year: "1900",
    source: "Public domain",
    tags: ["winter","hope"],
    text: "I leant upon a coppice gate\n   When Frost was spectre-grey,\nAnd Winter's dregs made desolate\n   The weakening eye of day.\nThe tangled bine-stems scored the sky\n   Like strings of broken lyres,\nAnd all mankind that haunted nigh\n   Had sought their household fires.\n\nAt once a voice arose among\n   The bleak twigs overhead\nIn a full-hearted evensong\n   Of joy illimited;\nAn aged thrush, frail, gaunt, and small,\n   In blast-beruffled plume,\nHad chosen thus to fling his soul\n   Upon the growing gloom."
  },
  {
    id: "po-blake-songs-innocence",
    title: "The Lamb",
    author: "William Blake",
    year: "1789",
    source: "Public domain",
    tags: ["innocence","nature"],
    text: "Little Lamb, who made thee?\n   Dost thou know who made thee,\nGave thee life, and bid thee feed\nBy the stream and o'er the mead;\nGave thee clothing of delight,\nSoftest clothing, woolly, bright;\nGave thee such a tender voice,\nMaking all the vales rejoice?\n   Little Lamb, who made thee?\n   Dost thou know who made thee?"
  },
  {
    id: "po-blake-london",
    title: "London",
    author: "William Blake",
    year: "1794",
    source: "Public domain",
    tags: ["city","critique"],
    text: "I wander thro' each charter'd street,\nNear where the charter'd Thames does flow,\nAnd mark in every face I meet\nMarks of weakness, marks of woe.\n\nIn every cry of every Man,\nIn every Infant's cry of fear,\nIn every voice, in every ban,\nThe mind-forg'd manacles I hear.\n\nHow the Chimney-sweeper's cry\nEvery black'ning Church appalls;\nAnd the hapless Soldier's sigh\nRuns in blood down Palace walls.\n\nBut most thro' midnight streets I hear\nHow the youthful Harlot's curse\nBlasts the new-born Infant's tear,\nAnd blights with plagues the Marriage hearse."
  },
  {
    id: "po-poe-annabel",
    title: "Annabel Lee",
    author: "Edgar Allan Poe",
    year: "1849",
    source: "Public domain",
    tags: ["love","death"],
    text: "It was many and many a year ago,\n   In a kingdom by the sea,\nThat a maiden there lived whom you may know\n   By the name of Annabel Lee;\nAnd this maiden she lived with no other thought\n   Than to love and be loved by me.\n\nI was a child and she was a child,\n   In this kingdom by the sea,\nBut we loved with a love that was more than love --\n   I and my Annabel Lee --\nWith a love that the wingèd seraphs of Heaven\n   Coveted her and me."
  },
  {
    id: "po-poe-eldorado",
    title: "Eldorado",
    author: "Edgar Allan Poe",
    year: "1849",
    source: "Public domain",
    tags: ["quest","life"],
    text: "Gaily bedight,\n   A gallant knight,\nIn sunshine and in shadow,\n   Had journeyed long,\n   Singing a song,\nIn search of Eldorado.\n\nBut he grew old --\n   This knight so bold --\nAnd o'er his heart a shadow --\n   Fell as he found\n   No spot of ground\nThat looked like Eldorado.\n\nAnd, as his strength\n   Failed him at length,\nHe met a pilgrim shadow --\n   \"Shadow,\" said he,\n   \"Where can it be --\nThis land of Eldorado?\""
  },
  {
    id: "po-longfellow-psalm-life",
    title: "A Psalm of Life (excerpt)",
    author: "Henry Wadsworth Longfellow",
    year: "1838",
    source: "Public domain",
    tags: ["life","action"],
    text: "Tell me not, in mournful numbers,\n   Life is but an empty dream! --\nFor the soul is dead that slumbers,\n   And things are not what they seem.\n\nLife is real! Life is earnest!\n   And the grave is not its goal;\nDust thou art, to dust returnest,\n   Was not spoken of the soul.\n\nLet us, then, be up and doing,\n   With a heart for any fate;\nStill achieving, still pursuing,\n   Learn to labor and to wait."
  },
  {
    id: "po-longfellow-paul-revere",
    title: "Paul Revere's Ride (opening)",
    author: "Henry Wadsworth Longfellow",
    year: "1860",
    source: "Public domain",
    tags: ["history","narrative"],
    text: "Listen, my children, and you shall hear\nOf the midnight ride of Paul Revere,\nOn the eighteenth of April, in Seventy-five;\nHardly a man is now alive\nWho remembers that famous day and year.\n\nHe said to his friend, \"If the British march\nBy land or sea from the town to-night,\nHang a lantern aloft in the belfry arch\nOf the North Church tower as a signal light, --\nOne if by land, and two if by sea;\nAnd I on the opposite shore will be,\nReady to ride and spread the alarm\nThrough every Middlesex village and farm,\nFor the country folk to be up and to arm.\""
  },
  {
    id: "po-whitman-captain",
    title: "O Captain! My Captain!",
    author: "Walt Whitman",
    year: "1865",
    source: "Public domain",
    tags: ["elegy","leadership"],
    text: "O Captain! my Captain! our fearful trip is done,\nThe ship has weather'd every rack, the prize we sought is won,\nThe port is near, the bells I hear, the people all exulting,\nWhile follow eyes the steady keel, the vessel grim and daring;\n      But O heart! heart! heart!\n         O the bleeding drops of red,\n            Where on the deck my Captain lies,\n               Fallen cold and dead.\n\nO Captain! my Captain! rise up and hear the bells;\nRise up -- for you the flag is flung -- for you the bugle trills,\nFor you bouquets and ribbon'd wreaths -- for you the shores a-crowding,\nFor you they call, the swaying mass, their eager faces turning."
  },
  {
    id: "po-whitman-noiseless",
    title: "A Noiseless Patient Spider",
    author: "Walt Whitman",
    year: "1868",
    source: "Public domain",
    tags: ["solitude","reflection"],
    text: "A noiseless patient spider,\nI mark'd where on a little promontory it stood isolated,\nMark'd how to explore the vacant vast surrounding,\nIt launch'd forth filament, filament, filament, out of itself,\nEver unreeling them, ever tirelessly speeding them.\n\nAnd you O my soul where you stand,\nSurrounded, detached, in measureless oceans of space,\nCeaselessly musing, venturing, throwing, seeking the spheres to connect them,\nTill the bridge you will need be form'd, till the ductile anchor hold,\nTill the gossamer thread you fling catch somewhere, O my soul."
  },
  {
    id: "po-housman-lovliest",
    title: "Loveliest of trees, the cherry now",
    author: "A. E. Housman",
    year: "1896",
    source: "Public domain",
    tags: ["nature","time"],
    text: "Loveliest of trees, the cherry now\nIs hung with bloom along the bough,\nAnd stands about the woodland ride\nWearing white for Eastertide.\n\nNow, of my threescore years and ten,\nTwenty will not come again,\nAnd take from seventy springs a score,\nIt only leaves me fifty more.\n\nAnd since to look at things in bloom\nFifty springs are little room,\nAbout the woodlands I will go\nTo see the cherry hung with snow."
  },
  {
    id: "po-housman-shropshire",
    title: "When I was one-and-twenty",
    author: "A. E. Housman",
    year: "1896",
    source: "Public domain",
    tags: ["youth","love"],
    text: "When I was one-and-twenty\n   I heard a wise man say,\n\"Give crowns and pounds and guineas\n   But not your heart away;\nGive pearls away and rubies\n   But keep your fancy free.\"\nBut I was one-and-twenty,\n   No use to talk to me.\n\nWhen I was one-and-twenty\n   I heard him say again,\n\"The heart out of the bosom\n   Was never given in vain;\n'Tis paid with sighs a plenty\n   And sold for endless rue.\"\nAnd I am two-and-twenty,\n   And oh, 'tis true, 'tis true."
  },
  {
    id: "po-shelley-west-wind",
    title: "Ode to the West Wind (closing)",
    author: "Percy Bysshe Shelley",
    year: "1820",
    source: "Public domain",
    tags: ["ode","change"],
    text: "Make me thy lyre, even as the forest is:\nWhat if my leaves are falling like its own!\nThe tumult of thy mighty harmonies\n\nWill take from both a deep, autumnal tone,\nSweet though in sadness. Be thou, Spirit fierce,\nMy spirit! Be thou me, impetuous one!\n\nDrive my dead thoughts over the universe\nLike wither'd leaves to quicken a new birth!\nAnd, by the incantation of this verse,\n\nScatter, as from an unextinguish'd hearth\nAshes and sparks, my words among mankind!\nBe through my lips to unawaken'd earth\n\nThe trumpet of a prophecy! O Wind,\nIf Winter comes, can Spring be far behind?"
  },
  {
    id: "po-burns-red-rose",
    title: "A Red, Red Rose",
    author: "Robert Burns",
    year: "1794",
    source: "Public domain",
    tags: ["love","scottish"],
    text: "O my Luve is like a red, red rose\n   That's newly sprung in June;\nO my Luve is like the melody\n   That's sweetly played in tune.\n\nSo fair art thou, my bonnie lass,\n   So deep in luve am I;\nAnd I will luve thee still, my dear,\n   Till a' the seas gang dry.\n\nTill a' the seas gang dry, my dear,\n   And the rocks melt wi' the sun;\nI will love thee still, my dear,\n   While the sands o' life shall run.\n\nAnd fare thee weel, my only luve!\n   And fare thee weel awhile!\nAnd I will come again, my luve,\n   Though it were ten thousand mile."
  },
  {
    id: "po-burns-mouse",
    title: "To a Mouse (excerpt)",
    author: "Robert Burns",
    year: "1785",
    source: "Public domain",
    tags: ["nature","reflection"],
    text: "But Mousie, thou art no thy-lane,\nIn proving foresight may be vain:\nThe best laid schemes o' Mice an' Men\n      Gang aft agley,\nAn' lea'e us nought but grief an' pain,\n      For promis'd joy!\n\nStill thou art blest, compar'd wi' me!\nThe present only toucheth thee:\nBut Och! I backward cast my e'e,\n      On prospects drear!\nAn' forward, tho' I canna see,\n      I guess an' fear!"
  },
  {
    id: "po-marvell-coy-mistress",
    title: "To His Coy Mistress (excerpt)",
    author: "Andrew Marvell",
    year: "c. 1650",
    source: "Public domain",
    tags: ["love","time"],
    text: "Had we but world enough and time,\nThis coyness, lady, were no crime.\nWe would sit down, and think which way\nTo walk, and pass our long love's day.\nBut at my back I always hear\nTime's wingèd chariot hurrying near;\nAnd yonder all before us lie\nDeserts of vast eternity.\nThy beauty shall no more be found;\nNor, in thy marble vault, shall sound\nMy echoing song; then worms shall try\nThat long-preserved virginity,\nAnd your quaint honour turn to dust,\nAnd into ashes all my lust:\nThe grave's a fine and private place,\nBut none, I think, do there embrace."
  },
  {
    id: "po-pope-essay-criticism",
    title: "An Essay on Criticism (excerpt)",
    author: "Alexander Pope",
    year: "1711",
    source: "Public domain",
    tags: ["wisdom","writing"],
    text: "A little learning is a dangerous thing;\nDrink deep, or taste not the Pierian spring:\nThere shallow draughts intoxicate the brain,\nAnd drinking largely sobers us again.\n\nTo err is human; to forgive, divine.\n\nFor fools rush in where angels fear to tread."
  },
  {
    id: "po-gray-elegy",
    title: "Elegy Written in a Country Churchyard (opening)",
    author: "Thomas Gray",
    year: "1751",
    source: "Public domain",
    tags: ["mortality","reflection"],
    text: "The curfew tolls the knell of parting day,\n   The lowing herd wind slowly o'er the lea,\nThe plowman homeward plods his weary way,\n   And leaves the world to darkness and to me.\n\nNow fades the glimm'ring landscape on the sight,\n   And all the air a solemn stillness holds,\nSave where the beetle wheels his droning flight,\n   And drowsy tinklings lull the distant folds."
  },
  {
    id: "po-tennyson-break",
    title: "Break, break, break",
    author: "Alfred, Lord Tennyson",
    year: "1842",
    source: "Public domain",
    tags: ["grief","sea"],
    text: "Break, break, break,\n   On thy cold gray stones, O Sea!\nAnd I would that my tongue could utter\n   The thoughts that arise in me.\n\nO, well for the fisherman's boy,\n   That he shouts with his sister at play!\nO, well for the sailor lad,\n   That he sings in his boat on the bay!\n\nAnd the stately ships go on\n   To their haven under the hill;\nBut O for the touch of a vanish'd hand,\n   And the sound of a voice that is still!\n\nBreak, break, break\n   At the foot of thy crags, O Sea!\nBut the tender grace of a day that is dead\n   Will never come back to me."
  },
  {
    id: "po-yeats-when-old",
    title: "When You Are Old",
    author: "William Butler Yeats",
    year: "1893",
    source: "Public domain",
    tags: ["love","aging"],
    text: "When you are old and grey and full of sleep,\nAnd nodding by the fire, take down this book,\nAnd slowly read, and dream of the soft look\nYour eyes had once, and of their shadows deep;\n\nHow many loved your moments of glad grace,\nAnd loved your beauty with love false or true,\nBut one man loved the pilgrim soul in you,\nAnd loved the sorrows of your changing face;\n\nAnd bending down beside the glowing bars,\nMurmur, a little sadly, how Love fled\nAnd paced upon the mountains overhead\nAnd hid his face amid a crowd of stars."
  },
  {
    id: "po-frost-acquainted",
    title: "Acquainted with the Night",
    author: "Robert Frost",
    year: "1928",
    source: "Public domain",
    tags: ["solitude","night"],
    text: "I have been one acquainted with the night.\nI have walked out in rain -- and back in rain.\nI have outwalked the furthest city light.\n\nI have looked down the saddest city lane.\nI have passed by the watchman on his beat\nAnd dropped my eyes, unwilling to explain.\n\nI have stood still and stopped the sound of feet\nWhen far away an interrupted cry\nCame over houses from another street,\n\nBut not to call me back or say good-bye;\nAnd further still at an unearthly height,\nOne luminary clock against the sky\n\nProclaimed the time was neither wrong nor right.\nI have been one acquainted with the night."
  },
  {
    id: "po-frost-nothing-gold",
    title: "Nothing Gold Can Stay",
    author: "Robert Frost",
    year: "1923",
    source: "Public domain",
    tags: ["nature","time"],
    text: "Nature's first green is gold,\nHer hardest hue to hold.\nHer early leaf's a flower;\nBut only so an hour.\nThen leaf subsides to leaf.\nSo Eden sank to grief,\nSo dawn goes down to day.\nNothing gold can stay."
  },
  {
    id: "po-yeats-aedh",
    title: "Aedh Wishes for the Cloths of Heaven",
    author: "William Butler Yeats",
    year: "1899",
    source: "Public domain",
    tags: ["love","dreams"],
    text: "Had I the heavens' embroidered cloths,\nEnwrought with golden and silver light,\nThe blue and the dim and the dark cloths\nOf night and light and the half-light,\nI would spread the cloths under your feet:\nBut I, being poor, have only my dreams;\nI have spread my dreams under your feet;\nTread softly because you tread on my dreams."
  },
  {
    id: "po-dunbar-mask",
    title: "We Wear the Mask",
    author: "Paul Laurence Dunbar",
    year: "1896",
    source: "Public domain",
    tags: ["identity","race"],
    text: "We wear the mask that grins and lies,\nIt hides our cheeks and shades our eyes, --\nThis debt we pay to human guile;\nWith torn and bleeding hearts we smile,\nAnd mouth with myriad subtleties.\n\nWhy should the world be over-wise,\nIn counting all our tears and sighs?\nNay, let them only see us, while\n      We wear the mask.\n\nWe smile, but, O great Christ, our cries\nTo thee from tortured souls arise.\nWe sing, but oh the clay is vile\nBeneath our feet, and long the mile;\nBut let the world dream otherwise,\n      We wear the mask!"
  },
  {
    id: "po-hughes-i-too",
    title: "I, Too (excerpt)",
    author: "Langston Hughes",
    year: "1926",
    source: "Public domain",
    tags: ["identity","hope"],
    text: "I, too, sing America.\n\nI am the darker brother.\nThey send me to eat in the kitchen\nWhen company comes,\nBut I laugh,\nAnd eat well,\nAnd grow strong.\n\nTomorrow,\nI'll be at the table\nWhen company comes.\nNobody'll dare\nSay to me,\n\"Eat in the kitchen,\"\nThen.\n\nBesides,\nThey'll see how beautiful I am\nAnd be ashamed --\n\nI, too, am America."
  },
  {
    id: "po-hughes-mother",
    title: "Mother to Son",
    author: "Langston Hughes",
    year: "1922",
    source: "Public domain",
    tags: ["family","perseverance"],
    text: "Well, son, I'll tell you:\nLife for me ain't been no crystal stair.\nIt's had tacks in it,\nAnd splinters,\nAnd boards torn up,\nAnd places with no carpet on the floor --\nBare.\nBut all the time\nI'se been a-climbin' on,\nAnd reachin' landin's,\nAnd turnin' corners,\nAnd sometimes goin' in the dark\nWhere there ain't been no light.\nSo boy, don't you turn back.\nDon't you set down on the steps\n'Cause you finds it's kinder hard.\nDon't you fall now --\nFor I'se still goin', honey,\nI'se still climbin',\nAnd life for me ain't been no crystal stair."
  },
  {
    id: "po-sandburg-fog",
    title: "Fog",
    author: "Carl Sandburg",
    year: "1916",
    source: "Public domain",
    tags: ["nature","short"],
    text: "The fog comes\non little cat feet.\n\nIt sits looking\nover harbor and city\non silent haunches\nand then moves on."
  },
  {
    id: "po-sandburg-chicago",
    title: "Chicago (opening)",
    author: "Carl Sandburg",
    year: "1914",
    source: "Public domain",
    tags: ["city","industry"],
    text: "Hog Butcher for the World,\n   Tool Maker, Stacker of Wheat,\n   Player with Railroads and the Nation's Freight Handler;\n   Stormy, husky, brawling,\n   City of the Big Shoulders:\n\nThey tell me you are wicked and I believe them, for I have seen your\npainted women under the gas lamps luring the farm boys.\nAnd they tell me you are crooked and I answer: Yes, it is true I have\nseen the gunman kill and go free to kill again."
  },
  {
    id: "po-millay-first-fig",
    title: "First Fig",
    author: "Edna St. Vincent Millay",
    year: "1920",
    source: "Public domain",
    tags: ["short","life"],
    text: "My candle burns at both ends;\n   It will not last the night;\nBut ah, my foes, and oh, my friends --\n   It gives a lovely light!"
  },
  {
    id: "po-millay-renascence",
    title: "Renascence (opening)",
    author: "Edna St. Vincent Millay",
    year: "1912",
    source: "Public domain",
    tags: ["nature","reflection"],
    text: "All I could see from where I stood\nWas three long mountains and a wood;\nI turned and looked the other way,\nAnd saw three islands in a bay.\nSo with my eyes I traced the line\nOf the horizon, thin and fine,\nStraight around till I was come\nBack to where I'd started from;\nAnd all I saw from where I stood\nWas three long mountains and a wood."
  },
  {
    id: "po-shakespeare-sonnet-18-extra",
    title: "Sonnet 73",
    author: "William Shakespeare",
    year: "1609",
    source: "Public domain",
    tags: ["sonnet","aging"],
    text: "That time of year thou mayst in me behold\nWhen yellow leaves, or none, or few, do hang\nUpon those boughs which shake against the cold,\nBare ruin'd choirs, where late the sweet birds sang.\nIn me thou see'st the twilight of such day\nAs after sunset fadeth in the west,\nWhich by and by black night doth take away,\nDeath's second self, that seals up all in rest.\nIn me thou see'st the glowing of such fire\nThat on the ashes of his youth doth lie,\nAs the death-bed whereon it must expire,\nConsum'd with that which it was nourish'd by.\n   This thou perceiv'st, which makes thy love more strong,\n   To love that well which thou must leave ere long."
  },
  {
    id: "po-keats-bright-star",
    title: "Bright Star",
    author: "John Keats",
    year: "1819",
    source: "Public domain",
    tags: ["sonnet","love"],
    text: "Bright star, would I were stedfast as thou art --\n   Not in lone splendour hung aloft the night\nAnd watching, with eternal lids apart,\n   Like nature's patient, sleepless Eremite,\nThe moving waters at their priestlike task\n   Of pure ablution round earth's human shores,\nOr gazing on the new soft-fallen mask\n   Of snow upon the mountains and the moors --\nNo -- yet still stedfast, still unchangeable,\n   Pillow'd upon my fair love's ripening breast,\nTo feel for ever its soft fall and swell,\n   Awake for ever in a sweet unrest,\nStill, still to hear her tender-taken breath,\nAnd so live ever -- or else swoon to death."
  },
  {
    id: "po-rossetti-song",
    title: "Song",
    author: "Christina Rossetti",
    year: "1862",
    source: "Public domain",
    tags: ["death","memory"],
    text: "When I am dead, my dearest,\n   Sing no sad songs for me;\nPlant thou no roses at my head,\n   Nor shady cypress tree:\nBe the green grass above me\n   With showers and dewdrops wet;\nAnd if thou wilt, remember,\n   And if thou wilt, forget."
  },
  {
    id: "po-eliot-hollow-men",
    title: "The Hollow Men (opening)",
    author: "T. S. Eliot",
    year: "1925",
    source: "Public domain",
    tags: ["modern","despair"],
    text: "We are the hollow men\nWe are the stuffed men\nLeaning together\nHeadpiece filled with straw. Alas!\nOur dried voices, when\nWe whisper together\nAre quiet and meaningless\nAs wind in dry grass\nOr rats' feet over broken glass\nIn our dry cellar"
  },
  {
    id: "po-stevenson-requiem",
    title: "Requiem",
    author: "Robert Louis Stevenson",
    year: "1887",
    source: "Public domain",
    tags: ["death","epitaph"],
    text: "Under the wide and starry sky,\nDig the grave and let me lie.\nGlad did I live and gladly die,\n   And I laid me down with a will.\n\nThis be the verse you grave for me:\nHere he lies where he longed to be;\nHome is the sailor, home from sea,\n   And the hunter home from the hill."
  },
  {
    id: "po-stephen-i-saw",
    title: "In the Desert",
    author: "Stephen Crane",
    year: "1895",
    source: "Public domain",
    tags: ["short","strange"],
    text: "In the desert\nI saw a creature, naked, bestial,\nWho, squatting upon the ground,\nHeld his heart in his hands,\nAnd ate of it.\nI said, \"Is it good, friend?\"\n\"It is bitter -- bitter,\" he answered;\n\"But I like it\nBecause it is bitter,\nAnd because it is my heart.\""
  },
];

const added = NEW.filter(p => !idHave.has(p.id));
const out = [...cur, ...added];
fs.writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`Added ${added.length} poems. Total: ${out.length}.`);
