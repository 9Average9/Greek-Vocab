#!/usr/bin/env python3
"""Builds rhema-english-dictionary.js: an offline definition for EVERY word
used in the MSB and BSB texts. Sources, in order:
  1. WordNet glosses (via NLTK) for ordinary English words
  2. Generated proper-name entries (with -ite/-ites/-im awareness)
  3. A curated map for function words, contractions, and biblical vocabulary
     WordNet lacks (measures, coins, priestly objects, Aramaic sayings)
  4. A compound rule for hyphenated words, glossing the head word
Run: python3 scripts/build-english-dictionary.py   (regenerates the data file)
Verify: node scripts/test-english-dictionary.js
"""
import json, re, subprocess, sys, os

ROOT = os.path.join(os.path.dirname(__file__), '..')

# ── 1. Extract every word (same normalization as the app's lookup) ────────────
node_src = r'''
const fs=require('fs'), vm=require('vm');
const ctx={window:{}}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('rhema-msb.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('rhema-bsb.js','utf8'),ctx);
const info={};
for (const src of [ctx.window.RhemaMSB, ctx.window.RhemaBSB]) {
  for (const book of Object.values(src||{}))
    for (const ch of Object.values(book))
      for (const v of Object.values(ch))
        for (const m of String(v).matchAll(/[A-Za-z][A-Za-z'’\-]*/g)) {
          const raw=m[0];
          let w=raw.toLowerCase().replace(/’/g,"'").replace(/'s$/,'').replace(/'$/,'');
          if (w.length<2 && w!=='a' && w!=='i') continue;
          const e=info[w]||(info[w]={lc:0,cap:0});
          if (/^[a-z]/.test(raw)) e.lc++; else e.cap++;
        }
}
process.stdout.write(JSON.stringify(info));
'''
info = json.loads(subprocess.run(['node','-e',node_src],cwd=ROOT,capture_output=True,text=True,check=True).stdout)
core_words = set(info)
core_info = {w: dict(e) for w, e in info.items()}  # pre-merge counts

# ── 1b. Merge vocabulary from the downloadable translations ───────────────────
# scripts/data/extra-english-vocab.json holds the word list (word → {lc, cap,
# gnv}) extracted from the full text of every api.bible version the app offers
# (NIV, KJV, MSG, Geneva 1599, …). Only the vocabulary is stored — never the
# licensed text itself. Regenerate it with scripts/extract-extra-vocab.js after
# fetching fresh corpora. `gnv` marks words seen only in Early-Modern-spelling
# translations (Geneva), which get spelling-alias entries.
EXTRA_PATH = os.path.join(ROOT, 'scripts', 'data', 'extra-english-vocab.json')
if os.path.exists(EXTRA_PATH):
    extra = json.load(open(EXTRA_PATH, encoding='utf-8'))
    for w, e in extra.items():
        cur = info.get(w)
        if cur:
            cur['lc'] += e.get('lc', 0); cur['cap'] += e.get('cap', 0)
        else:
            info[w] = {'lc': e.get('lc', 0), 'cap': e.get('cap', 0),
                       'gnv': e.get('gnv', 0), 'heb': e.get('heb', 0)}
    print(f'merged {len(extra)} extra-version words ({len(info) - len(core_words)} new)')

from nltk.corpus import wordnet as wn
POS_LABEL = {'n':'noun','v':'verb','a':'adj.','s':'adj.','r':'adv.'}

def wn_defs(w, limit=3):
    syns = wn.synsets(w)
    if not syns:
        return None
    # Prefer senses whose own lemma is this word — keeps "recent: new" ahead of
    # "recent: the Holocene epoch". Stable sort preserves frequency order.
    syns = sorted(syns, key=lambda s: 0 if s.lemmas()[0].name().replace('_', ' ').lower() == w else 1)
    out, seen = [], set()
    for s in syns:
        d = s.definition().strip()
        d = d[0].upper() + d[1:] if d else d
        if not d.endswith('.'): d += '.'
        key = d.lower()
        if key in seen: continue
        seen.add(key)
        lemma = s.lemmas()[0].name().replace('_',' ').lower()
        pos = POS_LABEL.get(s.pos(),'')
        if lemma != w and len(out) == 0:
            d = f'(Form of “{lemma}”) ' + d
        out.append([pos, d])
        if len(out) >= limit: break
    return out

