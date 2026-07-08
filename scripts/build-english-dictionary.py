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
                "couldn't":'could not',"doesn't":'does not'}.items():
    CURATED[c] = [[G, f'Contraction of “{base}.”']]

def proper_def(w):
    if w.endswith('ites'):
        stem = w[:-1].capitalize()
        return [['name', f'A people group or family line in Scripture — the {w.capitalize()}, descendants or inhabitants tied to “{w[:-4].capitalize()}.”']]
    if w.endswith('ite'):
        return [['name', f'A member of a people group or family line in Scripture (one of the {w.capitalize()}s).']]
    if w.endswith('im') and len(w) > 4:
        return [['name', f'A Hebrew plural name in Scripture — a people group, class of beings, or family line called the {w.capitalize()}.']]
    return [['name', 'A proper name in Scripture — a person, place, nation, or family line. The verse itself and any Bible Dictionary card above show who or what it refers to.']]

def compound_def(w):
    parts = [p for p in w.split('-') if p]
    head = parts[-1]
    base = wn_defs(head, 1)
    tail = f' Here “{head}”: {base[0][1][0].lower() + base[0][1][1:]}' if base else ''
    return [[A, f'Compound of “{"” + “".join(parts)}.”{tail}']]

entries = {}
stats = {'wordnet':0,'curated':0,'proper':0,'compound':0}
for w, e in sorted(info.items()):
    if w in CURATED:
        entries[w] = CURATED[w]; stats['curated'] += 1; continue
    d = wn_defs(w) or (wn_defs(w.replace("'",'')) if "'" in w else None)
    if d:
        entries[w] = d; stats['wordnet'] += 1; continue
    if e['lc'] == 0:
        entries[w] = proper_def(w); stats['proper'] += 1; continue
    if '-' in w:
        entries[w] = compound_def(w); stats['compound'] += 1; continue
    raise SystemExit(f'UNCOVERED WORD: {w} — add it to CURATED')

out = ('// Offline English dictionary for the Rhema reader. Generated by\n'
       '// scripts/build-english-dictionary.py — every word used in the MSB and BSB\n'
       '// texts has an entry (WordNet glosses, curated biblical terms, generated\n'
       '// proper-name and compound entries). Verify: node scripts/test-english-dictionary.js\n'
       'window.RhemaEnglishDictionary = ' + json.dumps({'version':1,'entries':entries}, ensure_ascii=False, separators=(',',':')) + ';\n')
open(os.path.join(ROOT,'rhema-english-dictionary.js'),'w').write(out)
print('entries:', len(entries), stats)
print('size:', os.path.getsize(os.path.join(ROOT,'rhema-english-dictionary.js')), 'bytes')
