#!/usr/bin/env node
/* Restores intended line / stanza formatting on poems whose text
   was ingested as a single run-on string. The 10 famous poems
   below had their newlines flattened; canonical line breaks
   (and modest stanza spacing via \n\n) are restored here. Other
   poems already carry their formatting from source. */

import fs from "node:fs";

const FILE = "src/data/poetry.json";

const CANON = {
  "po-frost-road":
`Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood
And looked down one as far as I could
To where it bent in the undergrowth;

Then took the other, as just as fair,
And having perhaps the better claim,
Because it was grassy and wanted wear;
Though as for that the passing there
Had worn them really about the same.`,

  "po-dickinson-hope":
`Hope is the thing with feathers
That perches in the soul,
And sings the tune without the words,
And never stops at all,

And sweetest in the gale is heard;
And sore must be the storm
That could abash the little bird
That kept so many warm.`,

  "po-whitman-myself":
`I celebrate myself, and sing myself,
And what I assume you shall assume,
For every atom belonging to me as good belongs to you.

I loafe and invite my soul,
I lean and loafe at my ease observing a spear of summer grass.`,

  "po-shakespeare-18":
`Shall I compare thee to a summer's day?
Thou art more lovely and more temperate.
Rough winds do shake the darling buds of May,
And summer's lease hath all too short a date.
Sometime too hot the eye of heaven shines,
And often is his gold complexion dimm'd.`,

  "po-keats-thing":
`A thing of beauty is a joy for ever:
Its loveliness increases; it will never
Pass into nothingness; but still will keep
A bower quiet for us, and a sleep
Full of sweet dreams, and health, and quiet breathing.`,

  "po-thomas-night":
`Do not go gentle into that good night,
Old age should burn and rave at close of day;
Rage, rage against the dying of the light.

Though wise men at their end know dark is right,
Because their words had forked no lightning they
Do not go gentle into that good night.`,

  "po-blake-tyger":
`Tyger Tyger, burning bright,
In the forests of the night;
What immortal hand or eye,
Could frame thy fearful symmetry?

In what distant deeps or skies,
Burnt the fire of thine eyes?
On what wings dare he aspire?
What the hand, dare seize the fire?`,

  "po-rossetti-uphill":
`Does the road wind up-hill all the way?
   Yes, to the very end.
Will the day's journey take the whole long day?
   From morn to night, my friend.

But is there for the night a resting-place?
   A roof for when the slow dark hours begin.
May not the darkness hide it from my face?
   You cannot miss that inn.`,

  "po-poe-raven":
`Once upon a midnight dreary, while I pondered, weak and weary,
Over many a quaint and curious volume of forgotten lore,
While I nodded, nearly napping, suddenly there came a tapping,
As of some one gently rapping, rapping at my chamber door.
"'Tis some visitor," I muttered, "tapping at my chamber door --
            Only this, and nothing more."`,

  "po-wordsworth-daffodils":
`I wandered lonely as a cloud
That floats on high o'er vales and hills,
When all at once I saw a crowd,
A host, of golden daffodils;
Beside the lake, beneath the trees,
Fluttering and dancing in the breeze.`,
};

const poems = JSON.parse(fs.readFileSync(FILE, "utf8"));
let n = 0;
for (const poem of poems) {
  const replacement = CANON[poem.id];
  if (!replacement) continue;
  poem.text = replacement;
  n++;
}
fs.writeFileSync(FILE, JSON.stringify(poems, null, 2));
console.log("Restored line/stanza formatting on " + n + " poems.");