# ── 3. Curated entries ────────────────────────────────────────────────────────
G = 'gram.'   # function-word label
N = 'noun'; V = 'verb'; A = 'adj.'; R = 'adv.'
CURATED = {
 # function words & pronouns
 'the':[[G,'The definite article: points to a specific person or thing already known or identified.']],
 'and':[[G,'A conjunction joining words, phrases, or clauses together.']],
 'of':[[G,'A preposition marking belonging, origin, or connection.']],
 'for':[[G,'A preposition or conjunction marking purpose, benefit, or reason ("because").']],
 'from':[[G,'A preposition marking source, origin, or separation.']],
 'with':[[G,'A preposition marking accompaniment, means, or manner.']],
 'without':[[G,'A preposition meaning lacking, or outside of.']],
 'to':[[G,'A preposition marking direction, purpose, or the receiver of an action.']],
 'into':[[G,'A preposition marking movement to the inside or a change of state.']],
 'onto':[[G,'A preposition marking movement to a position on top of something.']],
 'unto':[[G,'Older English for “to” or “toward” — marking direction or the receiver of an action.']],
 'upon':[[G,'A preposition meaning on, or on top of; also marks occasion ("upon hearing").']],
 'toward':[[G,'A preposition marking direction or attitude in relation to someone or something.']],
 'against':[[G,'A preposition marking opposition, contact, or defense.']],
 'among':[[G,'A preposition meaning in the middle of, or within a group.']],
 'amid':[[G,'A preposition meaning in the middle of, surrounded by.']],
 'beside':[[G,'A preposition meaning next to, at the side of.']],
 'during':[[G,'A preposition meaning throughout the time of.']],
 'per':[[G,'A preposition meaning for each, or according to.']],
 'since':[[G,'From a past time until now; also “because.”']],
 'until':[[G,'Up to the time that.']],
 'than':[[G,'A conjunction used to introduce the second part of a comparison.']],
 'that':[[G,'A demonstrative pointing to something farther away; also introduces a clause ("so that").']],
 'this':[[G,'A demonstrative pointing to something near at hand.']],
 'these':[[G,'Plural of “this” — the ones near at hand.']],
 'those':[[G,'Plural of “that” — the ones farther away.']],
 'they':[[G,'Third-person plural pronoun: the people or things being spoken about.']],
 'them':[[G,'Object form of “they.”']],
 'their':[[G,'Belonging to them.']],
 'theirs':[[G,'That which belongs to them.']],
 'themselves':[[G,'They or them, reflexively — their own selves.']],
 'she':[[G,'Third-person feminine pronoun.']],
 'her':[[G,'Object or possessive form of “she.”']],
 'hers':[[G,'That which belongs to her.']],
 'herself':[[G,'She or her, reflexively — her own self.']],
 'him':[[G,'Object form of “he.”']],
 'himself':[[G,'He or him, reflexively — his own self.']],
 'his':[[G,'Belonging to him.']],
 'we':[[G,'First-person plural pronoun: the speaker together with others.']],
 'our':[[G,'Belonging to us.']],
 'ours':[[G,'That which belongs to us.']],
 'ourselves':[[G,'We or us, reflexively — our own selves.']],
 'my':[[G,'Belonging to me.']],
 'myself':[[G,'I or me, reflexively — my own self.']],
 'you':[[G,'Second-person pronoun: the person or people being addressed.']],
 'your':[[G,'Belonging to you.']],
 'yours':[[G,'That which belongs to you.']],
 'yourself':[[G,'You, reflexively — your own self.']],
 'yourselves':[[G,'You (plural), reflexively — your own selves.']],
 'itself':[[G,'It, reflexively — its own self.']],
 'oneself':[[G,'A person’s own self.']],
 'whom':[[G,'Object form of “who.”']],
 'whose':[[G,'Belonging to whom — asks or tells whose it is.']],
 'whoever':[[G,'Any person at all who — with no one excluded.']],
 'whomever':[[G,'Object form of “whoever.”']],
 'which':[[G,'Asks or marks a choice among things; also introduces a clause about a thing.']],
 'whichever':[[G,'Any one of the set, no matter which.']],
 'what':[[G,'Asks the identity or nature of a thing; also “that which.”']],
 'when':[[G,'At the time that; asks about time.']],
 'whenever':[[G,'At any and every time that.']],
 'where':[[G,'At or to the place that; asks about place.']],
 'whereas':[[G,'While on the contrary; in view of the fact that.']],
 'whereby':[[G,'By means of which.']],
 'whether':[[G,'Introduces alternatives: if it be the case that.']],
 'how':[[G,'In what way or manner; to what degree.']],
 'if':[[G,'Introduces a condition: in the event that.']],
 'unless':[[G,'Except on the condition that.']],
 'although':[[G,'In spite of the fact that.']],
 'because':[[G,'For the reason that.']],
 'cannot':[[G,'Can not — is unable to.']],
 'could':[[G,'Past or conditional form of “can” — was able to; would be able to.']],
 'should':[[G,'Ought to; also a conditional form of “shall.”']],
 'would':[[G,'Past or conditional form of “will” — expressing desire, habit, or what was to come.']],
 'shall':[[G,'Expresses what is going to happen or must happen — a firm future.']],
 'ought':[[V,'To be morally bound or obligated to.']],
 'nor':[[G,'And not; used to continue a negative ("neither... nor").']],
 'else':[[G,'Other, different, or in addition ("someone else"); otherwise.']],
 'fro':[[R,'Away or back — now only in the phrase “to and fro,” back and forth.']],
 'everyone':[[G,'Every person, with no one left out.']],
 'everybody':[[G,'Every person.']],
 'everything':[[G,'All things, the whole of it.']],
 'anyone':[[G,'Any person at all.']],
 'anything':[[G,'Any thing at all.']],
 'something':[[G,'An unspecified thing.']],
 'others':[[G,'Other people or things than the ones mentioned.']],
 # biblical measures, coins, objects, and terms
 'aftergrowth':[[N,'What springs up on its own after a harvest, without fresh sowing.']],
 'aha':[[G,'An exclamation of gloating triumph or mockery.']],
 'algum':[[N,'A prized imported timber (also “almug”) used for the temple’s steps and for lyres and harps.']],
 'almug':[[N,'A prized imported timber (also “algum”) used in Solomon’s temple and for instruments.']],
 'begrudgingly':[[R,'Reluctantly and with resentment — the opposite of a cheerful giver.']],
 'beka':[[N,'A Hebrew weight equal to half a shekel — about 5.7 grams; the census offering per person.']],
 'birthstools':[[N,'The stones or stool on which a woman sat while giving birth (Exodus 1:16).']],
 'bowshot':[[N,'The distance an arrow flies from a bow — used as a rough measure of distance.']],
 'breastpiece':[[N,'The jeweled pouch worn on the high priest’s chest, set with twelve stones for the tribes of Israel.']],
 'brokenness':[[N,'The state of being broken — crushed, contrite, or shattered in spirit.']],
 'chainwork':[[N,'Ornamental work of linked chains, as on the temple pillars.']],
 'condemners':[[N,'Those who condemn — who pronounce someone guilty.']],
 'cor':[[N,'A large Hebrew dry or liquid measure — roughly 220 liters (about 6 bushels).']],
 'cors':[[N,'Plural of cor — a large Hebrew measure of roughly 220 liters each.']],
 'darics':[[N,'Persian gold coins, named for King Darius — each about 8.4 grams of gold.']],
 'decrepitness':[[N,'The weakness and frailty of worn-out old age.']],
 'deeded':[[V,'Formally signed over or conveyed, as property by deed.']],
 'denarius':[[N,'A Roman silver coin — the standard day’s wage for a laborer.']],
 'denarii':[[N,'Plural of denarius — Roman silver coins, each a day’s wage.']],
 'discipled':[[V,'Made into disciples — taught and trained to follow.']],
 'dispossessors':[[N,'Those who drive others out of their possession or land.']],
 'ephod':[[N,'The high priest’s sacred vest, worn with the breastpiece; later sometimes misused as an object of worship.']],
 'facedown':[[R,'With the face toward the ground — the posture of reverence or dread.']],
 'fatling':[[N,'A young animal fattened for slaughter — choice, festival-quality meat.']],
 'fatlings':[[N,'Young animals fattened for slaughter.']],
 'firepans':[[N,'Bronze pans for carrying coals and ashes from the altar.']],
 'firepot':[[N,'A pot or brazier holding burning coals for warmth or ritual.']],
 'firstfruits':[[N,'The first and best portion of the harvest, given to God in trust that the rest would follow.']],
 'floodwaters':[[N,'The waters of a flood.']],
 'gerahs':[[N,'The smallest Hebrew weight — twenty gerahs made one shekel.']],
 'gleanings':[[N,'What is left in field or vineyard after harvest — by law left for the poor to gather.']],
 'handmill':[[N,'A pair of household grinding stones turned by hand to make flour.']],
 'indisputably':[[R,'Beyond any dispute or question.']],
 'koum':[[N,'Aramaic for “arise” — Jesus’ word to Jairus’ daughter: “Talitha koum,” “Little girl, arise.”']],
 'koumi':[[N,'Aramaic for “arise” (variant spelling of koum).']],
 'lampstand':[[N,'The stand that holds burning lamps — in the tabernacle, the seven-branched golden menorah.']],
 'lampstands':[[N,'Stands holding burning lamps; in Revelation, symbols of the churches.']],
 'launderer':[[N,'One who washes and whitens cloth — a fuller.']],
 'lema':[[N,'Aramaic for “why” — from the cross: “Eloi, Eloi, lema sabachthani,” “My God, My God, why have You forsaken Me?”']],
 'lethech':[[N,'A Hebrew dry measure — half a homer, roughly 110 liters.']],
 'metalsmiths':[[N,'Craftsmen who work metal.']],
 'mountaintop':[[N,'The summit of a mountain.']],
 'mountaintops':[[N,'The summits of mountains.']],
 'neighings':[[N,'The cries of horses — used by Jeremiah for shameless lust.']],
 'omer':[[N,'A Hebrew dry measure — a tenth of an ephah, about 2 liters; the daily manna ration.']],
 'omers':[[N,'Plural of omer — Hebrew measures of about 2 liters each.']],
 'onycha':[[N,'A fragrant spice ingredient of the sacred incense, likely from a mollusk shell.']],
 'outpoured':[[V,'Poured out — as wrath, or the Spirit, poured forth.']],
 'oxgoad':[[N,'A long pointed stick for driving oxen — Shamgar’s weapon against the Philistines.']],
 'passersby':[[N,'People passing by.']],
 'pim':[[N,'A Philistine-era weight (about two-thirds of a shekel) — the price they charged Israelites to sharpen tools.']],
 'reenter':[[V,'To enter again.']],
 'reentered':[[V,'Entered again.']],
 'regather':[[V,'To gather together again — as God promises to regather scattered Israel.']],
 'replaster':[[V,'To plaster again.']],
 'replastered':[[V,'Plastered again.']],
 'responsively':[[R,'In answering turn — singing or speaking back and forth.']],
 'reteach':[[V,'To teach again.']],
 'reviler':[[N,'One who insults and abuses with words.']],
 'sabachthani':[[N,'Aramaic for “you have forsaken me” — from Jesus’ cry on the cross, quoting Psalm 22:1.']],
 'seah':[[N,'A Hebrew dry measure — about 7 liters; three seahs made an ephah.']],
 'seahs':[[N,'Plural of seah — Hebrew measures of about 7 liters each.']],
 'sheepshearers':[[N,'Workers who shear wool from sheep — shearing time was a festival occasion.']],
 'shipmaster':[[N,'The captain of a ship.']],
 'showbread':[[N,'The twelve loaves set before the LORD in the holy place each Sabbath — the “bread of the Presence.”']],
 'simplehearted':[[A,'Innocent and without guile; open, trusting.']],
 'sinfully':[[R,'In a sinful manner.']],
 'sistrums':[[N,'Handheld rattles shaken in worship and celebration.']],
 'sixtyfold':[[R,'Sixty times as much.']],
 'slingstones':[[N,'Smooth stones hurled from a sling.']],
 'sonship':[[N,'The standing of a son — in Paul, the believer’s adoption into God’s family with full rights.']],
 'spearmen':[[N,'Soldiers armed with spears.']],
 'spiritist':[[N,'One who consults spirits of the dead — a practice forbidden in Israel.']],
 'spiritists':[[N,'Those who consult spirits of the dead.']],
 'tetrarch':[[N,'A ruler of a fourth part of a region under Rome — such as Herod Antipas over Galilee.']],
 'thirtyfold':[[R,'Thirty times as much.']],
 'thornbush':[[N,'A thorny shrub.']],
 'thornbushes':[[N,'Thorny shrubs.']],
 'treader':[[N,'One who treads — especially one who crushes grapes in a winepress.']],
 'twistedness':[[N,'The quality of being twisted — crookedness, perversity.']],
 'uncircumcised':[[A,'Not circumcised — outside the covenant sign given to Abraham; used figuratively of unresponsive hearts, lips, or ears.']],
 'uncircumcision':[[N,'The state of being uncircumcised — in Paul, shorthand for the Gentiles.']],
 'unfanned':[[A,'Not fanned — of a fire: blazing without anyone blowing on it (Job 20:26).']],
 'unfruitfulness':[[N,'The state of bearing no fruit — producing nothing of value.']],
 'unless':[[G,'Except on the condition that.']],
 'unsearchable':[[A,'Beyond searching out — too deep or vast to be fully traced or fathomed.']],
 'unshrunk':[[A,'Not yet shrunk — of new cloth that will contract when washed, tearing an old garment it patches.']],
 'unspiritual':[[A,'Not governed by the Spirit — merely natural, fleshly.']],
 'unstopped':[[A,'Opened, unblocked — as deaf ears “unstopped” (Isaiah 35:5).']],
 'unwalled':[[A,'Without defensive walls — open and unfortified.']],
 'unweighed':[[A,'Not weighed — left unmeasured because the quantity was too great.']],
 'vinedressers':[[N,'Workers who tend and prune vineyards.']],
 'waterpots':[[N,'Large jars for holding water.']],
 'waywardness':[[N,'Willful straying from the right path — backsliding.']],
 'wingtips':[[N,'The outer tips of wings — as of the cherubim spanning the Most Holy Place.']],
 'yokefellow':[[N,'A companion pulling under the same yoke — a true partner in work (Philippians 4:3).']],
}
# contractions
for c, base in {"didn't":'did not',"don't":'do not',"haven't":'have not',"wasn't":'was not',
                "hasn't":'has not',"aren't":'are not',"shouldn't":'should not',
                "couldn't":'could not',"doesn't":'does not',"isn't":'is not',
                "won't":'will not',"can't":'cannot',"wouldn't":'would not',
                "weren't":'were not',"i'm":'I am',"i've":'I have',"i'll":'I will',
                "i'd":'I would / I had',"you're":'you are',"you've":'you have',
                "you'll":'you will',"you'd":'you would / you had',"we're":'we are',
                "we've":'we have',"we'll":'we will',"we'd":'we would / we had',
                "they're":'they are',"they've":'they have',"they'll":'they will',
                "they'd":'they would / they had',"he's":'he is / he has',
                "she's":'she is / she has',"it's":'it is / it has',"that's":'that is',
                "there's":'there is',"what's":'what is',"who's":'who is',
                "let's":'let us',"here's":'here is',"how's":'how is',
                "where's":'where is',"mustn't":'must not',"needn't":'need not',
                "ain't":'is not / are not (colloquial)'}.items():
    CURATED[c] = [[G, f'Contraction of “{base}.”']]
