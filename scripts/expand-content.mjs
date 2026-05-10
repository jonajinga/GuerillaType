/* One-shot content expansion script. Appends curated public-domain
   and well-attributed entries to quotes.json, idioms.json, and
   poetry.json. Skips parables per request. Idempotent: refuses to
   re-add an entry whose id already exists in the target file. */

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname || ".", "..");
const QPATH = path.join(root, "src/data/quotes.json");
const IPATH = path.join(root, "src/data/idioms.json");
const PPATH = path.join(root, "src/data/poetry.json");

function loadJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function saveJson(p, v) { fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); }
function slug(s) {
  return String(s).toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const NEW_QUOTES = [
  // Marcus Aurelius (Meditations, c. 180 AD)
  ["You have power over your mind - not outside events. Realize this, and you will find strength.", "Marcus Aurelius", ["philosophy","stoicism","mind"]],
  ["The happiness of your life depends upon the quality of your thoughts.", "Marcus Aurelius", ["happiness","mind","stoicism"]],
  ["Waste no more time arguing what a good man should be. Be one.", "Marcus Aurelius", ["character","action","stoicism"]],
  ["When you arise in the morning, think of what a precious privilege it is to be alive - to breathe, to think, to enjoy, to love.", "Marcus Aurelius", ["life","gratitude","stoicism"]],
  ["The object of life is not to be on the side of the majority, but to escape finding oneself in the ranks of the insane.", "Marcus Aurelius", ["truth","independence","stoicism"]],
  ["Accept the things to which fate binds you, and love the people with whom fate brings you together, and do so with all your heart.", "Marcus Aurelius", ["acceptance","love","stoicism"]],
  ["Begin each day by telling yourself: today I shall be meeting with interference, ingratitude, insolence, disloyalty, ill-will, and selfishness.", "Marcus Aurelius", ["preparation","stoicism"]],
  ["If it is not right, do not do it; if it is not true, do not say it.", "Marcus Aurelius", ["truth","integrity","stoicism"]],
  // Seneca
  ["Luck is what happens when preparation meets opportunity.", "Seneca", ["luck","preparation","opportunity"]],
  ["We suffer more often in imagination than in reality.", "Seneca", ["mind","stoicism","fear"]],
  ["Sometimes even to live is an act of courage.", "Seneca", ["courage","life","stoicism"]],
  ["He who is brave is free.", "Seneca", ["courage","freedom","stoicism"]],
  ["As long as you live, keep learning how to live.", "Seneca", ["learning","life","stoicism"]],
  ["It is not the man who has too little, but the man who craves more, that is poor.", "Seneca", ["wealth","contentment","stoicism"]],
  ["Difficulties strengthen the mind, as labor does the body.", "Seneca", ["growth","strength","stoicism"]],
  ["Every new beginning comes from some other beginning's end.", "Seneca", ["change","beginning","stoicism"]],
  // Epictetus
  ["It's not what happens to you, but how you react to it that matters.", "Epictetus", ["stoicism","attitude","mind"]],
  ["No man is free who is not master of himself.", "Epictetus", ["freedom","self-mastery","stoicism"]],
  ["First say to yourself what you would be; and then do what you have to do.", "Epictetus", ["purpose","action","stoicism"]],
  ["Wealth consists not in having great possessions, but in having few wants.", "Epictetus", ["wealth","contentment","stoicism"]],
  ["He who laughs at himself never runs out of things to laugh at.", "Epictetus", ["humor","humility"]],
  // Confucius
  ["It does not matter how slowly you go as long as you do not stop.", "Confucius", ["perseverance","progress"]],
  ["Real knowledge is to know the extent of one's ignorance.", "Confucius", ["humility","knowledge","wisdom"]],
  ["Our greatest glory is not in never falling, but in rising every time we fall.", "Confucius", ["resilience","perseverance"]],
  ["When it is obvious that the goals cannot be reached, don't adjust the goals, adjust the action steps.", "Confucius", ["goals","strategy"]],
  ["Wheresoever you go, go with all your heart.", "Confucius", ["commitment","wholeheartedness"]],
  ["The man who moves a mountain begins by carrying away small stones.", "Confucius", ["progress","persistence"]],
  ["Better a diamond with a flaw than a pebble without.", "Confucius", ["character","value"]],
  ["Choose a job you love, and you will never have to work a day in your life.", "Confucius", ["work","passion"]],
  // Lao Tzu
  ["The journey of a thousand miles begins with a single step.", "Lao Tzu", ["journey","beginning","perseverance"]],
  ["Knowing others is intelligence; knowing yourself is true wisdom. Mastering others is strength; mastering yourself is true power.", "Lao Tzu", ["wisdom","self-mastery"]],
  ["When I let go of what I am, I become what I might be.", "Lao Tzu", ["growth","letting-go"]],
  ["Nature does not hurry, yet everything is accomplished.", "Lao Tzu", ["patience","nature","taoism"]],
  ["A good traveler has no fixed plans and is not intent on arriving.", "Lao Tzu", ["journey","presence","taoism"]],
  ["He who knows, does not speak. He who speaks, does not know.", "Lao Tzu", ["wisdom","silence","taoism"]],
  // Plato
  ["The beginning is the most important part of the work.", "Plato", ["beginning","work"]],
  ["Wise men speak because they have something to say; fools because they have to say something.", "Plato", ["wisdom","speech"]],
  ["At the touch of love everyone becomes a poet.", "Plato", ["love","poetry"]],
  ["Music is a moral law. It gives soul to the universe, wings to the mind, flight to the imagination, and life to everything.", "Plato", ["music","art"]],
  ["Be kind, for everyone you meet is fighting a hard battle.", "Plato", ["kindness","empathy"]],
  // Aristotle
  ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Aristotle", ["habit","excellence","virtue"]],
  ["Knowing yourself is the beginning of all wisdom.", "Aristotle", ["self-knowledge","wisdom"]],
  ["The educated differ from the uneducated as much as the living differ from the dead.", "Aristotle", ["education","learning"]],
  ["Patience is bitter, but its fruit is sweet.", "Aristotle", ["patience","virtue"]],
  ["Quality is not an act, it is a habit.", "Aristotle", ["quality","habit"]],
  ["The whole is greater than the sum of its parts.", "Aristotle", ["unity","systems"]],
  ["He who has overcome his fears will truly be free.", "Aristotle", ["fear","freedom"]],
  // Shakespeare
  ["This above all: to thine own self be true.", "William Shakespeare", ["authenticity","self","literature"]],
  ["Some are born great, some achieve greatness, and some have greatness thrust upon them.", "William Shakespeare", ["greatness","destiny","literature"]],
  ["The fool doth think he is wise, but the wise man knows himself to be a fool.", "William Shakespeare", ["wisdom","humility","literature"]],
  ["Brevity is the soul of wit.", "William Shakespeare", ["wit","brevity","literature"]],
  ["Cowards die many times before their deaths; the valiant never taste of death but once.", "William Shakespeare", ["courage","fear","literature"]],
  ["What's done cannot be undone.", "William Shakespeare", ["regret","action","literature"]],
  ["Better three hours too soon than a minute too late.", "William Shakespeare", ["time","punctuality","literature"]],
  ["The course of true love never did run smooth.", "William Shakespeare", ["love","literature"]],
  ["Love all, trust a few, do wrong to none.", "William Shakespeare", ["love","ethics","literature"]],
  ["Our doubts are traitors and make us lose the good we oft might win by fearing to attempt.", "William Shakespeare", ["doubt","courage","literature"]],
  // Emerson
  ["Do not go where the path may lead, go instead where there is no path and leave a trail.", "Ralph Waldo Emerson", ["independence","leadership"]],
  ["What lies behind us and what lies before us are tiny matters compared to what lies within us.", "Ralph Waldo Emerson", ["self-reliance","character"]],
  ["The only person you are destined to become is the person you decide to be.", "Ralph Waldo Emerson", ["destiny","choice"]],
  ["To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.", "Ralph Waldo Emerson", ["authenticity","self"]],
  ["Once you make a decision, the universe conspires to make it happen.", "Ralph Waldo Emerson", ["decision","commitment"]],
  ["Adopt the pace of nature: her secret is patience.", "Ralph Waldo Emerson", ["nature","patience"]],
  ["For every minute you are angry you lose sixty seconds of happiness.", "Ralph Waldo Emerson", ["anger","happiness"]],
  ["The earth laughs in flowers.", "Ralph Waldo Emerson", ["nature","joy"]],
  ["Write it on your heart that every day is the best day in the year.", "Ralph Waldo Emerson", ["gratitude","present"]],
  ["Without ambition one starts nothing. Without work one finishes nothing.", "Ralph Waldo Emerson", ["ambition","work"]],
  // Thoreau
  ["Go confidently in the direction of your dreams. Live the life you have imagined.", "Henry David Thoreau", ["dreams","confidence"]],
  ["The price of anything is the amount of life you exchange for it.", "Henry David Thoreau", ["value","life"]],
  ["It's not what you look at that matters, it's what you see.", "Henry David Thoreau", ["perception","awareness"]],
  ["Things do not change; we change.", "Henry David Thoreau", ["change","self"]],
  ["Live each season as it passes; breathe the air, drink the drink, taste the fruit.", "Henry David Thoreau", ["nature","present"]],
  ["Many men go fishing all of their lives without knowing that it is not fish they are after.", "Henry David Thoreau", ["meaning","purpose"]],
  ["I went to the woods because I wished to live deliberately.", "Henry David Thoreau", ["intention","nature"]],
  // Twain
  ["The two most important days in your life are the day you are born and the day you find out why.", "Mark Twain", ["purpose","life"]],
  ["Whenever you find yourself on the side of the majority, it is time to pause and reflect.", "Mark Twain", ["independence","reflection"]],
  ["Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did do.", "Mark Twain", ["regret","action"]],
  ["The secret of getting ahead is getting started.", "Mark Twain", ["beginning","action"]],
  ["Kindness is the language which the deaf can hear and the blind can see.", "Mark Twain", ["kindness","communication"]],
  ["A clear conscience is the sure sign of a bad memory.", "Mark Twain", ["humor","memory"]],
  ["Continuous improvement is better than delayed perfection.", "Mark Twain", ["progress","improvement"]],
  ["Travel is fatal to prejudice, bigotry, and narrow-mindedness.", "Mark Twain", ["travel","prejudice"]],
  ["Don't let schooling interfere with your education.", "Mark Twain", ["education","learning"]],
  ["The man who does not read has no advantage over the man who cannot read.", "Mark Twain", ["reading","education"]],
  // Lincoln
  ["Whatever you are, be a good one.", "Abraham Lincoln", ["character","excellence"]],
  ["The best way to predict the future is to create it.", "Abraham Lincoln", ["future","action"]],
  ["Nearly all men can stand adversity, but if you want to test a man's character, give him power.", "Abraham Lincoln", ["character","power"]],
  ["I am a slow walker, but I never walk back.", "Abraham Lincoln", ["perseverance","progress"]],
  ["You cannot escape the responsibility of tomorrow by evading it today.", "Abraham Lincoln", ["responsibility","action"]],
  ["Folks are usually about as happy as they make their minds up to be.", "Abraham Lincoln", ["happiness","mind"]],
  // Franklin
  ["By failing to prepare, you are preparing to fail.", "Benjamin Franklin", ["preparation","planning"]],
  ["An investment in knowledge pays the best interest.", "Benjamin Franklin", ["learning","knowledge"]],
  ["Tell me and I forget. Teach me and I remember. Involve me and I learn.", "Benjamin Franklin", ["education","learning"]],
  ["Lost time is never found again.", "Benjamin Franklin", ["time","regret"]],
  ["Honesty is the best policy.", "Benjamin Franklin", ["honesty","ethics"]],
  ["Well done is better than well said.", "Benjamin Franklin", ["action","words"]],
  ["Energy and persistence conquer all things.", "Benjamin Franklin", ["persistence","energy"]],
  ["He that can have patience can have what he will.", "Benjamin Franklin", ["patience","success"]],
  // Da Vinci
  ["Simplicity is the ultimate sophistication.", "Leonardo da Vinci", ["simplicity","art"]],
  ["Learning never exhausts the mind.", "Leonardo da Vinci", ["learning","mind"]],
  ["Obstacles cannot crush me; every obstacle yields to stern resolve.", "Leonardo da Vinci", ["resilience","resolve"]],
  ["Time stays long enough for anyone who will use it.", "Leonardo da Vinci", ["time","use"]],
  ["He who thinks little, errs much.", "Leonardo da Vinci", ["thought","error"]],
  ["Art is never finished, only abandoned.", "Leonardo da Vinci", ["art","perfectionism"]],
  // Einstein
  ["Imagination is more important than knowledge.", "Albert Einstein", ["imagination","knowledge","science"]],
  ["Try not to become a man of success, but rather try to become a man of value.", "Albert Einstein", ["success","value","science"]],
  ["The important thing is not to stop questioning.", "Albert Einstein", ["curiosity","questioning","science"]],
  ["Anyone who has never made a mistake has never tried anything new.", "Albert Einstein", ["mistakes","innovation","science"]],
  ["Logic will get you from A to B. Imagination will take you everywhere.", "Albert Einstein", ["imagination","logic","science"]],
  ["A person who never made a mistake never tried anything new.", "Albert Einstein", ["mistakes","innovation","science"]],
  ["The true sign of intelligence is not knowledge but imagination.", "Albert Einstein", ["intelligence","imagination","science"]],
  ["In the middle of difficulty lies opportunity.", "Albert Einstein", ["opportunity","difficulty","science"]],
  ["We cannot solve our problems with the same thinking we used when we created them.", "Albert Einstein", ["thinking","problems","science"]],
  ["Insanity is doing the same thing over and over again and expecting different results.", "Albert Einstein", ["change","action","science"]],
  ["Pure mathematics is, in its way, the poetry of logical ideas.", "Albert Einstein", ["mathematics","logic","science"]],
  ["Strive not to be a success, but rather to be of value.", "Albert Einstein", ["value","success","science"]],
  ["Life is like riding a bicycle. To keep your balance, you must keep moving.", "Albert Einstein", ["life","movement","science"]],
  // Mandela
  ["Education is the most powerful weapon which you can use to change the world.", "Nelson Mandela", ["education","change"]],
  ["It always seems impossible until it's done.", "Nelson Mandela", ["impossible","perseverance"]],
  ["I never lose. I either win or learn.", "Nelson Mandela", ["learning","resilience"]],
  ["A good head and a good heart are always a formidable combination.", "Nelson Mandela", ["mind","heart"]],
  ["The greatest glory in living lies not in never falling, but in rising every time we fall.", "Nelson Mandela", ["resilience","perseverance"]],
  // Gandhi
  ["The weak can never forgive. Forgiveness is the attribute of the strong.", "Mahatma Gandhi", ["forgiveness","strength"]],
  ["You must not lose faith in humanity. Humanity is an ocean; if a few drops are dirty, the ocean does not become dirty.", "Mahatma Gandhi", ["faith","humanity"]],
  ["Live as if you were to die tomorrow. Learn as if you were to live forever.", "Mahatma Gandhi", ["life","learning"]],
  ["Happiness is when what you think, what you say, and what you do are in harmony.", "Mahatma Gandhi", ["happiness","integrity"]],
  ["The future depends on what you do today.", "Mahatma Gandhi", ["future","action"]],
  ["Earth provides enough to satisfy every man's needs, but not every man's greed.", "Mahatma Gandhi", ["greed","sustainability"]],
  ["First they ignore you, then they laugh at you, then they fight you, then you win.", "Mahatma Gandhi", ["perseverance","change"]],
  // Socrates
  ["The only true wisdom is in knowing you know nothing.", "Socrates", ["wisdom","humility"]],
  ["The unexamined life is not worth living.", "Socrates", ["philosophy","life"]],
  ["I cannot teach anybody anything. I can only make them think.", "Socrates", ["teaching","thinking"]],
  ["An honest man is always a child.", "Socrates", ["honesty","character"]],
  ["He is richest who is content with the least, for content is the wealth of nature.", "Socrates", ["contentment","wealth"]],
  ["To find yourself, think for yourself.", "Socrates", ["self","independence"]],
  // Helen Keller
  ["Optimism is the faith that leads to achievement. Nothing can be done without hope and confidence.", "Helen Keller", ["optimism","achievement"]],
  ["The best and most beautiful things in the world cannot be seen or even touched - they must be felt with the heart.", "Helen Keller", ["beauty","heart"]],
  ["Although the world is full of suffering, it is also full of the overcoming of it.", "Helen Keller", ["suffering","resilience"]],
  ["Life is either a daring adventure or nothing at all.", "Helen Keller", ["life","courage"]],
  ["Walking with a friend in the dark is better than walking alone in the light.", "Helen Keller", ["friendship","companionship"]],
  // Roosevelt (Theodore)
  ["Believe you can and you're halfway there.", "Theodore Roosevelt", ["belief","confidence"]],
  ["Do what you can, with what you have, where you are.", "Theodore Roosevelt", ["action","resourcefulness"]],
  ["The more you read, the more things you will know.", "Theodore Roosevelt", ["reading","knowledge"]],
  ["Comparison is the thief of joy.", "Theodore Roosevelt", ["comparison","joy"]],
  ["Far and away the best prize that life has to offer is the chance to work hard at work worth doing.", "Theodore Roosevelt", ["work","purpose"]],
  ["Nothing in the world is worth having or worth doing unless it means effort, pain, difficulty.", "Theodore Roosevelt", ["effort","value"]],
  // Roosevelt (Eleanor)
  ["The future belongs to those who believe in the beauty of their dreams.", "Eleanor Roosevelt", ["dreams","future"]],
  ["No one can make you feel inferior without your consent.", "Eleanor Roosevelt", ["self-worth","independence"]],
  ["Do one thing every day that scares you.", "Eleanor Roosevelt", ["courage","growth"]],
  ["You must do the things you think you cannot do.", "Eleanor Roosevelt", ["courage","challenge"]],
  ["Great minds discuss ideas; average minds discuss events; small minds discuss people.", "Eleanor Roosevelt", ["mind","conversation"]],
  ["With the new day comes new strength and new thoughts.", "Eleanor Roosevelt", ["renewal","hope"]],
  // Churchill
  ["Success is not final, failure is not fatal: it is the courage to continue that counts.", "Winston Churchill", ["courage","perseverance"]],
  ["If you're going through hell, keep going.", "Winston Churchill", ["perseverance","resilience"]],
  ["Attitude is a little thing that makes a big difference.", "Winston Churchill", ["attitude","mindset"]],
  ["We make a living by what we get, but we make a life by what we give.", "Winston Churchill", ["giving","life"]],
  ["Success is going from failure to failure without losing your enthusiasm.", "Winston Churchill", ["success","enthusiasm"]],
  ["A pessimist sees the difficulty in every opportunity; an optimist sees the opportunity in every difficulty.", "Winston Churchill", ["optimism","mindset"]],
  ["History will be kind to me, for I intend to write it.", "Winston Churchill", ["history","intention"]],
  // Edison
  ["Genius is one percent inspiration and ninety-nine percent perspiration.", "Thomas Edison", ["genius","work"]],
  ["I have not failed. I've just found ten thousand ways that won't work.", "Thomas Edison", ["failure","persistence"]],
  ["Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.", "Thomas Edison", ["persistence","success"]],
  ["Many of life's failures are people who did not realize how close they were to success when they gave up.", "Thomas Edison", ["failure","persistence"]],
  ["Vision without execution is hallucination.", "Thomas Edison", ["vision","execution"]],
  // Tesla
  ["The present is theirs; the future, for which I really worked, is mine.", "Nikola Tesla", ["future","work","science"]],
  ["I do not think there is any thrill that can go through the human heart like that felt by the inventor.", "Nikola Tesla", ["invention","inspiration","science"]],
  ["If you want to find the secrets of the universe, think in terms of energy, frequency and vibration.", "Nikola Tesla", ["universe","science"]],
  // Nietzsche
  ["He who has a why to live for can bear almost any how.", "Friedrich Nietzsche", ["purpose","resilience","philosophy"]],
  ["That which does not kill us makes us stronger.", "Friedrich Nietzsche", ["resilience","strength","philosophy"]],
  ["You have your way. I have my way. As for the right way, the correct way, and the only way, it does not exist.", "Friedrich Nietzsche", ["truth","perspective","philosophy"]],
  ["Without music, life would be a mistake.", "Friedrich Nietzsche", ["music","life","philosophy"]],
  ["The man of knowledge must be able not only to love his enemies but also to hate his friends.", "Friedrich Nietzsche", ["knowledge","truth","philosophy"]],
  ["In every real man a child is hidden that wants to play.", "Friedrich Nietzsche", ["play","character","philosophy"]],
  // Camus
  ["In the depth of winter, I finally learned that within me there lay an invincible summer.", "Albert Camus", ["resilience","spirit","literature"]],
  ["The struggle itself toward the heights is enough to fill a man's heart.", "Albert Camus", ["struggle","meaning","literature"]],
  ["You will never be happy if you continue to search for what happiness consists of.", "Albert Camus", ["happiness","seeking","literature"]],
  ["Don't walk in front of me; I may not follow. Don't walk behind me; I may not lead. Just walk beside me.", "Albert Camus", ["friendship","equality","literature"]],
  // Hemingway
  ["The world breaks everyone, and afterward, some are strong at the broken places.", "Ernest Hemingway", ["resilience","strength","literature"]],
  ["There is nothing noble in being superior to your fellow man; true nobility is being superior to your former self.", "Ernest Hemingway", ["growth","character","literature"]],
  ["The best way to find out if you can trust somebody is to trust them.", "Ernest Hemingway", ["trust","literature"]],
  ["Courage is grace under pressure.", "Ernest Hemingway", ["courage","grace","literature"]],
  ["When people talk, listen completely.", "Ernest Hemingway", ["listening","attention","literature"]],
  // Frost
  ["Two roads diverged in a wood, and I took the one less traveled by, and that has made all the difference.", "Robert Frost", ["choice","independence","poetry"]],
  ["In three words I can sum up everything I've learned about life: it goes on.", "Robert Frost", ["life","resilience","poetry"]],
  ["The best way out is always through.", "Robert Frost", ["perseverance","challenge","poetry"]],
  ["Freedom lies in being bold.", "Robert Frost", ["freedom","courage","poetry"]],
  // Wilde
  ["Be yourself; everyone else is already taken.", "Oscar Wilde", ["authenticity","individuality","literature"]],
  ["To live is the rarest thing in the world. Most people exist, that is all.", "Oscar Wilde", ["life","existence","literature"]],
  ["I can resist anything except temptation.", "Oscar Wilde", ["humor","temptation","literature"]],
  ["We are all in the gutter, but some of us are looking at the stars.", "Oscar Wilde", ["hope","perspective","literature"]],
  ["Always forgive your enemies; nothing annoys them so much.", "Oscar Wilde", ["forgiveness","humor","literature"]],
  ["The truth is rarely pure and never simple.", "Oscar Wilde", ["truth","complexity","literature"]],
  ["Experience is simply the name we give our mistakes.", "Oscar Wilde", ["experience","mistakes","literature"]],
  ["I am so clever that sometimes I don't understand a single word of what I am saying.", "Oscar Wilde", ["humor","wit","literature"]],
  ["The only way to get rid of a temptation is to yield to it.", "Oscar Wilde", ["humor","temptation","literature"]],
  // Austen
  ["The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.", "Jane Austen", ["reading","books","literature"]],
  ["I declare after all there is no enjoyment like reading!", "Jane Austen", ["reading","joy","literature"]],
  ["There is no charm equal to tenderness of heart.", "Jane Austen", ["tenderness","heart","literature"]],
  ["It is not what we say or think that defines us, but what we do.", "Jane Austen", ["action","character","literature"]],
  // Voltaire
  ["I disapprove of what you say, but I will defend to the death your right to say it.", "Voltaire", ["freedom","speech","philosophy"]],
  ["The secret of being a bore is to tell everything.", "Voltaire", ["communication","wit","philosophy"]],
  ["Common sense is not so common.", "Voltaire", ["wisdom","humor","philosophy"]],
  ["Judge a man by his questions rather than by his answers.", "Voltaire", ["questions","judgment","philosophy"]],
  ["The best is the enemy of the good.", "Voltaire", ["perfectionism","good","philosophy"]],
  // Da Vinci more
  ["Iron rusts from disuse; water loses its purity from stagnation. Even so does inaction sap the vigor of the mind.", "Leonardo da Vinci", ["action","mind"]],
  // Tolstoy
  ["Everyone thinks of changing the world, but no one thinks of changing himself.", "Leo Tolstoy", ["change","self","literature"]],
  ["The two most powerful warriors are patience and time.", "Leo Tolstoy", ["patience","time","literature"]],
  ["If you want to be happy, be.", "Leo Tolstoy", ["happiness","simplicity","literature"]],
  ["All happy families are alike; each unhappy family is unhappy in its own way.", "Leo Tolstoy", ["family","happiness","literature"]],
  // Dostoevsky
  ["Above all, don't lie to yourself.", "Fyodor Dostoevsky", ["honesty","self","literature"]],
  ["To love is to suffer and there can be no love otherwise.", "Fyodor Dostoevsky", ["love","suffering","literature"]],
  ["The mystery of human existence lies not in just staying alive, but in finding something to live for.", "Fyodor Dostoevsky", ["meaning","life","literature"]],
  ["Pain and suffering are always inevitable for a large intelligence and a deep heart.", "Fyodor Dostoevsky", ["suffering","intelligence","literature"]],
  // Gibran
  ["Out of suffering have emerged the strongest souls; the most massive characters are seared with scars.", "Kahlil Gibran", ["suffering","character"]],
  ["Faith is a knowledge within the heart, beyond the reach of proof.", "Kahlil Gibran", ["faith","heart"]],
  ["Beauty is eternity gazing at itself in a mirror.", "Kahlil Gibran", ["beauty","eternity"]],
  ["Trust in dreams, for in them is hidden the gate to eternity.", "Kahlil Gibran", ["dreams","eternity"]],
  // Plutarch
  ["The mind is not a vessel to be filled, but a fire to be kindled.", "Plutarch", ["mind","education"]],
  ["Painting is silent poetry, and poetry is painting that speaks.", "Plutarch", ["art","poetry"]],
  // Rumi
  ["Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.", "Rumi", ["wisdom","self","poetry"]],
  ["You were born with wings, why prefer to crawl through life?", "Rumi", ["potential","life","poetry"]],
  ["The wound is the place where the light enters you.", "Rumi", ["healing","light","poetry"]],
  ["What you seek is seeking you.", "Rumi", ["seeking","destiny","poetry"]],
  ["Be like the sun for grace and mercy. Be like the night to cover others' faults.", "Rumi", ["mercy","character","poetry"]],
  ["When you do things from your soul, you feel a river moving in you, a joy.", "Rumi", ["soul","joy","poetry"]],
  // Carl Sagan
  ["Somewhere, something incredible is waiting to be known.", "Carl Sagan", ["wonder","science"]],
  ["We are made of star-stuff.", "Carl Sagan", ["science","cosmos"]],
  ["For small creatures such as we the vastness is bearable only through love.", "Carl Sagan", ["love","cosmos","science"]],
  ["Imagination will often carry us to worlds that never were, but without it we go nowhere.", "Carl Sagan", ["imagination","science"]],
  ["Books are key to understanding the world.", "Carl Sagan", ["books","reading","science"]],
  // Feynman
  ["The first principle is that you must not fool yourself, and you are the easiest person to fool.", "Richard Feynman", ["honesty","science"]],
  ["I would rather have questions that can't be answered than answers that can't be questioned.", "Richard Feynman", ["questions","science"]],
  ["I think it's much more interesting to live not knowing than to have answers which might be wrong.", "Richard Feynman", ["uncertainty","science"]],
  ["Nobody ever figures out what life is all about, and it doesn't matter. Explore the world.", "Richard Feynman", ["exploration","life","science"]],
  // Hawking
  ["Intelligence is the ability to adapt to change.", "Stephen Hawking", ["intelligence","change","science"]],
  ["Look up at the stars and not down at your feet.", "Stephen Hawking", ["wonder","perspective","science"]],
  ["However difficult life may seem, there is always something you can do and succeed at.", "Stephen Hawking", ["perseverance","success","science"]],
  ["Quiet people have the loudest minds.", "Stephen Hawking", ["mind","quiet","science"]],
  // Curie
  ["Nothing in life is to be feared, it is only to be understood.", "Marie Curie", ["fear","understanding","science"]],
  ["Be less curious about people and more curious about ideas.", "Marie Curie", ["curiosity","ideas","science"]],
  ["I was taught that the way of progress was neither swift nor easy.", "Marie Curie", ["progress","work","science"]],
  // Bertrand Russell
  ["The whole problem with the world is that fools and fanatics are always so certain of themselves.", "Bertrand Russell", ["doubt","wisdom","philosophy"]],
  ["The good life is one inspired by love and guided by knowledge.", "Bertrand Russell", ["love","knowledge","philosophy"]],
  ["To conquer fear is the beginning of wisdom.", "Bertrand Russell", ["fear","wisdom","philosophy"]],
  ["Three passions, simple but overwhelmingly strong, have governed my life: the longing for love, the search for knowledge, and unbearable pity for the suffering of mankind.", "Bertrand Russell", ["love","knowledge","philosophy"]],
  // Carl Jung
  ["Until you make the unconscious conscious, it will direct your life and you will call it fate.", "Carl Jung", ["consciousness","psychology"]],
  ["The privilege of a lifetime is to become who you truly are.", "Carl Jung", ["self","authenticity","psychology"]],
  ["Knowing your own darkness is the best method for dealing with the darknesses of other people.", "Carl Jung", ["self","empathy","psychology"]],
  ["Where love rules, there is no will to power; and where power predominates, there love is lacking.", "Carl Jung", ["love","power","psychology"]],
  // Maya Angelou
  ["I've learned that people will forget what you said, people will forget what you did, but people will never forget how you made them feel.", "Maya Angelou", ["feeling","character"]],
  ["If you don't like something, change it. If you can't change it, change your attitude.", "Maya Angelou", ["change","attitude"]],
  ["Try to be a rainbow in someone's cloud.", "Maya Angelou", ["kindness","hope"]],
  ["There is no greater agony than bearing an untold story inside you.", "Maya Angelou", ["story","expression"]],
  ["You will face many defeats in life, but never let yourself be defeated.", "Maya Angelou", ["resilience","defeat"]],
  // Carl Rogers
  ["The only person who is educated is the one who has learned how to learn and change.", "Carl Rogers", ["learning","change","psychology"]],
  ["What I am is good enough if I would only be it openly.", "Carl Rogers", ["authenticity","self","psychology"]],
  // James Baldwin
  ["Not everything that is faced can be changed, but nothing can be changed until it is faced.", "James Baldwin", ["change","courage","literature"]],
  ["The most dangerous creation of any society is the man who has nothing to lose.", "James Baldwin", ["society","despair","literature"]],
  ["Love takes off masks that we fear we cannot live without and know we cannot live within.", "James Baldwin", ["love","authenticity","literature"]],
  // Toni Morrison
  ["If there's a book that you want to read, but it hasn't been written yet, then you must write it.", "Toni Morrison", ["writing","books","literature"]],
  ["You wanna fly, you got to give up the shit that weighs you down.", "Toni Morrison", ["freedom","letting-go","literature"]],
  // Steinbeck
  ["I have come to believe that a great teacher is a great artist and that there are as few as there are any other great artists.", "John Steinbeck", ["teaching","art","literature"]],
  ["A journey is a person in itself; no two are alike.", "John Steinbeck", ["journey","individuality","literature"]],
  // Kafka
  ["A book must be the axe for the frozen sea inside us.", "Franz Kafka", ["books","literature"]],
  ["Anyone who keeps the ability to see beauty never grows old.", "Franz Kafka", ["beauty","youth","literature"]],
  ["By believing passionately in something that still does not exist, we create it.", "Franz Kafka", ["belief","creation","literature"]],
  // Carl Sandburg
  ["Time is the coin of your life. It is the only coin you have, and only you can determine how it will be spent.", "Carl Sandburg", ["time","life"]],
  ["Poetry is the synthesis of hyacinths and biscuits.", "Carl Sandburg", ["poetry","art"]],
  // Henry Ford
  ["Whether you think you can, or you think you can't, you're right.", "Henry Ford", ["mindset","belief"]],
  ["Anyone who stops learning is old, whether at twenty or eighty.", "Henry Ford", ["learning","age"]],
  ["Coming together is a beginning; keeping together is progress; working together is success.", "Henry Ford", ["teamwork","success"]],
  ["Failure is simply the opportunity to begin again, this time more intelligently.", "Henry Ford", ["failure","opportunity"]],
  ["You can't build a reputation on what you are going to do.", "Henry Ford", ["reputation","action"]],
  // Steve Jobs
  ["Stay hungry, stay foolish.", "Steve Jobs", ["curiosity","ambition"]],
  ["Innovation distinguishes between a leader and a follower.", "Steve Jobs", ["innovation","leadership"]],
  ["Your time is limited, so don't waste it living someone else's life.", "Steve Jobs", ["time","authenticity"]],
  ["Sometimes life hits you in the head with a brick. Don't lose faith.", "Steve Jobs", ["resilience","faith"]],
  ["Design is not just what it looks like and feels like. Design is how it works.", "Steve Jobs", ["design","function"]],
  ["I want to put a ding in the universe.", "Steve Jobs", ["ambition","impact"]],
  // C.S. Lewis
  ["You are never too old to set another goal or to dream a new dream.", "C.S. Lewis", ["goals","dreams","literature"]],
  ["We are what we believe we are.", "C.S. Lewis", ["belief","identity","literature"]],
  ["Friendship is born at that moment when one person says to another, 'What! You too?'", "C.S. Lewis", ["friendship","literature"]],
  ["Integrity is doing the right thing, even when no one is watching.", "C.S. Lewis", ["integrity","character","literature"]],
  ["Hardships often prepare ordinary people for an extraordinary destiny.", "C.S. Lewis", ["hardship","destiny","literature"]],
  // Tolkien
  ["Not all those who wander are lost.", "J.R.R. Tolkien", ["journey","seeking","literature"]],
  ["Even the smallest person can change the course of the future.", "J.R.R. Tolkien", ["impact","future","literature"]],
  ["All we have to decide is what to do with the time that is given us.", "J.R.R. Tolkien", ["time","choice","literature"]],
  ["Faithless is he that says farewell when the road darkens.", "J.R.R. Tolkien", ["loyalty","friendship","literature"]],
  // Milne
  ["You are braver than you believe, stronger than you seem, and smarter than you think.", "A.A. Milne", ["courage","strength","literature"]],
  ["What day is it?' asked Pooh. 'It's today,' squeaked Piglet. 'My favorite day,' said Pooh.", "A.A. Milne", ["present","joy","literature"]],
  // Carl Rogers more
  ["The curious paradox is that when I accept myself just as I am, then I can change.", "Carl Rogers", ["acceptance","change","psychology"]],
  // Walt Whitman
  ["Keep your face always toward the sunshine - and shadows will fall behind you.", "Walt Whitman", ["optimism","poetry"]],
  ["I exist as I am, that is enough.", "Walt Whitman", ["self","acceptance","poetry"]],
  ["Resist much, obey little.", "Walt Whitman", ["resistance","independence","poetry"]],
  ["Be curious, not judgmental.", "Walt Whitman", ["curiosity","openness","poetry"]],
  // Emily Dickinson
  ["Hope is the thing with feathers that perches in the soul.", "Emily Dickinson", ["hope","soul","poetry"]],
  ["If I can stop one heart from breaking, I shall not live in vain.", "Emily Dickinson", ["meaning","kindness","poetry"]],
  ["The truth must dazzle gradually or every man be blind.", "Emily Dickinson", ["truth","poetry"]],
  // Virginia Woolf
  ["For most of history, Anonymous was a woman.", "Virginia Woolf", ["history","women","literature"]],
  ["No need to hurry. No need to sparkle. No need to be anybody but oneself.", "Virginia Woolf", ["authenticity","self","literature"]],
  ["Lock up your libraries if you like; but there is no gate, no lock, no bolt that you can set upon the freedom of my mind.", "Virginia Woolf", ["freedom","mind","literature"]],
  // Anaïs Nin
  ["We don't see things as they are, we see them as we are.", "Anaïs Nin", ["perception","self","literature"]],
  ["And the day came when the risk to remain tight in a bud was more painful than the risk it took to blossom.", "Anaïs Nin", ["growth","change","literature"]],
  ["Life shrinks or expands in proportion to one's courage.", "Anaïs Nin", ["courage","life","literature"]],
  // Plato more
  ["Courage is knowing what not to fear.", "Plato", ["courage","wisdom"]],
  ["The greatest wealth is to live content with little.", "Plato", ["wealth","contentment"]],
  // Buddha
  ["What we think, we become.", "Buddha", ["mind","becoming"]],
  ["Three things cannot be long hidden: the sun, the moon, and the truth.", "Buddha", ["truth"]],
  ["Peace comes from within. Do not seek it without.", "Buddha", ["peace","self"]],
  ["The mind is everything. What you think you become.", "Buddha", ["mind","thought"]],
  ["Better than a thousand hollow words is one word that brings peace.", "Buddha", ["words","peace"]],
  ["You will not be punished for your anger; you will be punished by your anger.", "Buddha", ["anger","wisdom"]],
  ["Holding onto anger is like drinking poison and expecting the other person to die.", "Buddha", ["anger","forgiveness"]],
  // Anne Frank
  ["How wonderful it is that nobody need wait a single moment before starting to improve the world.", "Anne Frank", ["change","action"]],
  ["Whoever is happy will make others happy too.", "Anne Frank", ["happiness","kindness"]],
  ["Think of all the beauty still left around you and be happy.", "Anne Frank", ["beauty","gratitude"]],
  // William Blake
  ["The road of excess leads to the palace of wisdom.", "William Blake", ["wisdom","experience","poetry"]],
  ["A truth that's told with bad intent beats all the lies you can invent.", "William Blake", ["truth","intention","poetry"]],
  // John Donne
  ["No man is an island entire of itself; every man is a piece of the continent.", "John Donne", ["unity","humanity","poetry"]],
  // Carl Sandburg more
  ["Nothing happens unless first we dream.", "Carl Sandburg", ["dreams","action"]],
  // Henry James
  ["Three things in human life are important. The first is to be kind. The second is to be kind. The third is to be kind.", "Henry James", ["kindness","literature"]],
  // T.S. Eliot
  ["Only those who will risk going too far can possibly find out how far one can go.", "T.S. Eliot", ["risk","limits","literature"]],
  ["The only wisdom we can hope to acquire is the wisdom of humility.", "T.S. Eliot", ["wisdom","humility","literature"]],
  // Ezra Pound
  ["Make it new.", "Ezra Pound", ["innovation","art","literature"]],
  // Joseph Campbell
  ["Follow your bliss and the universe will open doors for you where there were only walls.", "Joseph Campbell", ["bliss","destiny"]],
  ["The cave you fear to enter holds the treasure you seek.", "Joseph Campbell", ["fear","treasure"]],
  ["We must let go of the life we have planned, so as to accept the one that is waiting for us.", "Joseph Campbell", ["change","acceptance"]],
  // Norman Vincent Peale
  ["Change your thoughts and you change your world.", "Norman Vincent Peale", ["mind","change"]],
  ["Empty pockets never held anyone back. Only empty heads and empty hearts can do that.", "Norman Vincent Peale", ["mindset","heart"]],
  // Viktor Frankl
  ["Between stimulus and response there is a space. In that space is our power to choose our response.", "Viktor Frankl", ["choice","response","psychology"]],
  ["When we are no longer able to change a situation, we are challenged to change ourselves.", "Viktor Frankl", ["change","self","psychology"]],
  ["Those who have a why to live, can bear with almost any how.", "Viktor Frankl", ["purpose","resilience","psychology"]],
  // Carl Sandburg
  ["Life is like an onion: You peel it off one layer at a time, and sometimes you weep.", "Carl Sandburg", ["life"]],
  // Coco Chanel
  ["The most courageous act is still to think for yourself.", "Coco Chanel", ["courage","independence"]],
  ["In order to be irreplaceable, one must always be different.", "Coco Chanel", ["uniqueness","value"]],
  ["A girl should be two things: who and what she wants.", "Coco Chanel", ["self","authenticity"]],
  // Bruce Lee
  ["Knowing is not enough; we must apply. Willing is not enough; we must do.", "Bruce Lee", ["action","application"]],
  ["Do not pray for an easy life, pray for the strength to endure a difficult one.", "Bruce Lee", ["strength","endurance"]],
  ["Empty your cup so that it may be filled; become devoid to gain totality.", "Bruce Lee", ["openness","learning"]],
  ["Be water, my friend.", "Bruce Lee", ["adaptability"]],
  ["A goal is not always meant to be reached, it often serves simply as something to aim at.", "Bruce Lee", ["goals","aim"]],
  // Audrey Hepburn
  ["Nothing is impossible, the word itself says I'm possible!", "Audrey Hepburn", ["possibility","optimism"]],
  ["The most important thing is to enjoy your life - to be happy - it's all that matters.", "Audrey Hepburn", ["happiness","life"]],
  // John Lennon
  ["Life is what happens when you're busy making other plans.", "John Lennon", ["life","plans"]],
  ["You may say I'm a dreamer, but I'm not the only one.", "John Lennon", ["dreams","unity"]],
  ["Imagine all the people living life in peace.", "John Lennon", ["peace","unity"]],
  // Bob Marley
  ["The greatness of a man is not in how much wealth he acquires, but in his integrity and his ability to affect those around him positively.", "Bob Marley", ["greatness","integrity"]],
  ["Live the life you love. Love the life you live.", "Bob Marley", ["life","love"]],
  // Mother Teresa
  ["If you can't feed a hundred people, then feed just one.", "Mother Teresa", ["service","kindness"]],
  ["Spread love everywhere you go. Let no one ever come to you without leaving happier.", "Mother Teresa", ["love","kindness"]],
  ["Peace begins with a smile.", "Mother Teresa", ["peace","kindness"]],
  // Oprah
  ["The biggest adventure you can take is to live the life of your dreams.", "Oprah Winfrey", ["dreams","adventure"]],
  ["Turn your wounds into wisdom.", "Oprah Winfrey", ["wisdom","healing"]],
  // Stoic / generic
  ["Action is the antidote to despair.", "Joan Baez", ["action","despair"]],
  ["The only impossible journey is the one you never begin.", "Tony Robbins", ["beginning","journey"]],
  ["Setting goals is the first step in turning the invisible into the visible.", "Tony Robbins", ["goals","vision"]],
  // Erica Jong
  ["Take your life in your own hands, and what happens? A terrible thing: no one to blame.", "Erica Jong", ["responsibility","life"]],
  // Drucker
  ["The best way to predict the future is to create it.", "Peter Drucker", ["future","creation"]],
  ["Management is doing things right; leadership is doing the right things.", "Peter Drucker", ["leadership","management"]],
  ["What gets measured gets managed.", "Peter Drucker", ["measurement","management"]],
  // Tao Te Ching extra
  ["A leader is best when people barely know he exists.", "Lao Tzu", ["leadership","taoism"]],
  ["The wise man does not lay up his own treasures. The more he gives to others, the more he has for his own.", "Lao Tzu", ["giving","wisdom","taoism"]],
  // Kahlil Gibran more
  ["Work is love made visible.", "Kahlil Gibran", ["work","love"]],
  ["The deeper that sorrow carves into your being, the more joy you can contain.", "Kahlil Gibran", ["sorrow","joy"]],
  // Heraclitus
  ["No man ever steps in the same river twice, for it's not the same river and he's not the same man.", "Heraclitus", ["change","philosophy"]],
  ["The only constant in life is change.", "Heraclitus", ["change","philosophy"]],
  // Goethe
  ["Knowing is not enough; we must apply. Wishing is not enough; we must do.", "Johann Wolfgang von Goethe", ["action","application"]],
  ["Magic is believing in yourself. If you can do that, you can make anything happen.", "Johann Wolfgang von Goethe", ["belief","magic"]],
  ["He who is fixed to a star does not change his mind.", "Johann Wolfgang von Goethe", ["constancy","purpose"]],
  ["Whatever you can do, or dream you can, begin it. Boldness has genius, power and magic in it.", "Johann Wolfgang von Goethe", ["boldness","action"]],
  // Schopenhauer
  ["Talent hits a target no one else can hit; genius hits a target no one else can see.", "Arthur Schopenhauer", ["genius","talent","philosophy"]],
  ["Compassion is the basis of morality.", "Arthur Schopenhauer", ["compassion","ethics","philosophy"]],
  // Pascal
  ["All of humanity's problems stem from man's inability to sit quietly in a room alone.", "Blaise Pascal", ["solitude","humanity","philosophy"]],
  ["The heart has its reasons of which reason knows nothing.", "Blaise Pascal", ["heart","reason","philosophy"]],
  // Kierkegaard
  ["Anxiety is the dizziness of freedom.", "Søren Kierkegaard", ["anxiety","freedom","philosophy"]],
  ["Life can only be understood backwards; but it must be lived forwards.", "Søren Kierkegaard", ["life","time","philosophy"]],
  // Sartre
  ["Freedom is what you do with what's been done to you.", "Jean-Paul Sartre", ["freedom","response","philosophy"]],
  ["Life has no meaning the moment you lose the illusion of being eternal.", "Jean-Paul Sartre", ["life","meaning","philosophy"]],
  // de Beauvoir
  ["One is not born, but rather becomes, a woman.", "Simone de Beauvoir", ["women","identity","philosophy"]],
  ["Change your life today. Don't gamble on the future, act now, without delay.", "Simone de Beauvoir", ["change","action","philosophy"]],
  // Hannah Arendt
  ["The most radical revolutionary will become a conservative the day after the revolution.", "Hannah Arendt", ["change","politics","philosophy"]],
  // James Joyce
  ["Mistakes are the portals of discovery.", "James Joyce", ["mistakes","discovery","literature"]],
  // Dorothy Parker
  ["The cure for boredom is curiosity. There is no cure for curiosity.", "Dorothy Parker", ["curiosity","boredom","literature"]],
  // E. E. Cummings
  ["The most wasted of all days is one without laughter.", "E.E. Cummings", ["laughter","life"]],
  ["To be nobody but yourself in a world which is doing its best to make you everybody else means to fight the hardest battle which any human being can fight.", "E.E. Cummings", ["authenticity","self"]],
  // Rilke
  ["Be patient toward all that is unsolved in your heart and try to love the questions themselves.", "Rainer Maria Rilke", ["patience","questions","poetry"]],
  ["Perhaps all the dragons in our lives are princesses who are only waiting to see us act, just once, with beauty and courage.", "Rainer Maria Rilke", ["transformation","courage","poetry"]],
  ["The only journey is the one within.", "Rainer Maria Rilke", ["journey","self","poetry"]],
  // Margaret Mead
  ["Never doubt that a small group of thoughtful, committed citizens can change the world; indeed, it's the only thing that ever has.", "Margaret Mead", ["change","activism"]],
  // Carl Sandburg
  ["A baby is God's opinion that the world should go on.", "Carl Sandburg", ["birth","hope"]],
  // Kurt Vonnegut
  ["We are what we pretend to be, so we must be careful about what we pretend to be.", "Kurt Vonnegut", ["identity","authenticity","literature"]],
  ["So it goes.", "Kurt Vonnegut", ["acceptance","literature"]],
  // Maya Angelou
  ["My mission in life is not merely to survive, but to thrive.", "Maya Angelou", ["thriving","life"]],
  ["Nothing will work unless you do.", "Maya Angelou", ["work","action"]],
  ["When you know better, do better.", "Maya Angelou", ["growth","ethics"]],
  // Quincy Jones
  ["Imagine what would happen if everybody in the world realized how much they need each other.", "Quincy Jones", ["unity","need"]],
  // Anonymous / Folk
  ["The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese Proverb", ["action","beginning"]],
  ["A journey of a thousand miles begins with a single step.", "Chinese Proverb", ["journey","beginning"]],
  ["Fall seven times, stand up eight.", "Japanese Proverb", ["resilience","perseverance"]],
  ["The bamboo that bends is stronger than the oak that resists.", "Japanese Proverb", ["flexibility","strength"]],
  ["Dripping water hollows out stone, not through force but through persistence.", "Ovid", ["persistence","time"]],
  ["A book is a dream that you hold in your hand.", "Neil Gaiman", ["books","dreams","literature"]],
  ["You get in life what you have the courage to ask for.", "Oprah Winfrey", ["courage","asking"]],
  // Carl Jung
  ["The shoe that fits one person pinches another; there is no recipe for living that suits all cases.", "Carl Jung", ["individuality","life","psychology"]],
  // Viktor Frankl
  ["What is to give light must endure burning.", "Viktor Frankl", ["sacrifice","purpose","psychology"]],
  // Ursula K. Le Guin
  ["The only thing that makes life possible is permanent, intolerable uncertainty: not knowing what comes next.", "Ursula K. Le Guin", ["uncertainty","life","literature"]],
  ["It is good to have an end to journey toward; but it is the journey that matters, in the end.", "Ursula K. Le Guin", ["journey","destination","literature"]],
  // Ray Bradbury
  ["You don't have to burn books to destroy a culture. Just get people to stop reading them.", "Ray Bradbury", ["reading","culture","literature"]],
  ["Stuff your eyes with wonder, live as if you'd drop dead in ten seconds.", "Ray Bradbury", ["wonder","living","literature"]],
  // Isaac Asimov
  ["The true delight is in the finding out rather than in the knowing.", "Isaac Asimov", ["discovery","learning","science"]],
  ["Those people who think they know everything are a great annoyance to those of us who do.", "Isaac Asimov", ["humor","knowledge","science"]],
  // Carl Sagan
  ["We are a way for the cosmos to know itself.", "Carl Sagan", ["cosmos","awareness","science"]],
  ["The absence of evidence is not evidence of absence.", "Carl Sagan", ["evidence","science"]],
  // Various motivational
  ["Don't watch the clock; do what it does. Keep going.", "Sam Levenson", ["perseverance","time"]],
  ["The harder you work for something, the greater you'll feel when you achieve it.", "Anonymous", ["work","achievement"]],
  ["Quality is never an accident; it is always the result of intelligent effort.", "John Ruskin", ["quality","effort"]],
  ["Beautiful things don't ask for attention.", "Sean O'Connell", ["beauty","humility"]],
  // Final batch — Misc literary
  ["Whatever our souls are made of, his and mine are the same.", "Emily Brontë", ["love","souls","literature"]],
  ["I solemnly swear that I am up to no good.", "J.K. Rowling", ["mischief","literature"]],
  ["It does not do to dwell on dreams and forget to live.", "J.K. Rowling", ["dreams","living","literature"]],
  ["It is our choices that show what we truly are, far more than our abilities.", "J.K. Rowling", ["choice","character","literature"]],
  ["Happiness can be found, even in the darkest of times, if one only remembers to turn on the light.", "J.K. Rowling", ["happiness","hope","literature"]],
];

const NEW_IDIOMS = [
  ["barking up the wrong tree", "pursuing a mistaken or misguided line of thought or action", ["mistake","american-english"]],
  ["beat around the bush", "to avoid talking about something directly", ["communication"]],
  ["bite the bullet", "to face a difficult or unpleasant situation with courage", ["courage","american-english"]],
  ["break the ice", "to begin a conversation in a friendly way", ["communication"]],
  ["call it a day", "to stop work on something", ["work"]],
  ["cost an arm and a leg", "to be very expensive", ["money"]],
  ["cut to the chase", "to get to the point quickly", ["communication","american-english"]],
  ["once in a blue moon", "very rarely", ["time"]],
  ["piece of cake", "something very easy", ["ease"]],
  ["raining cats and dogs", "raining very heavily", ["weather","british-english"]],
  ["spill the beans", "to reveal a secret", ["secrets"]],
  ["the ball is in your court", "it's your turn to make a decision", ["decision","american-english"]],
  ["under the weather", "feeling unwell", ["health"]],
  ["when pigs fly", "something that will never happen", ["impossibility"]],
  ["a blessing in disguise", "an apparent misfortune that turns out well", ["fortune"]],
  ["a dime a dozen", "very common and of little value", ["value","american-english"]],
  ["actions speak louder than words", "what someone does is more telling than what they say", ["action"]],
  ["add insult to injury", "to make a bad situation worse", ["worsening"]],
  ["at the drop of a hat", "without any hesitation; instantly", ["spontaneity"]],
  ["back to the drawing board", "starting over after a failed attempt", ["restart"]],
  ["be on cloud nine", "to be extremely happy", ["happiness"]],
  ["bend over backwards", "to try very hard to please someone", ["effort"]],
  ["best of both worlds", "an ideal situation in which two desirable but seemingly contradictory things are possible", ["balance"]],
  ["bite off more than you can chew", "to take on more than you can handle", ["overcommitment"]],
  ["blessing in disguise", "an apparent misfortune that has a fortunate outcome", ["fortune"]],
  ["burn bridges", "to damage relationships beyond repair", ["relationships"]],
  ["burning the midnight oil", "working late into the night", ["work","effort"]],
  ["by the skin of your teeth", "barely succeeding", ["narrow-escape"]],
  ["catch someone red-handed", "to catch someone in the act of doing something wrong", ["caught"]],
  ["caught between a rock and a hard place", "facing two equally difficult choices", ["dilemma"]],
  ["chip on your shoulder", "an angry attitude or grudge", ["resentment"]],
  ["come hell or high water", "no matter what difficulties arise", ["determination"]],
  ["cross that bridge when you come to it", "deal with a problem when it arises, not before", ["procrastination"]],
  ["cry over spilled milk", "to complain about something that has already happened and cannot be changed", ["regret"]],
  ["curiosity killed the cat", "being inquisitive can lead to trouble", ["caution","curiosity"]],
  ["devil's advocate", "one who argues an opposing position for the sake of debate", ["argument"]],
  ["don't count your chickens before they hatch", "don't assume success before it actually happens", ["caution","prudence"]],
  ["don't put all your eggs in one basket", "don't risk everything on a single venture", ["caution","prudence"]],
  ["down to the wire", "until the last possible moment", ["deadline"]],
  ["draw the line", "to set a limit on what one will accept", ["boundaries"]],
  ["drop in the bucket", "a very small amount compared to what is needed", ["small"]],
  ["easy does it", "go slowly and carefully", ["caution"]],
  ["every cloud has a silver lining", "even bad situations have some positive aspect", ["optimism"]],
  ["fit as a fiddle", "in good physical health", ["health"]],
  ["follow your nose", "go straight ahead, or follow your instinct", ["intuition"]],
  ["from scratch", "starting from the very beginning", ["beginning"]],
  ["get cold feet", "to become nervous about doing something", ["fear","hesitation"]],
  ["get out of hand", "to become uncontrollable", ["control"]],
  ["get your act together", "to organize yourself or improve your behavior", ["organization"]],
  ["give the benefit of the doubt", "to believe someone's account, even if it's questionable", ["trust"]],
  ["go on a wild goose chase", "to pursue something that proves to be a waste of time", ["futility"]],
  ["go the extra mile", "to make a special effort to achieve something", ["effort"]],
  ["happy camper", "a person who is content with their situation", ["happiness"]],
  ["have a chip on your shoulder", "to hold a grudge or feel resentment", ["resentment"]],
  ["have your head in the clouds", "to be daydreaming or unrealistic", ["dreaming"]],
  ["hit the books", "to study hard", ["study","american-english"]],
  ["hit the nail on the head", "to do or say something exactly right", ["accuracy"]],
  ["hit the sack", "to go to bed", ["sleep","american-english"]],
  ["hold your horses", "wait or slow down", ["patience"]],
  ["in the heat of the moment", "doing or saying something rash without thinking", ["rashness"]],
  ["it takes two to tango", "more than one person is responsible for an action or situation", ["responsibility"]],
  ["jump on the bandwagon", "to join a popular trend", ["conformity"]],
  ["jump through hoops", "to do many different tasks to achieve a goal", ["effort","obstacles"]],
  ["keep an eye on", "to watch carefully", ["watchfulness"]],
  ["keep your chin up", "stay positive in difficult times", ["resilience"]],
  ["kill two birds with one stone", "to accomplish two things with a single action", ["efficiency"]],
  ["last straw", "the final problem that causes an unbearable situation", ["limit"]],
  ["leave no stone unturned", "to search exhaustively", ["thoroughness"]],
  ["let the cat out of the bag", "to reveal a secret", ["secrets"]],
  ["like two peas in a pod", "very similar", ["similarity"]],
  ["miss the boat", "to miss an opportunity", ["opportunity"]],
  ["no pain, no gain", "you must work hard to achieve worthwhile goals", ["effort"]],
  ["off the hook", "no longer in trouble or responsible", ["responsibility"]],
  ["off the top of my head", "without thinking carefully or doing research", ["spontaneity"]],
  ["on the ball", "alert, attentive, doing a good job", ["attention"]],
  ["on the fence", "undecided", ["indecision"]],
  ["out of the blue", "unexpectedly", ["surprise"]],
  ["pass the buck", "to shift responsibility to someone else", ["responsibility"]],
  ["pay through the nose", "to pay an exorbitant amount", ["money"]],
  ["pull yourself together", "calm down and behave normally", ["composure"]],
  ["pull someone's leg", "to tease or joke with someone", ["humor"]],
  ["read between the lines", "to understand the implied meaning", ["comprehension"]],
  ["right as rain", "feeling fine and healthy", ["health"]],
  ["rule of thumb", "a general principle", ["principle"]],
  ["see eye to eye", "to agree", ["agreement"]],
  ["sit on the fence", "to be undecided", ["indecision"]],
  ["sleep on it", "take time to think before deciding", ["decision","patience"]],
  ["speak of the devil", "said when a person being discussed appears", ["coincidence"]],
  ["steal someone's thunder", "to take credit for or attention from someone else's accomplishment", ["credit"]],
  ["take it with a grain of salt", "to be skeptical about what you hear", ["skepticism"]],
  ["take the bull by the horns", "to confront a problem directly", ["courage"]],
  ["the early bird catches the worm", "those who act first have the advantage", ["timing"]],
  ["the elephant in the room", "an obvious problem that no one wants to discuss", ["avoidance"]],
  ["the last laugh", "ultimate triumph after apparent defeat", ["victory"]],
  ["throw caution to the wind", "to take a risk", ["risk"]],
  ["throw in the towel", "to give up", ["surrender"]],
  ["tip of the iceberg", "only a small, visible part of a much larger situation", ["surface"]],
  ["to make a long story short", "to summarize", ["brevity"]],
  ["touch base", "to make brief contact", ["contact"]],
  ["turn over a new leaf", "to start fresh, change one's behavior", ["change"]],
  ["two heads are better than one", "collaboration produces better results", ["collaboration"]],
  ["under your nose", "right in front of you, but unnoticed", ["oversight"]],
  ["up in the air", "uncertain, undecided", ["uncertainty"]],
  ["wear your heart on your sleeve", "to display emotions openly", ["emotion"]],
  ["wet behind the ears", "young and inexperienced", ["youth"]],
  ["where there's a will, there's a way", "determination overcomes obstacles", ["determination"]],
  ["wild goose chase", "a pointless pursuit", ["futility"]],
  ["wrap your head around", "to understand something complex", ["comprehension"]],
  ["wrong side of the bed", "in a bad mood", ["mood"]],
  ["you can't have your cake and eat it too", "you can't enjoy two desirable but mutually exclusive things", ["choice"]],
  ["you can't judge a book by its cover", "appearances can be deceiving", ["appearance"]],
  ["a chip off the old block", "a child who resembles their parent", ["family"]],
  ["a stitch in time saves nine", "fixing a problem early prevents bigger problems later", ["prevention"]],
  ["all bark and no bite", "someone who threatens but doesn't act", ["threat"]],
  ["all hands on deck", "everyone needs to help", ["teamwork"]],
  ["apple of one's eye", "someone cherished above all others", ["love"]],
  ["as easy as pie", "very easy", ["ease"]],
  ["at the eleventh hour", "at the last possible moment", ["timing"]],
  ["bark is worse than their bite", "their threatening manner is worse than their actions", ["threat"]],
  ["bear a grudge", "to hold resentment", ["resentment"]],
  ["beat a dead horse", "to continue an effort that's already failed", ["futility"]],
  ["bend the truth", "to lie slightly", ["honesty"]],
  ["between a rock and a hard place", "stuck between two bad options", ["dilemma"]],
  ["bird's eye view", "an overview from above", ["perspective"]],
  ["bite your tongue", "stop yourself from saying something", ["restraint"]],
  ["blow off steam", "to release pent-up frustration", ["release"]],
  ["blow your own horn", "to brag about yourself", ["pride"]],
  ["bury the hatchet", "to make peace after a conflict", ["peace"]],
  ["caught in the act", "caught while doing something wrong", ["caught"]],
  ["change of heart", "a change in feelings or opinion", ["change"]],
  ["clear the air", "to resolve misunderstandings", ["resolution"]],
  ["close, but no cigar", "very nearly successful but not quite", ["near-miss"]],
  ["cold shoulder", "deliberate ignoring or rejection", ["rejection"]],
  ["come full circle", "to return to the original state", ["return"]],
  ["cool as a cucumber", "calm and composed", ["composure"]],
  ["cross your fingers", "to hope for good luck", ["hope"]],
  ["cry wolf", "to raise a false alarm", ["false-alarm"]],
  ["cut corners", "to do something poorly to save time or money", ["shortcut"]],
  ["dance to someone's tune", "to do whatever someone says", ["compliance"]],
  ["dead in the water", "stalled, unable to proceed", ["stuck"]],
  ["dog-eat-dog", "ruthlessly competitive", ["competition"]],
  ["down in the dumps", "feeling depressed", ["depression"]],
  ["draw a blank", "to be unable to think of something", ["forgetting"]],
  ["drop a bombshell", "to deliver shocking news", ["news"]],
  ["eat humble pie", "to apologize and admit being wrong", ["apology"]],
  ["face the music", "to accept the consequences of one's actions", ["consequences"]],
  ["fair and square", "honestly and according to the rules", ["honesty"]],
  ["fall flat", "to fail completely", ["failure"]],
  ["feeling under the weather", "feeling slightly ill", ["health"]],
  ["fish out of water", "out of one's element", ["discomfort"]],
  ["fit to be tied", "extremely angry", ["anger"]],
  ["flesh and blood", "a relative or family member", ["family"]],
  ["flip the script", "to reverse a situation or expectation", ["reversal"]],
  ["fly off the handle", "to lose one's temper suddenly", ["anger"]],
  ["food for thought", "something to think about", ["reflection"]],
  ["foot in the door", "an initial small success leading to bigger things", ["opportunity"]],
  ["foot the bill", "to pay for something", ["money"]],
  ["for crying out loud", "an exclamation of frustration", ["frustration"]],
  ["full of hot air", "talking nonsense or boasting without substance", ["nonsense"]],
  ["get a kick out of", "to enjoy something a lot", ["enjoyment"]],
  ["get bent out of shape", "to become upset", ["upset"]],
  ["get the ball rolling", "to start something happening", ["beginning"]],
  ["go down in flames", "to fail spectacularly", ["failure"]],
  ["green with envy", "very jealous", ["jealousy"]],
  ["hand over fist", "rapidly, in large amounts", ["rapidity"]],
  ["hands are tied", "unable to act due to constraints", ["constraint"]],
  ["have a soft spot for", "to have affection for", ["affection"]],
  ["head over heels", "completely in love", ["love"]],
  ["hit a snag", "to encounter a problem", ["problem"]],
  ["hit rock bottom", "to reach the lowest possible point", ["low"]],
  ["hit the road", "to leave or begin a journey", ["departure"]],
  ["hold your tongue", "stay silent", ["silence"]],
  ["icing on the cake", "an extra benefit", ["bonus"]],
  ["in a nutshell", "in summary", ["brevity"]],
  ["in hot water", "in trouble", ["trouble"]],
  ["in the same boat", "in the same difficult situation", ["solidarity"]],
  ["jump the gun", "to act prematurely", ["haste"]],
  ["keep your fingers crossed", "to hope for the best", ["hope"]],
  ["kick the can down the road", "to delay dealing with a problem", ["procrastination"]],
  ["knee-jerk reaction", "an automatic, unthinking response", ["impulse"]],
  ["learn the ropes", "to learn how to do something", ["learning"]],
  ["let bygones be bygones", "to forgive and forget", ["forgiveness"]],
  ["let sleeping dogs lie", "to leave a problem alone if it's not causing trouble", ["caution"]],
  ["light at the end of the tunnel", "the prospect of better times after difficulties", ["hope"]],
  ["live and let live", "tolerate others' lifestyles", ["tolerance"]],
  ["look before you leap", "consider before acting", ["caution"]],
  ["lose your touch", "to no longer have a skill you once had", ["loss"]],
  ["make ends meet", "to manage financially with limited means", ["money"]],
  ["make hay while the sun shines", "take advantage of favorable circumstances", ["opportunity"]],
  ["miss the mark", "to fail to achieve a goal", ["failure"]],
  ["money doesn't grow on trees", "money is hard to come by", ["money"]],
  ["nip it in the bud", "to stop a problem before it grows", ["prevention"]],
  ["no strings attached", "with no conditions or restrictions", ["freedom"]],
  ["not playing with a full deck", "lacking intelligence or sanity", ["humor"]],
  ["off the beaten path", "unconventional, away from the usual route", ["independence"]],
  ["off the cuff", "spontaneously, without preparation", ["spontaneity"]],
  ["on a roll", "experiencing a series of successes", ["success"]],
  ["on cloud nine", "very happy", ["happiness"]],
  ["on edge", "anxious, nervous", ["anxiety"]],
  ["on pins and needles", "anxiously waiting", ["anxiety"]],
  ["on the same page", "in agreement", ["agreement"]],
  ["once and for all", "finally and decisively", ["finality"]],
  ["over the moon", "extremely happy", ["happiness"]],
  ["paint the town red", "to celebrate boisterously", ["celebration"]],
  ["pass with flying colors", "to succeed brilliantly", ["success"]],
  ["pat on the back", "praise or encouragement", ["praise"]],
  ["penny for your thoughts", "what are you thinking?", ["curiosity"]],
  ["picture is worth a thousand words", "an image conveys more than language can", ["communication"]],
  ["pie in the sky", "an unrealistic hope", ["unrealistic"]],
  ["play it by ear", "to improvise as the situation develops", ["improvisation"]],
  ["pour your heart out", "to express feelings openly", ["expression"]],
  ["practice makes perfect", "improvement comes with repetition", ["practice"]],
  ["pull the wool over someone's eyes", "to deceive someone", ["deception"]],
  ["push the envelope", "to go beyond accepted limits", ["limits"]],
  ["put your foot down", "to assert your authority", ["assertion"]],
  ["put your foot in your mouth", "to say something embarrassing", ["embarrassment"]],
  ["raise the bar", "to set a higher standard", ["standards"]],
  ["rest on your laurels", "to be content with past achievements without striving further", ["complacency"]],
  ["rock the boat", "to disturb a stable situation", ["disturbance"]],
  ["rule the roost", "to be in charge", ["authority"]],
  ["save face", "to preserve one's dignity", ["dignity"]],
  ["see the light", "to suddenly understand something", ["understanding"]],
  ["short end of the stick", "the worse part of an unequal arrangement", ["unfairness"]],
  ["sick as a dog", "very ill", ["illness"]],
  ["silver lining", "a positive aspect of a bad situation", ["optimism"]],
  ["sitting pretty", "in a fortunate situation", ["fortune"]],
  ["six of one, half a dozen of the other", "two options that are essentially the same", ["equivalence"]],
  ["skeleton in the closet", "an embarrassing or shameful secret", ["secrets"]],
  ["snail's pace", "very slow speed", ["slowness"]],
  ["sour grapes", "pretending to dislike what one cannot have", ["resentment"]],
  ["stab in the back", "a betrayal", ["betrayal"]],
  ["stand your ground", "refuse to retreat or yield", ["resolve"]],
  ["start from scratch", "to begin from nothing", ["beginning"]],
  ["stick to your guns", "to maintain your position", ["resolve"]],
  ["straight from the horse's mouth", "directly from the original source", ["source"]],
  ["take a rain check", "to postpone an invitation", ["postponement","american-english"]],
  ["take it easy", "relax", ["relaxation"]],
  ["take the cake", "to be the most extreme example", ["extremity"]],
  ["take the high road", "to act with integrity rather than retaliating", ["integrity"]],
  ["talk the talk and walk the walk", "to back up your words with actions", ["integrity"]],
  ["the bottom line", "the final, essential point", ["essence"]],
  ["the cherry on top", "a final wonderful addition", ["bonus"]],
  ["the cream of the crop", "the very best", ["best"]],
  ["the devil is in the details", "details can cause problems", ["details"]],
  ["the early bird gets the worm", "those who act first benefit most", ["initiative"]],
  ["the long and short of it", "the final summary", ["summary"]],
  ["the proof is in the pudding", "the result is the test of quality", ["proof"]],
  ["the world is your oyster", "you have many opportunities", ["opportunity"]],
  ["think outside the box", "to think creatively, unconventionally", ["creativity"]],
  ["throw a wrench in the works", "to disrupt", ["disruption"]],
  ["throw cold water on", "to discourage", ["discouragement"]],
  ["throw under the bus", "to betray for personal gain", ["betrayal"]],
  ["till the cows come home", "for a very long time", ["duration"]],
  ["time flies when you're having fun", "enjoyable activities make time seem to pass quickly", ["time"]],
  ["time heals all wounds", "pain fades with time", ["time","healing"]],
  ["to each their own", "people have different preferences", ["preference"]],
  ["too good to be true", "suspiciously favorable", ["suspicion"]],
  ["tooth and nail", "with great effort and ferocity", ["effort"]],
  ["turn a blind eye", "to ignore something deliberately", ["ignoring"]],
  ["turn the other cheek", "to respond to insult with patience", ["patience"]],
  ["under one's belt", "having gained experience or skill", ["experience"]],
  ["up the ante", "to raise the stakes", ["risk"]],
  ["walk on eggshells", "to be cautious to avoid offense", ["caution"]],
  ["walk the line", "to behave correctly", ["behavior"]],
  ["water under the bridge", "past events that are no longer worth worrying about", ["forgiveness"]],
  ["wear many hats", "to perform many different roles", ["versatility"]],
  ["wet blanket", "a person who spoils others' fun", ["damper"]],
  ["whole nine yards", "everything; the entirety", ["completeness"]],
  ["wing it", "to do something without preparation", ["improvisation"]],
  ["with flying colors", "with great success", ["success"]],
  ["worth its weight in gold", "extremely valuable", ["value"]],
  ["wrap up", "to conclude", ["conclusion"]],
  ["you snooze, you lose", "if you're slow, you miss the opportunity", ["timing"]],
  ["zip your lip", "stay silent", ["silence"]],
  ["a dog's life", "a hard, miserable life", ["hardship"]],
  ["a fish out of water", "uncomfortable in a new situation", ["discomfort"]],
  ["all ears", "listening attentively", ["attention"]],
  ["all in the same boat", "facing the same situation", ["solidarity"]],
  ["all over the map", "scattered, disorganized", ["disorder"]],
  ["all roads lead to Rome", "many paths lead to the same goal", ["paths"]],
  ["always a bridesmaid, never a bride", "always close to success but never achieving it", ["near-miss"]],
];

const NEW_POEMS = [
  {
    id: "p-frost-the-road-not-taken",
    title: "The Road Not Taken",
    author: "Robert Frost",
    year: 1916,
    source: "Mountain Interval",
    tags: ["choice","journey","reflection"],
    text: "Two roads diverged in a yellow wood,\nAnd sorry I could not travel both\nAnd be one traveler, long I stood\nAnd looked down one as far as I could\nTo where it bent in the undergrowth;\n\nThen took the other, as just as fair,\nAnd having perhaps the better claim,\nBecause it was grassy and wanted wear;\nThough as for that the passing there\nHad worn them really about the same,\n\nAnd both that morning equally lay\nIn leaves no step had trodden black.\nOh, I kept the first for another day!\nYet knowing how way leads on to way,\nI doubted if I should ever come back.\n\nI shall be telling this with a sigh\nSomewhere ages and ages hence:\nTwo roads diverged in a wood, and I —\nI took the one less traveled by,\nAnd that has made all the difference."
  },
  {
    id: "p-frost-stopping-by-woods",
    title: "Stopping by Woods on a Snowy Evening",
    author: "Robert Frost",
    year: 1923,
    source: "New Hampshire",
    tags: ["nature","quiet","duty"],
    text: "Whose woods these are I think I know.\nHis house is in the village though;\nHe will not see me stopping here\nTo watch his woods fill up with snow.\n\nMy little horse must think it queer\nTo stop without a farmhouse near\nBetween the woods and frozen lake\nThe darkest evening of the year.\n\nHe gives his harness bells a shake\nTo ask if there is some mistake.\nThe only other sound's the sweep\nOf easy wind and downy flake.\n\nThe woods are lovely, dark and deep,\nBut I have promises to keep,\nAnd miles to go before I sleep,\nAnd miles to go before I sleep."
  },
  {
    id: "p-dickinson-hope-is-thing-with-feathers",
    title: "Hope is the thing with feathers",
    author: "Emily Dickinson",
    year: 1891,
    source: "Poems by Emily Dickinson",
    tags: ["hope","soul","resilience"],
    text: "Hope is the thing with feathers\nThat perches in the soul,\nAnd sings the tune without the words,\nAnd never stops at all,\n\nAnd sweetest in the gale is heard;\nAnd sore must be the storm\nThat could abash the little bird\nThat kept so many warm.\n\nI've heard it in the chillest land,\nAnd on the strangest sea;\nYet, never, in extremity,\nIt asked a crumb of me."
  },
  {
    id: "p-blake-tyger",
    title: "The Tyger",
    author: "William Blake",
    year: 1794,
    source: "Songs of Experience",
    tags: ["wonder","creation","fear"],
    text: "Tyger Tyger, burning bright,\nIn the forests of the night;\nWhat immortal hand or eye,\nCould frame thy fearful symmetry?\n\nIn what distant deeps or skies,\nBurnt the fire of thine eyes?\nOn what wings dare he aspire?\nWhat the hand, dare seize the fire?\n\nAnd what shoulder, & what art,\nCould twist the sinews of thy heart?\nAnd when thy heart began to beat,\nWhat dread hand? & what dread feet?\n\nWhat the hammer? what the chain?\nIn what furnace was thy brain?\nWhat the anvil? what dread grasp,\nDare its deadly terrors clasp?\n\nWhen the stars threw down their spears\nAnd water'd heaven with their tears,\nDid he smile his work to see?\nDid he who made the Lamb make thee?\n\nTyger Tyger burning bright,\nIn the forests of the night;\nWhat immortal hand or eye,\nDare frame thy fearful symmetry?"
  },
  {
    id: "p-shakespeare-sonnet-18",
    title: "Sonnet 18: Shall I compare thee to a summer's day?",
    author: "William Shakespeare",
    year: 1609,
    source: "Shakespeare's Sonnets",
    tags: ["love","beauty","time"],
    text: "Shall I compare thee to a summer's day?\nThou art more lovely and more temperate:\nRough winds do shake the darling buds of May,\nAnd summer's lease hath all too short a date:\nSometime too hot the eye of heaven shines,\nAnd often is his gold complexion dimm'd;\nAnd every fair from fair sometime declines,\nBy chance or nature's changing course untrimm'd;\nBut thy eternal summer shall not fade,\nNor lose possession of that fair thou owest;\nNor shall Death brag thou wander'st in his shade,\nWhen in eternal lines to time thou growest:\nSo long as men can breathe or eyes can see,\nSo long lives this and this gives life to thee."
  },
  {
    id: "p-shakespeare-sonnet-29",
    title: "Sonnet 29: When in disgrace with fortune and men's eyes",
    author: "William Shakespeare",
    year: 1609,
    source: "Shakespeare's Sonnets",
    tags: ["love","redemption","sonnet"],
    text: "When in disgrace with fortune and men's eyes\nI all alone beweep my outcast state,\nAnd trouble deaf heaven with my bootless cries,\nAnd look upon myself, and curse my fate,\nWishing me like to one more rich in hope,\nFeatured like him, like him with friends possess'd,\nDesiring this man's art and that man's scope,\nWith what I most enjoy contented least;\nYet in these thoughts myself almost despising,\nHaply I think on thee, and then my state,\nLike to the lark at break of day arising\nFrom sullen earth, sings hymns at heaven's gate;\n  For thy sweet love remember'd such wealth brings\n  That then I scorn to change my state with kings."
  },
  {
    id: "p-poe-raven-excerpt",
    title: "The Raven (excerpt)",
    author: "Edgar Allan Poe",
    year: 1845,
    source: "The Raven",
    tags: ["mystery","mourning","gothic"],
    text: "Once upon a midnight dreary, while I pondered, weak and weary,\nOver many a quaint and curious volume of forgotten lore —\nWhile I nodded, nearly napping, suddenly there came a tapping,\nAs of some one gently rapping, rapping at my chamber door.\n\"'Tis some visitor,\" I muttered, \"tapping at my chamber door —\n            Only this and nothing more.\"\n\nAh, distinctly I remember it was in the bleak December;\nAnd each separate dying ember wrought its ghost upon the floor.\nEagerly I wished the morrow; — vainly I had sought to borrow\nFrom my books surcease of sorrow — sorrow for the lost Lenore —\nFor the rare and radiant maiden whom the angels name Lenore —\n            Nameless here for evermore."
  },
  {
    id: "p-whitman-i-hear-america",
    title: "I Hear America Singing",
    author: "Walt Whitman",
    year: 1860,
    source: "Leaves of Grass",
    tags: ["america","work","unity"],
    text: "I hear America singing, the varied carols I hear,\nThose of mechanics, each one singing his as it should be blithe and strong,\nThe carpenter singing his as he measures his plank or beam,\nThe mason singing his as he makes ready for work, or leaves off work,\nThe boatman singing what belongs to him in his boat, the deckhand singing on the steamboat deck,\nThe shoemaker singing as he sits on his bench, the hatter singing as he stands,\nThe wood-cutter's song, the ploughboy's on his way in the morning, or at noon intermission or at sundown,\nThe delicious singing of the mother, or of the young wife at work, or of the girl sewing or washing,\nEach singing what belongs to him or her and to none else,\nThe day what belongs to the day — at night the party of young fellows, robust, friendly,\nSinging with open mouths their strong melodious songs."
  },
  {
    id: "p-keats-bright-star",
    title: "Bright Star",
    author: "John Keats",
    year: 1819,
    source: "The Poems of John Keats",
    tags: ["love","constancy","stars"],
    text: "Bright star, would I were stedfast as thou art —\nNot in lone splendour hung aloft the night\nAnd watching, with eternal lids apart,\nLike nature's patient, sleepless Eremite,\nThe moving waters at their priestlike task\nOf pure ablution round earth's human shores,\nOr gazing on the new soft-fallen mask\nOf snow upon the mountains and the moors —\nNo — yet still stedfast, still unchangeable,\nPillow'd upon my fair love's ripening breast,\nTo feel for ever its soft fall and swell,\nAwake for ever in a sweet unrest,\nStill, still to hear her tender-taken breath,\nAnd so live ever — or else swoon to death."
  },
  {
    id: "p-wordsworth-daffodils",
    title: "I Wandered Lonely as a Cloud",
    author: "William Wordsworth",
    year: 1807,
    source: "Poems in Two Volumes",
    tags: ["nature","memory","joy"],
    text: "I wandered lonely as a cloud\nThat floats on high o'er vales and hills,\nWhen all at once I saw a crowd,\nA host, of golden daffodils;\nBeside the lake, beneath the trees,\nFluttering and dancing in the breeze.\n\nContinuous as the stars that shine\nAnd twinkle on the milky way,\nThey stretched in never-ending line\nAlong the margin of a bay:\nTen thousand saw I at a glance,\nTossing their heads in sprightly dance.\n\nThe waves beside them danced; but they\nOut-did the sparkling waves in glee:\nA poet could not but be gay,\nIn such a jocund company:\nI gazed — and gazed — but little thought\nWhat wealth the show to me had brought:\n\nFor oft, when on my couch I lie\nIn vacant or in pensive mood,\nThey flash upon that inward eye\nWhich is the bliss of solitude;\nAnd then my heart with pleasure fills,\nAnd dances with the daffodils."
  },
  {
    id: "p-yeats-second-coming",
    title: "The Second Coming",
    author: "W.B. Yeats",
    year: 1920,
    source: "The Dial",
    tags: ["prophecy","apocalypse","modernity"],
    text: "Turning and turning in the widening gyre\nThe falcon cannot hear the falconer;\nThings fall apart; the centre cannot hold;\nMere anarchy is loosed upon the world,\nThe blood-dimmed tide is loosed, and everywhere\nThe ceremony of innocence is drowned;\nThe best lack all conviction, while the worst\nAre full of passionate intensity.\n\nSurely some revelation is at hand;\nSurely the Second Coming is at hand.\nThe Second Coming! Hardly are those words out\nWhen a vast image out of Spiritus Mundi\nTroubles my sight: somewhere in sands of the desert\nA shape with lion body and the head of a man,\nA gaze blank and pitiless as the sun,\nIs moving its slow thighs, while all about it\nReel shadows of the indignant desert birds.\nThe darkness drops again; but now I know\nThat twenty centuries of stony sleep\nWere vexed to nightmare by a rocking cradle,\nAnd what rough beast, its hour come round at last,\nSlouches towards Bethlehem to be born?"
  },
  {
    id: "p-tennyson-ulysses-excerpt",
    title: "Ulysses (excerpt)",
    author: "Alfred, Lord Tennyson",
    year: 1842,
    source: "Poems",
    tags: ["adventure","old-age","striving"],
    text: "Tho' much is taken, much abides; and tho'\nWe are not now that strength which in old days\nMoved earth and heaven; that which we are, we are;\nOne equal temper of heroic hearts,\nMade weak by time and fate, but strong in will\nTo strive, to seek, to find, and not to yield."
  },
  {
    id: "p-henley-invictus",
    title: "Invictus",
    author: "William Ernest Henley",
    year: 1888,
    source: "Book of Verses",
    tags: ["resilience","courage","defiance"],
    text: "Out of the night that covers me,\n      Black as the pit from pole to pole,\nI thank whatever gods may be\n      For my unconquerable soul.\n\nIn the fell clutch of circumstance\n      I have not winced nor cried aloud.\nUnder the bludgeonings of chance\n      My head is bloody, but unbowed.\n\nBeyond this place of wrath and tears\n      Looms but the Horror of the shade,\nAnd yet the menace of the years\n      Finds, and shall find, me unafraid.\n\nIt matters not how strait the gate,\n      How charged with punishments the scroll,\nI am the master of my fate:\n      I am the captain of my soul."
  },
  {
    id: "p-kipling-if",
    title: "If—",
    author: "Rudyard Kipling",
    year: 1910,
    source: "Rewards and Fairies",
    tags: ["character","wisdom","manhood"],
    text: "If you can keep your head when all about you\n  Are losing theirs and blaming it on you,\nIf you can trust yourself when all men doubt you,\n  But make allowance for their doubting too;\nIf you can wait and not be tired by waiting,\n  Or being lied about, don't deal in lies,\nOr being hated, don't give way to hating,\n  And yet don't look too good, nor talk too wise:\n\nIf you can dream — and not make dreams your master;\n  If you can think — and not make thoughts your aim;\nIf you can meet with Triumph and Disaster\n  And treat those two impostors just the same;\nIf you can bear to hear the truth you've spoken\n  Twisted by knaves to make a trap for fools,\nOr watch the things you gave your life to, broken,\n  And stoop and build 'em up with worn-out tools:\n\nIf you can talk with crowds and keep your virtue,\n  Or walk with Kings — nor lose the common touch,\nIf neither foes nor loving friends can hurt you,\n  If all men count with you, but none too much;\nIf you can fill the unforgiving minute\n  With sixty seconds' worth of distance run,\nYours is the Earth and everything that's in it,\n  And — which is more — you'll be a Man, my son!"
  },
  {
    id: "p-emerson-concord-hymn",
    title: "Concord Hymn",
    author: "Ralph Waldo Emerson",
    year: 1837,
    source: "Concord Monument",
    tags: ["history","america","memorial"],
    text: "By the rude bridge that arched the flood,\n  Their flag to April's breeze unfurled,\nHere once the embattled farmers stood\n  And fired the shot heard round the world.\n\nThe foe long since in silence slept;\n  Alike the conqueror silent sleeps;\nAnd Time the ruined bridge has swept\n  Down the dark stream which seaward creeps.\n\nOn this green bank, by this soft stream,\n  We set today a votive stone;\nThat memory may their deed redeem,\n  When, like our sires, our sons are gone.\n\nSpirit, that made those heroes dare\n  To die, and leave their children free,\nBid Time and Nature gently spare\n  The shaft we raise to them and thee."
  },
  {
    id: "p-housman-loveliest-of-trees",
    title: "Loveliest of Trees",
    author: "A.E. Housman",
    year: 1896,
    source: "A Shropshire Lad",
    tags: ["nature","time","spring"],
    text: "Loveliest of trees, the cherry now\nIs hung with bloom along the bough,\nAnd stands about the woodland ride\nWearing white for Eastertide.\n\nNow, of my threescore years and ten,\nTwenty will not come again,\nAnd take from seventy springs a score,\nIt only leaves me fifty more.\n\nAnd since to look at things in bloom\nFifty springs are little room,\nAbout the woodlands I will go\nTo see the cherry hung with snow."
  },
  {
    id: "p-longfellow-rainy-day",
    title: "The Rainy Day",
    author: "Henry Wadsworth Longfellow",
    year: 1842,
    source: "Ballads and Other Poems",
    tags: ["sorrow","hope","weather"],
    text: "The day is cold, and dark, and dreary;\nIt rains, and the wind is never weary;\nThe vine still clings to the mouldering wall,\nBut at every gust the dead leaves fall,\n  And the day is dark and dreary.\n\nMy life is cold, and dark, and dreary;\nIt rains, and the wind is never weary;\nMy thoughts still cling to the mouldering Past,\nBut the hopes of youth fall thick in the blast,\n  And the days are dark and dreary.\n\nBe still, sad heart! and cease repining;\nBehind the clouds is the sun still shining;\nThy fate is the common fate of all,\nInto each life some rain must fall,\n  Some days must be dark and dreary."
  },
  {
    id: "p-browning-prospice",
    title: "Prospice",
    author: "Robert Browning",
    year: 1864,
    source: "Dramatis Personae",
    tags: ["death","courage","love"],
    text: "Fear death? — to feel the fog in my throat,\n  The mist in my face,\nWhen the snows begin, and the blasts denote\n  I am nearing the place,\nThe power of the night, the press of the storm,\n  The post of the foe;\nWhere he stands, the Arch Fear in a visible form,\n  Yet the strong man must go:\nFor the journey is done and the summit attained,\n  And the barriers fall,\nThough a battle's to fight ere the guerdon be gained,\n  The reward of it all."
  },
  {
    id: "p-coleridge-kubla-khan-excerpt",
    title: "Kubla Khan (excerpt)",
    author: "Samuel Taylor Coleridge",
    year: 1816,
    source: "Christabel, Kubla Khan, and the Pains of Sleep",
    tags: ["dream","fantasy","romanticism"],
    text: "In Xanadu did Kubla Khan\nA stately pleasure-dome decree:\nWhere Alph, the sacred river, ran\nThrough caverns measureless to man\n  Down to a sunless sea.\nSo twice five miles of fertile ground\nWith walls and towers were girdled round;\nAnd there were gardens bright with sinuous rills,\nWhere blossomed many an incense-bearing tree;\nAnd here were forests ancient as the hills,\nEnfolding sunny spots of greenery."
  },
  {
    id: "p-dickinson-because-i-could-not-stop",
    title: "Because I could not stop for Death",
    author: "Emily Dickinson",
    year: 1890,
    source: "Poems by Emily Dickinson",
    tags: ["death","journey","eternity"],
    text: "Because I could not stop for Death —\nHe kindly stopped for me —\nThe Carriage held but just Ourselves —\nAnd Immortality.\n\nWe slowly drove — He knew no haste\nAnd I had put away\nMy labor and my leisure too,\nFor His Civility —\n\nWe passed the School, where Children strove\nAt Recess — in the Ring —\nWe passed the Fields of Gazing Grain —\nWe passed the Setting Sun —"
  },
  {
    id: "p-shelley-ozymandias",
    title: "Ozymandias",
    author: "Percy Bysshe Shelley",
    year: 1818,
    source: "The Examiner",
    tags: ["power","time","ruin"],
    text: "I met a traveller from an antique land,\nWho said—\"Two vast and trunkless legs of stone\nStand in the desert. . . . Near them, on the sand,\nHalf sunk a shattered visage lies, whose frown,\nAnd wrinkled lip, and sneer of cold command,\nTell that its sculptor well those passions read\nWhich yet survive, stamped on these lifeless things,\nThe hand that mocked them, and the heart that fed;\n\nAnd on the pedestal, these words appear:\nMy name is Ozymandias, King of Kings;\nLook on my Works, ye Mighty, and despair!\nNothing beside remains. Round the decay\nOf that colossal Wreck, boundless and bare\nThe lone and level sands stretch far away.\""
  },
  {
    id: "p-byron-she-walks-in-beauty",
    title: "She Walks in Beauty",
    author: "Lord Byron",
    year: 1815,
    source: "Hebrew Melodies",
    tags: ["beauty","love","romanticism"],
    text: "She walks in beauty, like the night\nOf cloudless climes and starry skies;\nAnd all that's best of dark and bright\nMeet in her aspect and her eyes:\nThus mellowed to that tender light\nWhich heaven to gaudy day denies.\n\nOne shade the more, one ray the less,\nHad half impaired the nameless grace\nWhich waves in every raven tress,\nOr softly lightens o'er her face;\nWhere thoughts serenely sweet express\nHow pure, how dear their dwelling place.\n\nAnd on that cheek, and o'er that brow,\nSo soft, so calm, yet eloquent,\nThe smiles that win, the tints that glow,\nBut tell of days in goodness spent,\nA mind at peace with all below,\nA heart whose love is innocent!"
  },
  {
    id: "p-hopkins-pied-beauty",
    title: "Pied Beauty",
    author: "Gerard Manley Hopkins",
    year: 1877,
    source: "Poems",
    tags: ["nature","praise","variety"],
    text: "Glory be to God for dappled things —\n  For skies of couple-colour as a brinded cow;\n    For rose-moles all in stipple upon trout that swim;\nFresh-firecoal chestnut-falls; finches' wings;\n  Landscape plotted and pieced — fold, fallow, and plough;\n    And áll trádes, their gear and tackle and trim.\n\nAll things counter, original, spare, strange;\n  Whatever is fickle, freckled (who knows how?)\n    With swift, slow; sweet, sour; adazzle, dim;\nHe fathers-forth whose beauty is past change:\n                                Praise him."
  },
  {
    id: "p-hughes-dreams",
    title: "Dreams",
    author: "Langston Hughes",
    year: 1922,
    source: "The Crisis",
    tags: ["dreams","hope","resilience"],
    text: "Hold fast to dreams\nFor if dreams die\nLife is a broken-winged bird\nThat cannot fly.\n\nHold fast to dreams\nFor when dreams go\nLife is a barren field\nFrozen with snow."
  },
  {
    id: "p-hughes-mother-to-son",
    title: "Mother to Son",
    author: "Langston Hughes",
    year: 1922,
    source: "The Crisis",
    tags: ["perseverance","family","wisdom"],
    text: "Well, son, I'll tell you:\nLife for me ain't been no crystal stair.\nIt's had tacks in it,\nAnd splinters,\nAnd boards torn up,\nAnd places with no carpet on the floor —\nBare.\nBut all the time\nI'se been a-climbin' on,\nAnd reachin' landin's,\nAnd turnin' corners,\nAnd sometimes goin' in the dark\nWhere there ain't been no light.\nSo boy, don't you turn back.\nDon't you set down on the steps\n'Cause you finds it's kinder hard.\nDon't you fall now —\nFor I'se still goin', honey,\nI'se still climbin',\nAnd life for me ain't been no crystal stair."
  },
  {
    id: "p-cummings-i-carry-your-heart",
    title: "i carry your heart with me",
    author: "E.E. Cummings",
    year: 1952,
    source: "Complete Poems",
    tags: ["love","unity","modern"],
    text: "i carry your heart with me(i carry it in\nmy heart)i am never without it(anywhere\ni go you go,my dear;and whatever is done\nby only me is your doing,my darling)\n                                      i fear\nno fate(for you are my fate,my sweet)i want\nno world(for beautiful you are my world,my true)\nand it's you are whatever a moon has always meant\nand whatever a sun will always sing is you\n\nhere is the deepest secret nobody knows\n(here is the root of the root and the bud of the bud\nand the sky of the sky of a tree called life;which grows\nhigher than soul can hope or mind can hide)\nand this is the wonder that's keeping the stars apart\n\ni carry your heart(i carry it in my heart)"
  },
  {
    id: "p-millay-first-fig",
    title: "First Fig",
    author: "Edna St. Vincent Millay",
    year: 1920,
    source: "A Few Figs from Thistles",
    tags: ["youth","intensity","light"],
    text: "My candle burns at both ends;\n  It will not last the night;\nBut ah, my foes, and oh, my friends —\n  It gives a lovely light!"
  },
  {
    id: "p-stevens-thirteen-blackbird-i",
    title: "Thirteen Ways of Looking at a Blackbird (I-IV)",
    author: "Wallace Stevens",
    year: 1917,
    source: "Others: An Anthology of the New Verse",
    tags: ["modernism","perspective","nature"],
    text: "I\n\nAmong twenty snowy mountains,\nThe only moving thing\nWas the eye of the blackbird.\n\nII\n\nI was of three minds,\nLike a tree\nIn which there are three blackbirds.\n\nIII\n\nThe blackbird whirled in the autumn winds.\nIt was a small part of the pantomime.\n\nIV\n\nA man and a woman\nAre one.\nA man and a woman and a blackbird\nAre one."
  },
  {
    id: "p-eliot-prufrock-excerpt",
    title: "The Love Song of J. Alfred Prufrock (opening)",
    author: "T.S. Eliot",
    year: 1915,
    source: "Poetry: A Magazine of Verse",
    tags: ["modernism","time","existence"],
    text: "Let us go then, you and I,\nWhen the evening is spread out against the sky\nLike a patient etherized upon a table;\nLet us go, through certain half-deserted streets,\nThe muttering retreats\nOf restless nights in one-night cheap hotels\nAnd sawdust restaurants with oyster-shells:\nStreets that follow like a tedious argument\nOf insidious intent\nTo lead you to an overwhelming question . . .\nOh, do not ask, \"What is it?\"\nLet us go and make our visit."
  },
];

// --- merge logic ---
const quotes = loadJson(QPATH);
const idioms = loadJson(IPATH);
const poems = loadJson(PPATH);

const qIds = new Set(quotes.map(x => x.id));
const iIds = new Set(idioms.map(x => x.id));
const pIds = new Set(poems.map(x => x.id));

let qAdded = 0, iAdded = 0, pAdded = 0;

for (const [text, author, tags] of NEW_QUOTES) {
  const id = "q-" + slug(author) + "-" + slug(text).slice(0, 40);
  if (qIds.has(id)) continue;
  qIds.add(id);
  quotes.push({ id, text, author, tags });
  qAdded++;
}

for (const [text, meaning, tags] of NEW_IDIOMS) {
  const id = "id-" + slug(text).slice(0, 60);
  if (iIds.has(id)) continue;
  iIds.add(id);
  idioms.push({ id, text, meaning, tags });
  iAdded++;
}

for (const p of NEW_POEMS) {
  if (pIds.has(p.id)) continue;
  pIds.add(p.id);
  poems.push(p);
  pAdded++;
}

saveJson(QPATH, quotes);
saveJson(IPATH, idioms);
saveJson(PPATH, poems);

console.log("Quotes: +" + qAdded + " (now " + quotes.length + ")");
console.log("Idioms: +" + iAdded + " (now " + idioms.length + ")");
console.log("Poems:  +" + pAdded + " (now " + poems.length + ")");
