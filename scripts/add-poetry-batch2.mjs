/* Second pass at poetry. */

import fs from "node:fs";

const path = "src/data/poetry.json";
const cur = JSON.parse(fs.readFileSync(path, "utf8"));
const idHave = new Set(cur.map(p => p.id));

const NEW = [
  {
    id: "po-keats-autumn",
    title: "To Autumn (opening)",
    author: "John Keats",
    year: "1819",
    source: "Public domain",
    tags: ["nature","ode"],
    text: "Season of mists and mellow fruitfulness,\n   Close bosom-friend of the maturing sun;\nConspiring with him how to load and bless\n   With fruit the vines that round the thatch-eves run;\nTo bend with apples the moss'd cottage-trees,\n   And fill all fruit with ripeness to the core;\n      To swell the gourd, and plump the hazel shells\n   With a sweet kernel; to set budding more,\nAnd still more, later flowers for the bees,\nUntil they think warm days will never cease,\n      For Summer has o'er-brimm'd their clammy cells."
  },
  {
    id: "po-shelley-cloud",
    title: "The Cloud (opening)",
    author: "Percy Bysshe Shelley",
    year: "1820",
    source: "Public domain",
    tags: ["nature"],
    text: "I bring fresh showers for the thirsting flowers,\n   From the seas and the streams;\nI bear light shade for the leaves when laid\n   In their noonday dreams.\nFrom my wings are shaken the dews that waken\n   The sweet buds every one,\nWhen rocked to rest on their mother's breast,\n   As she dances about the sun.\nI wield the flail of the lashing hail,\n   And whiten the green plains under,\nAnd then again I dissolve it in rain,\n   And laugh as I pass in thunder."
  },
  {
    id: "po-byron-prisoner",
    title: "The Prisoner of Chillon (opening)",
    author: "Lord Byron",
    year: "1816",
    source: "Public domain",
    tags: ["narrative","prison"],
    text: "My hair is grey, but not with years,\n   Nor grew it white\n   In a single night,\nAs men's have grown from sudden fears:\nMy limbs are bow'd, though not with toil,\n   But rusted with a vile repose,\nFor they have been a dungeon's spoil,\n   And mine has been the fate of those\nTo whom the goodly earth and air\nAre bann'd, and barr'd -- forbidden fare."
  },
  {
    id: "po-blake-songs-experience",
    title: "The Tyger (full)",
    author: "William Blake",
    year: "1794",
    source: "Public domain",
    tags: ["nature","awe"],
    text: "Tyger Tyger, burning bright,\nIn the forests of the night;\nWhat immortal hand or eye,\nCould frame thy fearful symmetry?\n\nIn what distant deeps or skies,\nBurnt the fire of thine eyes?\nOn what wings dare he aspire?\nWhat the hand, dare seize the fire?\n\nAnd what shoulder, & what art,\nCould twist the sinews of thy heart?\nAnd when thy heart began to beat,\nWhat dread hand? & what dread feet?"
  },
  {
    id: "po-blake-jerusalem",
    title: "And did those feet in ancient time",
    author: "William Blake",
    year: "1804",
    source: "Public domain",
    tags: ["england"],
    text: "And did those feet in ancient time\nWalk upon England's mountains green:\nAnd was the holy Lamb of God,\nOn England's pleasant pastures seen!\n\nAnd did the Countenance Divine,\nShine forth upon our clouded hills?\nAnd was Jerusalem builded here,\nAmong these dark Satanic Mills?\n\nBring me my Bow of burning gold;\nBring me my Arrows of desire:\nBring me my Spear: O clouds unfold!\nBring me my Chariot of fire!"
  },
  {
    id: "po-eliot-journey",
    title: "Journey of the Magi (opening)",
    author: "T. S. Eliot",
    year: "1927",
    source: "Public domain",
    tags: ["narrative","modern"],
    text: "A cold coming we had of it,\nJust the worst time of the year\nFor a journey, and such a long journey:\nThe ways deep and the weather sharp,\nThe very dead of winter.\nAnd the camels galled, sore-footed, refractory,\nLying down in the melting snow."
  },
  {
    id: "po-yeats-sailing",
    title: "Sailing to Byzantium (opening)",
    author: "William Butler Yeats",
    year: "1928",
    source: "Public domain",
    tags: ["aging","art"],
    text: "That is no country for old men. The young\nIn one another's arms, birds in the trees\n-- Those dying generations -- at their song,\nThe salmon-falls, the mackerel-crowded seas,\nFish, flesh, or fowl, commend all summer long\nWhatever is begotten, born, and dies.\nCaught in that sensual music all neglect\nMonuments of unageing intellect."
  },
  {
    id: "po-frost-birches",
    title: "Birches (opening)",
    author: "Robert Frost",
    year: "1916",
    source: "Public domain",
    tags: ["nature","memory"],
    text: "When I see birches bend to left and right\nAcross the lines of straighter darker trees,\nI like to think some boy's been swinging them.\nBut swinging doesn't bend them down to stay\nAs ice-storms do."
  },
  {
    id: "po-frost-pasture",
    title: "The Pasture",
    author: "Robert Frost",
    year: "1914",
    source: "Public domain",
    tags: ["nature","invitation"],
    text: "I'm going out to clean the pasture spring;\nI'll only stop to rake the leaves away\n(And wait to watch the water clear, I may):\nI sha'n't be gone long. -- You come too.\n\nI'm going out to fetch the little calf\nThat's standing by the mother. It's so young,\nIt totters when she licks it with her tongue.\nI sha'n't be gone long. -- You come too."
  },
  {
    id: "po-dickinson-success",
    title: "Success is counted sweetest",
    author: "Emily Dickinson",
    year: "c. 1859",
    source: "Public domain",
    tags: ["short","wisdom"],
    text: "Success is counted sweetest\nBy those who ne'er succeed.\nTo comprehend a nectar\nRequires sorest need.\n\nNot one of all the purple Host\nWho took the Flag today\nCan tell the definition\nSo clear of victory\n\nAs he defeated -- dying --\nOn whose forbidden ear\nThe distant strains of triumph\nBurst agonized and clear!"
  },
  {
    id: "po-dickinson-soul-selects",
    title: "The Soul selects her own Society",
    author: "Emily Dickinson",
    year: "c. 1862",
    source: "Public domain",
    tags: ["solitude"],
    text: "The Soul selects her own Society --\nThen -- shuts the Door --\nTo her divine Majority --\nPresent no more --\n\nUnmoved -- she notes the Chariots -- pausing --\nAt her low Gate --\nUnmoved -- an Emperor be kneeling\nUpon her Mat --\n\nI've known her -- from an ample nation --\nChoose One --\nThen -- close the Valves of her attention --\nLike Stone --"
  },
  {
    id: "po-whitman-when-i-heard",
    title: "When I Heard the Learn'd Astronomer",
    author: "Walt Whitman",
    year: "1865",
    source: "Public domain",
    tags: ["nature","science"],
    text: "When I heard the learn'd astronomer,\nWhen the proofs, the figures, were ranged in columns before me,\nWhen I was shown the charts and diagrams, to add, divide, and measure them,\nWhen I sitting heard the astronomer where he lectured with much applause in the lecture-room,\nHow soon unaccountable I became tired and sick,\nTill rising and gliding out I wander'd off by myself,\nIn the mystical moist night-air, and from time to time,\nLook'd up in perfect silence at the stars."
  },
  {
    id: "po-tennyson-eagle",
    title: "The Eagle",
    author: "Alfred, Lord Tennyson",
    year: "1851",
    source: "Public domain",
    tags: ["short","nature"],
    text: "He clasps the crag with crooked hands;\nClose to the sun in lonely lands,\nRing'd with the azure world, he stands.\n\nThe wrinkled sea beneath him crawls;\nHe watches from his mountain walls,\nAnd like a thunderbolt he falls."
  },
  {
    id: "po-tennyson-cross-bar",
    title: "Crossing the Bar",
    author: "Alfred, Lord Tennyson",
    year: "1889",
    source: "Public domain",
    tags: ["death","sea"],
    text: "Sunset and evening star,\n   And one clear call for me!\nAnd may there be no moaning of the bar,\n   When I put out to sea,\n\nBut such a tide as moving seems asleep,\n   Too full for sound and foam,\nWhen that which drew from out the boundless deep\n   Turns again home.\n\nTwilight and evening bell,\n   And after that the dark!\nAnd may there be no sadness of farewell,\n   When I embark."
  },
  {
    id: "po-arnold-dover",
    title: "Dover Beach (excerpt)",
    author: "Matthew Arnold",
    year: "1867",
    source: "Public domain",
    tags: ["modern","faith"],
    text: "Ah, love, let us be true\nTo one another! for the world, which seems\nTo lie before us like a land of dreams,\nSo various, so beautiful, so new,\nHath really neither joy, nor love, nor light,\nNor certitude, nor peace, nor help for pain;\nAnd we are here as on a darkling plain\nSwept with confused alarms of struggle and flight,\nWhere ignorant armies clash by night."
  },
  {
    id: "po-hopkins-windhover",
    title: "The Windhover (opening)",
    author: "Gerard Manley Hopkins",
    year: "1877",
    source: "Public domain",
    tags: ["nature","sonnet"],
    text: "I caught this morning morning's minion, king-\n   dom of daylight's dauphin, dapple-dawn-drawn Falcon, in his riding\n   Of the rolling level underneath him steady air, and striding\nHigh there, how he rung upon the rein of a wimpling wing\nIn his ecstasy! then off, off forth on swing,\n   As a skate's heel sweeps smooth on a bow-bend: the hurl and gliding\n   Rebuffed the big wind."
  },
  {
    id: "po-hardy-convergence",
    title: "The Convergence of the Twain (opening)",
    author: "Thomas Hardy",
    year: "1912",
    source: "Public domain",
    tags: ["disaster","fate"],
    text: "In a solitude of the sea\nDeep from human vanity,\nAnd the Pride of Life that planned her, stilly couches she.\n\nSteel chambers, late the pyres\nOf her salamandrine fires,\nCold currents thrid, and turn to rhythmic tidal lyres.\n\nOver the mirrors meant\nTo glass the opulent\nThe sea-worm crawls -- grotesque, slimed, dumb, indifferent."
  },
  {
    id: "po-housman-athlete",
    title: "To an Athlete Dying Young (opening)",
    author: "A. E. Housman",
    year: "1896",
    source: "Public domain",
    tags: ["death","glory"],
    text: "The time you won your town the race\nWe chaired you through the market-place;\nMan and boy stood cheering by,\nAnd home we brought you shoulder-high.\n\nTo-day, the road all runners come,\nShoulder-high we bring you home,\nAnd set you at your threshold down,\nTownsman of a stiller town.\n\nSmart lad, to slip betimes away\nFrom fields where glory does not stay,\nAnd early though the laurel grows\nIt withers quicker than the rose."
  },
  {
    id: "po-poe-bells",
    title: "The Bells (excerpt)",
    author: "Edgar Allan Poe",
    year: "1849",
    source: "Public domain",
    tags: ["sound","narrative"],
    text: "Hear the sledges with the bells --\n            Silver bells!\nWhat a world of merriment their melody foretells!\n      How they tinkle, tinkle, tinkle,\n         In the icy air of night!\n      While the stars that oversprinkle\n      All the heavens, seem to twinkle\n         With a crystalline delight;\n      Keeping time, time, time,\n      In a sort of Runic rhyme,\nTo the tintinnabulation that so musically wells\n   From the bells, bells, bells, bells,\n            Bells, bells, bells --\n   From the jingling and the tinkling of the bells."
  },
  {
    id: "po-longfellow-arrow",
    title: "The Arrow and the Song",
    author: "Henry Wadsworth Longfellow",
    year: "1845",
    source: "Public domain",
    tags: ["short","memory"],
    text: "I shot an arrow into the air,\nIt fell to earth, I knew not where;\nFor, so swiftly it flew, the sight\nCould not follow it in its flight.\n\nI breathed a song into the air,\nIt fell to earth, I knew not where;\nFor who has sight so keen and strong,\nThat it can follow the flight of song?\n\nLong, long afterward, in an oak\nI found the arrow, still unbroke;\nAnd the song, from beginning to end,\nI found again in the heart of a friend."
  },
  {
    id: "po-longfellow-day-done",
    title: "The Day is Done (opening)",
    author: "Henry Wadsworth Longfellow",
    year: "1845",
    source: "Public domain",
    tags: ["evening","poetry"],
    text: "The day is done, and the darkness\n   Falls from the wings of Night,\nAs a feather is wafted downward\n   From an eagle in his flight.\n\nI see the lights of the village\n   Gleam through the rain and the mist,\nAnd a feeling of sadness comes o'er me\n   That my soul cannot resist."
  },
  {
    id: "po-shelley-skylark",
    title: "To a Skylark (opening)",
    author: "Percy Bysshe Shelley",
    year: "1820",
    source: "Public domain",
    tags: ["nature","ode"],
    text: "Hail to thee, blithe Spirit!\n   Bird thou never wert,\nThat from Heaven, or near it,\n   Pourest thy full heart\nIn profuse strains of unpremeditated art.\n\nHigher still and higher\n   From the earth thou springest\nLike a cloud of fire;\n   The blue deep thou wingest,\nAnd singing still dost soar, and soaring ever singest."
  },
  {
    id: "po-cummings-anyone",
    title: "anyone lived in a pretty how town (opening)",
    author: "E. E. Cummings",
    year: "1940",
    source: "Public domain",
    tags: ["modern","experimental"],
    text: "anyone lived in a pretty how town\n(with up so floating many bells down)\nspring summer autumn winter\nhe sang his didn't he danced his did.\n\nWomen and men (both little and small)\ncared for anyone not at all\nthey sowed their isn't they reaped their same\nsun moon stars rain"
  },
  {
    id: "po-cummings-i-carry",
    title: "i carry your heart with me",
    author: "E. E. Cummings",
    year: "1952",
    source: "Public domain",
    tags: ["love"],
    text: "i carry your heart with me (i carry it in\nmy heart) i am never without it (anywhere\ni go you go, my dear; and whatever is done\nby only me is your doing, my darling)\n                                          i fear\nno fate (for you are my fate, my sweet) i want\nno world (for beautiful you are my world, my true)\nand it's you are whatever a moon has always meant\nand whatever a sun will always sing is you"
  },
  {
    id: "po-pound-station",
    title: "In a Station of the Metro",
    author: "Ezra Pound",
    year: "1913",
    source: "Public domain",
    tags: ["short","imagism"],
    text: "The apparition of these faces in the crowd;\nPetals on a wet, black bough."
  },
  {
    id: "po-williams-red-wheelbarrow",
    title: "The Red Wheelbarrow",
    author: "William Carlos Williams",
    year: "1923",
    source: "Public domain",
    tags: ["short","imagism"],
    text: "so much depends\nupon\n\na red wheel\nbarrow\n\nglazed with rain\nwater\n\nbeside the white\nchickens"
  },
  {
    id: "po-williams-this-is-just",
    title: "This Is Just to Say",
    author: "William Carlos Williams",
    year: "1934",
    source: "Public domain",
    tags: ["short","domestic"],
    text: "I have eaten\nthe plums\nthat were in\nthe icebox\n\nand which\nyou were probably\nsaving\nfor breakfast\n\nForgive me\nthey were delicious\nso sweet\nand so cold"
  },
  {
    id: "po-stevens-snow-man",
    title: "The Snow Man",
    author: "Wallace Stevens",
    year: "1921",
    source: "Public domain",
    tags: ["winter","modern"],
    text: "One must have a mind of winter\nTo regard the frost and the boughs\nOf the pine-trees crusted with snow;\n\nAnd have been cold a long time\nTo behold the junipers shagged with ice,\nThe spruces rough in the distant glitter\n\nOf the January sun; and not to think\nOf any misery in the sound of the wind,\nIn the sound of a few leaves,\n\nWhich is the sound of the land\nFull of the same wind\nThat is blowing in the same bare place\n\nFor the listener, who listens in the snow,\nAnd, nothing himself, beholds\nNothing that is not there and the nothing that is."
  },
  {
    id: "po-frost-after-apple",
    title: "After Apple-Picking (opening)",
    author: "Robert Frost",
    year: "1914",
    source: "Public domain",
    tags: ["nature","work"],
    text: "My long two-pointed ladder's sticking through a tree\nToward heaven still,\nAnd there's a barrel that I didn't fill\nBeside it, and there may be two or three\nApples I didn't pick upon some bough.\nBut I am done with apple-picking now.\nEssence of winter sleep is on the night,\nThe scent of apples: I am drowsing off."
  },
  {
    id: "po-rossetti-when-i-am-dead",
    title: "When I am dead, my dearest",
    author: "Christina Rossetti",
    year: "1862",
    source: "Public domain",
    tags: ["death","memory"],
    text: "When I am dead, my dearest,\n   Sing no sad songs for me;\nPlant thou no roses at my head,\n   Nor shady cypress tree:\nBe the green grass above me\n   With showers and dewdrops wet;\nAnd if thou wilt, remember,\n   And if thou wilt, forget.\n\nI shall not see the shadows,\n   I shall not feel the rain;\nI shall not hear the nightingale\n   Sing on, as if in pain:\nAnd dreaming through the twilight\n   That doth not rise nor set,\nHaply I may remember,\n   And haply may forget."
  },
  {
    id: "po-shakespeare-fear-no-more",
    title: "Fear No More (Cymbeline)",
    author: "William Shakespeare",
    year: "1610",
    source: "Public domain",
    tags: ["death","comfort"],
    text: "Fear no more the heat o' the sun,\n   Nor the furious winter's rages;\nThou thy worldly task hast done,\n   Home art gone, and ta'en thy wages:\nGolden lads and girls all must,\nAs chimney-sweepers, come to dust.\n\nFear no more the frown o' the great;\n   Thou art past the tyrant's stroke;\nCare no more to clothe and eat;\n   To thee the reed is as the oak:\nThe sceptre, learning, physic, must\nAll follow this, and come to dust."
  },
  {
    id: "po-shakespeare-tomorrow",
    title: "Tomorrow, and tomorrow, and tomorrow (Macbeth)",
    author: "William Shakespeare",
    year: "1606",
    source: "Public domain",
    tags: ["death","despair"],
    text: "Tomorrow, and tomorrow, and tomorrow,\nCreeps in this petty pace from day to day,\nTo the last syllable of recorded time;\nAnd all our yesterdays have lighted fools\nThe way to dusty death. Out, out, brief candle!\nLife's but a walking shadow, a poor player\nThat struts and frets his hour upon the stage\nAnd then is heard no more. It is a tale\nTold by an idiot, full of sound and fury,\nSignifying nothing."
  },
  {
    id: "po-shakespeare-quality-mercy",
    title: "The quality of mercy (Merchant of Venice)",
    author: "William Shakespeare",
    year: "1596",
    source: "Public domain",
    tags: ["mercy","speech"],
    text: "The quality of mercy is not strain'd,\nIt droppeth as the gentle rain from heaven\nUpon the place beneath. It is twice blest:\nIt blesseth him that gives and him that takes.\n'Tis mightiest in the mightiest; it becomes\nThe throned monarch better than his crown.\nHis sceptre shows the force of temporal power,\nThe attribute to awe and majesty,\nWherein doth sit the dread and fear of kings;\nBut mercy is above this sceptred sway."
  },
  {
    id: "po-yeats-easter",
    title: "Easter, 1916 (closing)",
    author: "William Butler Yeats",
    year: "1916",
    source: "Public domain",
    tags: ["history","sacrifice"],
    text: "Too long a sacrifice\nCan make a stone of the heart.\nO when may it suffice?\nThat is Heaven's part, our part\nTo murmur name upon name,\nAs a mother names her child\nWhen sleep at last has come\nOn limbs that had run wild.\nWhat is it but nightfall?\nNo, no, not night but death;\nWas it needless death after all?"
  },
  {
    id: "po-bronte-no-coward",
    title: "No coward soul is mine",
    author: "Emily Brontë",
    year: "1846",
    source: "Public domain",
    tags: ["courage","faith"],
    text: "No coward soul is mine,\nNo trembler in the world's storm-troubled sphere:\nI see Heaven's glories shine,\nAnd faith shines equal, arming me from fear.\n\nO God within my breast,\nAlmighty, ever-present Deity!\nLife -- that in me has rest,\nAs I -- undying Life -- have power in thee!"
  },
  {
    id: "po-tennyson-tears",
    title: "Tears, Idle Tears",
    author: "Alfred, Lord Tennyson",
    year: "1847",
    source: "Public domain",
    tags: ["grief","memory"],
    text: "Tears, idle tears, I know not what they mean,\nTears from the depth of some divine despair\nRise in the heart, and gather to the eyes,\nIn looking on the happy Autumn-fields,\nAnd thinking of the days that are no more.\n\nFresh as the first beam glittering on a sail,\nThat brings our friends up from the underworld,\nSad as the last which reddens over one\nThat sinks with all we love below the verge;\nSo sad, so fresh, the days that are no more."
  },
  {
    id: "po-frost-design",
    title: "Design",
    author: "Robert Frost",
    year: "1936",
    source: "Public domain",
    tags: ["nature","sonnet"],
    text: "I found a dimpled spider, fat and white,\nOn a white heal-all, holding up a moth\nLike a white piece of rigid satin cloth --\nAssorted characters of death and blight\nMixed ready to begin the morning right,\nLike the ingredients of a witches' broth --\nA snow-drop spider, a flower like a froth,\nAnd dead wings carried like a paper kite.\n\nWhat had that flower to do with being white,\nThe wayside blue and innocent heal-all?\nWhat brought the kindred spider to that height,\nThen steered the white moth thither in the night?\nWhat but design of darkness to appall? --\nIf design govern in a thing so small."
  },
  {
    id: "po-millay-love-not-all",
    title: "Love is not all",
    author: "Edna St. Vincent Millay",
    year: "1931",
    source: "Public domain",
    tags: ["love","sonnet"],
    text: "Love is not all: it is not meat nor drink\nNor slumber nor a roof against the rain;\nNor yet a floating spar to men that sink\nAnd rise and sink and rise and sink again;\nLove can not fill the thickened lung with breath,\nNor clean the blood, nor set the fractured bone;\nYet many a man is making friends with death\nEven as I speak, for lack of love alone."
  },
  {
    id: "po-cullen-yet-do-i-marvel",
    title: "Yet Do I Marvel",
    author: "Countee Cullen",
    year: "1925",
    source: "Public domain",
    tags: ["sonnet","race"],
    text: "I doubt not God is good, well-meaning, kind,\nAnd did He stoop to quibble could tell why\nThe little buried mole continues blind,\nWhy flesh that mirrors Him must some day die,\nMake plain the reason tortured Tantalus\nIs baited by the fickle fruit, declare\nIf merely brute caprice dooms Sisyphus\nTo struggle up a never-ending stair.\nInscrutable His ways are, and immune\nTo catechism by a mind too strewn\nWith petty cares to slightly understand\nWhat awful brain compels His awful hand.\nYet do I marvel at this curious thing:\nTo make a poet black, and bid him sing!"
  },
  {
    id: "po-dunbar-sympathy",
    title: "Sympathy (opening)",
    author: "Paul Laurence Dunbar",
    year: "1899",
    source: "Public domain",
    tags: ["freedom","race"],
    text: "I know what the caged bird feels, alas!\n   When the sun is bright on the upland slopes;\nWhen the wind stirs soft through the springing grass,\nAnd the river flows like a stream of glass;\n   When the first bird sings and the first bud opes,\nAnd the faint perfume from its chalice steals --\nI know what the caged bird feels!"
  },
  {
    id: "po-johnson-creation",
    title: "Lift Every Voice and Sing (opening)",
    author: "James Weldon Johnson",
    year: "1900",
    source: "Public domain",
    tags: ["anthem","hope"],
    text: "Lift every voice and sing,\nTill earth and heaven ring,\nRing with the harmonies of Liberty;\nLet our rejoicing rise\nHigh as the listening skies,\nLet it resound loud as the rolling sea.\nSing a song full of the faith that the dark past has taught us,\nSing a song full of the hope that the present has brought us;\nFacing the rising sun of our new day begun,\nLet us march on till victory is won."
  },
  {
    id: "po-stevens-thirteen",
    title: "Thirteen Ways of Looking at a Blackbird (excerpt)",
    author: "Wallace Stevens",
    year: "1917",
    source: "Public domain",
    tags: ["modern","perception"],
    text: "I\nAmong twenty snowy mountains,\nThe only moving thing\nWas the eye of the blackbird.\n\nII\nI was of three minds,\nLike a tree\nIn which there are three blackbirds.\n\nIII\nThe blackbird whirled in the autumn winds.\nIt was a small part of the pantomime."
  },
  {
    id: "po-millay-recuerdo",
    title: "Recuerdo",
    author: "Edna St. Vincent Millay",
    year: "1922",
    source: "Public domain",
    tags: ["youth","love"],
    text: "We were very tired, we were very merry --\nWe had gone back and forth all night on the ferry.\nIt was bare and bright, and smelled like a stable --\nBut we looked into a fire, we leaned across a table,\nWe lay on a hill-top underneath the moon;\nAnd the whistles kept blowing, and the dawn came soon."
  },
  {
    id: "po-lawrence-snake",
    title: "Snake (opening)",
    author: "D. H. Lawrence",
    year: "1923",
    source: "Public domain",
    tags: ["nature","encounter"],
    text: "A snake came to my water-trough\nOn a hot, hot day, and I in pyjamas for the heat,\nTo drink there.\n\nIn the deep, strange-scented shade of the great dark carob tree\nI came down the steps with my pitcher\nAnd must wait, must stand and wait, for there he was at the trough before me."
  },
  {
    id: "po-hopkins-spring",
    title: "Spring",
    author: "Gerard Manley Hopkins",
    year: "1877",
    source: "Public domain",
    tags: ["nature","sonnet"],
    text: "Nothing is so beautiful as Spring --\n   When weeds, in wheels, shoot long and lovely and lush;\n   Thrush's eggs look little low heavens, and thrush\nThrough the echoing timber does so rinse and wring\nThe ear, it strikes like lightnings to hear him sing;\n   The glassy peartree leaves and blooms, they brush\n   The descending blue; that blue is all in a rush\nWith richness; the racing lambs too have fair their fling."
  },
  {
    id: "po-hopkins-gods-grandeur",
    title: "God's Grandeur",
    author: "Gerard Manley Hopkins",
    year: "1877",
    source: "Public domain",
    tags: ["nature","sonnet"],
    text: "The world is charged with the grandeur of God.\n   It will flame out, like shining from shook foil;\n   It gathers to a greatness, like the ooze of oil\nCrushed. Why do men then now not reck his rod?\nGenerations have trod, have trod, have trod;\n   And all is seared with trade; bleared, smeared with toil;\n   And wears man's smudge and shares man's smell: the soil\nIs bare now, nor can foot feel, being shod."
  },
  {
    id: "po-bryant-thanatopsis",
    title: "Thanatopsis (closing)",
    author: "William Cullen Bryant",
    year: "1817",
    source: "Public domain",
    tags: ["death","nature"],
    text: "So live, that when thy summons comes to join\nThe innumerable caravan, which moves\nTo that mysterious realm, where each shall take\nHis chamber in the silent halls of death,\nThou go not, like the quarry-slave at night,\nScourged to his dungeon, but, sustained and soothed\nBy an unfaltering trust, approach thy grave\nLike one who wraps the drapery of his couch\nAbout him, and lies down to pleasant dreams."
  },
  {
    id: "po-clough-say-not",
    title: "Say not the Struggle Naught Availeth",
    author: "Arthur Hugh Clough",
    year: "1855",
    source: "Public domain",
    tags: ["hope","perseverance"],
    text: "Say not the struggle naught availeth,\n   The labour and the wounds are vain,\nThe enemy faints not, nor faileth,\n   And as things have been they remain.\n\nIf hopes were dupes, fears may be liars;\n   It may be, in yon smoke conceal'd,\nYour comrades chase e'en now the fliers,\n   And, but for you, possess the field."
  },
  {
    id: "po-kipling-if",
    title: "If—",
    author: "Rudyard Kipling",
    year: "1910",
    source: "Public domain",
    tags: ["wisdom","character"],
    text: "If you can keep your head when all about you\n   Are losing theirs and blaming it on you,\nIf you can trust yourself when all men doubt you,\n   But make allowance for their doubting too;\nIf you can wait and not be tired by waiting,\n   Or being lied about, don't deal in lies,\nOr being hated, don't give way to hating,\n   And yet don't look too good, nor talk too wise:\n\nIf you can dream -- and not make dreams your master;\n   If you can think -- and not make thoughts your aim;\nIf you can meet with Triumph and Disaster\n   And treat those two impostors just the same."
  },
  {
    id: "po-henley-invictus",
    title: "Invictus",
    author: "William Ernest Henley",
    year: "1888",
    source: "Public domain",
    tags: ["resilience","courage"],
    text: "Out of the night that covers me,\n   Black as the pit from pole to pole,\nI thank whatever gods may be\n   For my unconquerable soul.\n\nIn the fell clutch of circumstance\n   I have not winced nor cried aloud.\nUnder the bludgeonings of chance\n   My head is bloody, but unbowed.\n\nBeyond this place of wrath and tears\n   Looms but the Horror of the shade,\nAnd yet the menace of the years\n   Finds and shall find me unafraid.\n\nIt matters not how strait the gate,\n   How charged with punishments the scroll,\nI am the master of my fate,\n   I am the captain of my soul."
  },
];

const added = NEW.filter(p => !idHave.has(p.id));
const out = [...cur, ...added];
fs.writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`Added ${added.length} poems. Total: ${out.length}.`);