CURATED["o'clock"] = [[R, 'Of the clock — used in telling time ("nine o’clock").']]

# Compound adverbs of place built on where/there/here (whereon, thereupon,
# hereunto…) — regular, so generate the whole family.
_PLACE_BASE = {'where': 'which', 'there': 'that', 'here': 'this'}
for _pfx, _ref in _PLACE_BASE.items():
    for _sfx, _gloss in [('on', 'on'), ('at', 'at'), ('upon', 'upon'), ('unto', 'to'),
                         ('to', 'to'), ('out', 'out of'), ('into', 'into'), ('of', 'of'),
                         ('by', 'by'), ('with', 'with'), ('from', 'from'), ('about', 'about'),
                         ('into', 'into'), ('through', 'through'), ('under', 'under')]:
        CURATED.setdefault(_pfx + _sfx, [[R, f'{_gloss.capitalize()} {_ref}; {_gloss} {"which" if _pfx == "where" else "it"}.']])
CURATED.setdefault('towards', [[G, 'Toward; in the direction of.']])
CURATED.setdefault('soever', [[R, 'At all; of any kind (often attached to who/what/where).']])

# Archaic / older-translation vocabulary WordNet lacks (KJV, ASV, RV, Douay).
for w, pos, d in [
 ('afore',G,'Before.'), ('aforetime',R,'Formerly; in earlier times.'),
 ('aforehand',R,'Beforehand; in advance.'), ('albeit',G,'Although; even though.'),
 ('alway',R,'Archaic form of “always.”'), ('amidst',G,'In the middle of; among.'),
 ('amongst',G,'Among.'), ('canst',V,'Archaic form of “can” (used with thou).'),
 ('couldst',V,'Archaic form of “could” (used with thou).'),
 ('wouldest',V,'Archaic form of “would” (used with thou).'),
 ('shouldest',V,'Archaic form of “should” (used with thou).'),
 ('mayest',V,'Archaic form of “may” (used with thou).'),
 ('mightest',V,'Archaic form of “might” (used with thou).'),
 ('oughtest',V,'Archaic form of “ought” (used with thou).'),
 ('clave',V,'Archaic past tense of “cleave” — clung to, or split.'),
 ('cloke',N,'Archaic spelling of “cloak.”'), ('bason',N,'Archaic spelling of “basin.”'),
 ('basons',N,'Archaic spelling of “basins.”'),
 ('cherubims',N,'Archaic double plural of “cherub” — the cherubim, angelic beings.'),
 ('seraphims',N,'Archaic double plural of “seraph” — the seraphim, angelic beings.'),
 ('chesnut',N,'Archaic spelling of “chestnut.”'),
 ('caterpiller',N,'Archaic spelling of “caterpillar.”'),
 ('caterpillers',N,'Archaic spelling of “caterpillars.”'),
 ('attent',A,'Attentive; paying close attention.'),
 ('betake',V,'To take oneself; to go: “he betook himself to the hills.”'),
 ('betakes',V,'Takes oneself; goes.'), ('betook',V,'Past tense of “betake” — went.'),
 ('bibber',N,'A habitual drinker: “a winebibber.”'),
 ('baken',V,'Archaic past participle of “bake” — baked.'),
 ('chode',V,'Archaic past tense of “chide” — rebuked, scolded.'),
 ('durst',V,'Archaic past tense of “dare” — dared.'),
 ('bewray',V,'To reveal or betray: “thy speech bewrayeth thee.”'),
 ('bewrayeth',V,'Reveals; betrays.'),
 ('holden',V,'Archaic past participle of “hold” — held.'),
 ('gotten',V,'Past participle of “get” — received, obtained.'),
 ('spilt',V,'Past tense of “spill” — spilled.'),
 ('digged',V,'Archaic past tense of “dig” — dug.'),
 ('builded',V,'Archaic past tense of “build” — built.'),
 ('stablish',V,'Archaic form of “establish” — to make firm.'),
 ('stablished',V,'Archaic form of “established.”'),
 ('marishes',N,'Archaic form of “marshes.”'),
 ('assarion',N,'A small Roman copper coin, worth about 1/16 of a denarius.'),
 ('choenix',N,'A Greek dry measure, about a quart — a day’s grain ration.'),
 ('bekah',N,'A Hebrew weight — half a shekel.'),
 ('bekahs',N,'Hebrew weights — half-shekels.'),
 ('amomum',N,'A fragrant spice plant traded in the ancient world.'),
 ('chittim',N,'Kittim — the coastlands of Cyprus and the western Mediterranean.'),
 ('hasted',V,'Archaic past tense of "haste" — hurried.'),
 ('withholden',V,'Archaic past participle of "withhold" — withheld.'),
 ('forgat',V,'Archaic past tense of "forget" — forgot.'),
 ('intreat',V,'Archaic spelling of "entreat" — to plead with.'),
 ('intreated',V,'Archaic spelling of "entreated" — pleaded with.'),
 ('asswaged',V,'Archaic spelling of "assuaged" — eased, subsided.'),
 ('darksome',A,'Dark; gloomy.'),
 ('foresaid',A,'Said before; aforementioned.'),
 ('selfwill',N,'Stubborn insistence on one’s own way.'),
 ('outgoings',N,'The farthest limits or boundaries; where something goes out.'),
 ('inclosings',N,'Archaic spelling of "enclosings" — the settings in which gems are mounted.'),
 ('lapis',N,'Short for lapis lazuli — a deep-blue semiprecious stone.'),
 ('shemesh',N,'Hebrew for "sun" — appears in place names like Beth Shemesh.'),
 ('kidon',N,'Hebrew for a javelin or short spear.'),
 ('cumi',V,'Aramaic for "arise" — "Talitha cumi": little girl, arise (Mark 5:41).'),
 ('arim',N,'Hebrew for "cities."'),
 ('nashim',N,'Hebrew for "women."'),
 ('ozen',N,'Hebrew for "ear."'),
 ('exactor',N,'One who demands or extorts payment; an oppressive collector.'),
 ('exactors',N,'Those who demand or extort payment.'),
]:
    CURATED.setdefault(w, [[pos, d]])

# Hebrew alphabet letter names (the acrostic section headings of Psalm 119 and
# Lamentations appear in the text of several translations).
for i, letter in enumerate(['aleph','beth','gimel','daleth','he','waw','zayin','heth',
                            'teth','yodh','kaph','lamedh','mem','nun','samekh','ayin',
                            'pe','tsadhe','qoph','resh','shin','taw','vav','tav','sadhe',
                            'tsade','cheth','jod','lamed','tzaddi','koph','schin']):
    if letter not in CURATED:
        CURATED[letter] = [[N, f'A letter of the Hebrew alphabet — used as a section heading in acrostic passages (each section’s verses begin with this letter in Hebrew).']]

def proper_def(w):
    if w.endswith('ites'):
        stem = w[:-1].capitalize()
        return [['name', f'A people group or family line in Scripture — the {w.capitalize()}, descendants or inhabitants tied to “{w[:-4].capitalize()}.”']]
    if w.endswith('ite'):
        return [['name', f'A member of a people group or family line in Scripture (one of the {w.capitalize()}s).']]
    if w.endswith('im') and len(w) > 4:
        return [['name', f'A Hebrew plural name in Scripture — a people group, class of beings, or family line called the {w.capitalize()}.']]
    return [['name', 'A proper name in Scripture — a person, place, nation, or family line.']]

def compound_def(w):
    parts = [p for p in w.split('-') if p]
    head = parts[-1]
    base = wn_defs(head, 1)
    tail = f' Here “{head}”: {base[0][1][0].lower() + base[0][1][1:]}' if base else ''
    return [[A, f'Compound of “{"” + “".join(parts)}.”{tail}']]

# Resolvers for words that only appear in the downloadable translations ────────
def resolvable(w):
    """Best definition for a normalized word, or None."""
    if w in CURATED: return CURATED[w]
    return wn_defs(w) or (wn_defs(w.replace("'", '')) if "'" in w else None)

def archaic_verb_def(w):
    """loveth → love, comest → come, carrieth → carry, abhorreth → abhor."""
    m = re.match(r"^([a-z]{2,})(eth|est|edst)$", w)
    if not m: return None
    stems = [m.group(1), m.group(1) + 'e', re.sub(r'i$', 'y', m.group(1)),
             re.sub(r'([a-z])\1$', r'\1', m.group(1))]  # abhorr → abhor
    for stem in dict.fromkeys(stems):
        base = wn_defs(stem)
        if base:
            return [[base[0][0], f'Archaic form of “{stem}.” ' + base[0][1]]] + base[1:2]
    return None

def early_modern_candidates(w):
    """Spelling variants used by the 1599 Geneva Bible: u/v and i/j swaps
    (anywhere in the word), y↔i, silent final -e, -esse endings, doubled
    letters (worlde, euery, iudge, abiect, agaynst)."""
    seen, out = {w}, []
    def add(x):
        if x and x != w and x not in seen: seen.add(x); out.append(x)
    swaps = {w,
             re.sub(r'(?<=[a-z])u(?=[aeiouy])', 'v', w),   # euery → every, gaue → gave
             re.sub(r'^v(?=[a-z])', 'u', w),               # vnto → unto
             w.replace('vn', 'un'),
             re.sub(r'i(?=[aeiou])', 'j', w, count=1),     # abiect → abject, iohn → john
             re.sub(r'^i(?=[aeiou])', 'j', w),
             w.replace('ay', 'ai'),                        # agaynst → against
             w.replace('oy', 'oi'),
             w.replace('y', 'i')}
    # combinations of the two most common transforms
    swaps.add(re.sub(r'(?<=[a-z])u(?=[aeiouy])', 'v', w.replace('ay', 'ai')))
    for s in list(swaps):
        add(s)
        add(re.sub(r'e$', '', s))              # worlde → world
        add(re.sub(r'esse$', 'ess', s))        # witnesse → witness
        add(re.sub(r'([a-z])\1e$', r'\1', s))  # sinne → sin
        add(re.sub(r'ie$', 'y', s))            # glorie → glory
        add(s.replace('ee', 'e'))              # beleeue-style doubles
        add(re.sub(r'([a-z])\1', r'\1', s, count=1))
    return out

def early_modern_def(w):
    for cand in early_modern_candidates(w):
        base = resolvable(cand) or archaic_verb_def(cand)
        if base:
            return [[G, f'Early-Modern (1599) spelling of “{cand}.”']] + base[:2]
    return None

entries = {}
stats = {'wordnet':0,'curated':0,'proper':0,'compound':0,'archaic':0,'spelling':0,'generic':0}
unresolved = []
for w, e in sorted(info.items()):
    if w in CURATED:
        entries[w] = CURATED[w]; stats['curated'] += 1; continue
    d = wn_defs(w) or (wn_defs(w.replace("'",'')) if "'" in w else None)
    if d:
        entries[w] = d; stats['wordnet'] += 1; continue
    # Inflected forms WordNet stores under the base word (towards → toward,
    # cursings → cursing): morphy finds the lemma.
    for pos in ('n', 'v', 'a', 'r'):
        base = wn.morphy(w, pos)
        if base and base != w:
            bd = wn_defs(base)
            if bd:
                d = [[bd[0][0], f'(Form of “{base}”) ' + bd[0][1]]] + bd[1:2]
                break
    if d:
        entries[w] = d; stats['wordnet'] += 1; continue
    if e['lc'] == 0:
        entries[w] = proper_def(w); stats['proper'] += 1; continue
    if '-' in w:
        entries[w] = compound_def(w); stats['compound'] += 1; continue
    if w in core_words:
        # The on-device MSB/BSB texts must stay fully covered — but merged
        # counts from other translations can flip the capitalization heuristic
        # (MSB has only "Abba", MSG has "abba"). If the word was proper-name-
        # shaped in the core texts alone, keep the proper entry; otherwise stop.
        core = core_info.get(w, {})
        if core.get('lc', 1) == 0:
            entries[w] = proper_def(w); stats['proper'] += 1; continue
        raise SystemExit(f'UNCOVERED WORD: {w} — add it to CURATED')
    d = archaic_verb_def(w)
    if d:
        entries[w] = d; stats['archaic'] += 1; continue
    d = early_modern_def(w)
    if d:
        entries[w] = d; stats['spelling'] += 1; continue
    if e.get('cap', 0) >= e.get('lc', 0):
        entries[w] = proper_def(w); stats['proper'] += 1; continue
    unresolved.append(w)

SHORT_JOIN_WORDS = {'a','i','o','an','as','at','be','by','he','if','in','is','it',
                    'my','of','on','or','so','to','up','us','we','and','the','you'}
def _join_part_ok(p):
    return p in SHORT_JOIN_WORDS or p in CURATED or (len(p) > 2 and bool(wn.synsets(p)))
def find_split(w):
    """Longest-second-part split of w into two known words, or None."""
    for i in range(1, len(w)):
        if _join_part_ok(w[:i]) and _join_part_ok(w[i:]):
            return (w[:i], w[i:])
    return None

def closed_compound_def(a, b):
    head = wn_defs(b, 1)
    tail = f' Here “{b}”: {head[0][1][0].lower() + head[0][1][1:]}' if head else ''
    return [[N, f'Compound word — “{a}” + “{b}.”{tail}']]

# Sentence-glue words: a fused word containing one of these on either side is a
# text-dump artifact, not a real compound.
FUNCTIONISH = SHORT_JOIN_WORDS | {
    'the','and','you','your','his','her','its','our','their','them','they',
    'who','what','when','then','than','this','that','these','those','was',
    'are','were','will','with','for','not','but','all','out','into','unto',
    'said','say','had','has','have','him','she','can','could','would','should',
    'from','about','because','there','here','been','being','other','some','such'}

if unresolved:
    kept = []
    for w in unresolved:
        if info[w].get('heb'):
            entries[w] = [['hebrew', 'A transliterated Hebrew term used by the Orthodox Jewish Bible. Compare this verse in another version for its English rendering.']]
            stats['hebrew'] = stats.get('hebrew', 0) + 1
        elif info[w].get('gnv'):
            entries[w] = [[G, 'An Early-Modern English spelling from the 1599 Geneva Bible. Read it aloud — the modern word usually surfaces (u↔v and i↔j swap, extra silent letters drop).']]
            stats['generic'] += 1
        elif (split := find_split(w)) and (split[0] in FUNCTIONISH or split[1] in FUNCTIONISH):
            # Text-endpoint dumps fuse words around sentence glue ("aboutthe",
            # "saidto", "avery") — the app's JSON parser space-joins fragments,
            # so these never occur in real verse text. Drop them.
            stats['artifact'] = stats.get('artifact', 0) + 1
        elif split:
            # Two content words = a real closed compound (lovingkindness,
            # moneychangers, buryingplace) — define it from its parts.
            entries[w] = closed_compound_def(*split)
            stats['compound'] += 1
        else:
            entries[w] = [['word', 'No built-in definition for this exact form yet. The verse itself shows how it is used; the online lookup adds a full definition when connected.']]
            stats['generic'] += 1
            kept.append(w)
    print(f'{len(kept)} extra-version words got the plain generic entry:')
    print('  ' + ', '.join(kept[:150]))

out = ('// Offline English dictionary for the Rhema reader. Generated by\n'
       '// scripts/build-english-dictionary.py — covers every word in the on-device\n'
       '// MSB/BSB texts plus the vocabulary of all downloadable translations\n'
       '// (NIV, KJV, MSG, Geneva 1599, TOJB, ...): WordNet glosses, curated biblical\n'
       '// and archaic terms, spelling aliases, proper-name/compound/Hebrew entries.\n'
       '// Verify: node scripts/test-english-dictionary.js\n'
       'window.RhemaEnglishDictionary = ' + json.dumps({'version':2,'entries':entries}, ensure_ascii=False, separators=(',',':')) + ';\n')
open(os.path.join(ROOT,'rhema-english-dictionary.js'),'w').write(out)
print('entries:', len(entries), stats)
print('size:', os.path.getsize(os.path.join(ROOT,'rhema-english-dictionary.js')), 'bytes')
