# Hand-corrected short glosses for the Hebrew lexicon (rhema-hebrew-lexicon.js):
# meanings that had been cut down to a bare verb ("be", "act", "treat"), and
# glosses that added "divine"/"sacred" the word itself doesn't carry. Checked
# against BDB and each entry's Strong's definition. Re-runnable.
import json, sys
P = 'rhema-hebrew-lexicon.js'
FIX = {
 # truncated verbs
 '2388': 'be strong, strengthen', '2930': 'be unclean, become unclean', '3513': 'be heavy, be honored',
 '3190': 'be good, do well', '2891': 'be clean, be pure', '7043': 'be slight, be swift; curse',
 '2114': 'be a stranger, be strange', '2470': 'be weak, be sick', '6381': 'be wonderful, be extraordinary',
 '7368': 'be far, go far away', '2763': 'devote to destruction', '5352': 'be innocent, go unpunished',
 '553': 'be strong, be bold', '6663': 'be righteous, be in the right', '1580': 'deal with (well or ill), repay; wean',
 '4603': 'act unfaithfully', '816': 'be guilty', '6509': 'be fruitful, bear fruit', '2449': 'be wise',
 '7185': 'be hard, be harsh', '2204': 'be old, grow old', '5006': 'spurn, despise', '1319': 'bring good news',
 '2895': 'be good, be pleasing', '3276': 'profit, benefit', '5953': 'deal severely with; glean',
 '6105': 'be mighty, be numerous', '2821': 'be dark, grow dark', '2986': 'bring, carry along',
 '3322': 'set, place', '5068': 'offer willingly, volunteer', '6087': 'grieve, hurt; shape',
 '2324': 'show, declare', '4843': 'be bitter', '2552': 'be hot, be warm', '5810': 'be strong, prevail',
 '1878': 'be fat; anoint', '119': 'be red', '2102': 'act presumptuously; boil', '5144': 'separate oneself, dedicate',
 '5181': 'go down, descend', '5736': 'be left over, exceed', '6009': 'be deep', '8027': 'do a third time; divide in three',
 '2554': 'do violence, wrong', '3835': 'be white; make bricks', '7401': 'be soft, be tender', '662': 'restrain oneself',
 '3302': 'be beautiful', '7696': 'be mad, rave', '2300': 'be sharp', '2331': 'show, declare',
 '7034': 'be dishonored, treat lightly', '1584': 'come to an end, complete', '4985': 'be sweet', '6191': 'be shrewd, be crafty',
 '8041': 'go to the left', '8080': 'grow fat', '3231': 'go to the right', '3655': 'give a title, flatter',
 '5069': 'offer freely', '5230': 'deceive, act craftily', '5541': 'reject, treat as worthless', '6994': 'be small, be insignificant',
 '7685': 'grow, increase', '142': 'be majestic, glorious', '874': 'make plain, explain', '2616': 'show oneself kind; reproach',
 '3161': 'be united, join', '5666': 'be thick', '6014': 'treat as a slave; bind sheaves', '6059': 'put on as a necklace',
 '7945': 'of, which (relative particle)', '908': 'devise, invent', '5765': 'act wrongly', '6188': 'treat as uncircumcised',
 '6280': 'be abundant', '7679': 'make great, magnify', '541': 'go to the right', '1738': 'be sick, be faint',
 '1957': 'dream, rave', '2103': 'act proudly', '2826': 'be weak, lag behind', '3267': 'be fierce, defiant',
 '5605': 'stand at the threshold', '6737': 'act as an envoy', '2846': 'snatch up (coals)', '5437': 'go around, surround',
 '3559': 'be firm, establish', '3557': 'contain, sustain', '3341': 'set on fire, burn',
 # glosses that added "divine"/"sacred"
 '727': 'chest, ark', '1346': 'pride, majesty', '1348': 'majesty, pride', '1370': 'power', '1606': 'rebuke',
 '1703': 'word', '2195': 'indignation, fury', '2689': 'trumpet', '2708': 'statute', '2740': 'burning anger',
 '3742': 'cherub', '3994': 'curse', '4045': 'rebuke', '4046': 'plague, blow', '4103': 'panic, confusion',
 '4190': 'deliverance', '4397': 'messenger, angel', '4398': 'angel, messenger', '4400': 'message', '4531': 'testing, trial',
 '4561': 'discipline, admonition', '4583': 'dwelling, refuge', '4659': 'deeds, works', '4687': 'commandment',
 '4720': 'sanctuary', '4744': 'assembly, convocation', '4888': 'anointing; portion', '5145': 'consecration; crown',
 '5547': 'forgiveness', '5894': 'watcher', '5949': 'deed, act', '6304': 'redemption; distinction', '6490': 'precepts',
 '6918': 'holy, set apart', '7072': 'jealous', '7086': 'dish, platter', '7184': 'jar, jug', '7398': 'chariot',
 '7522': 'favor, goodwill, will', '7677': 'solemn rest', '8592': 'power, strength', '8641': 'contribution, offering',
 '8642': 'contribution, offering',
 # common words whose gloss picked one narrow sense
 '5750': 'still, again', '2490': 'profane; pierce; begin', '6086': 'tree, wood', '2451': 'wisdom, skill',
 '2233': 'seed, offspring', '389': 'surely, only', '5656': 'service, work', '8269': 'official, leader, prince',
 '2428': 'strength, wealth, army', '3280': 'female ibex', '1245': 'seek',
 # "young woman", which the word itself says (BDB, HALOT); the debate is in the study
 '5959': 'young woman, maiden',
}
src = open(P, encoding='utf-8').read()
a = src.index('window.RhemaHebrewLexicon = ') + len('window.RhemaHebrewLexicon = ')
lex, end = json.JSONDecoder().raw_decode(src[a:])
n = 0
for k, g in FIX.items():
    e = lex.get(k)
    if not e: print('missing', k, file=sys.stderr); continue
    for f in ('gloss', 'brief', 'quick_def'):
        if e.get(f) != g: e[f] = g; n += 1
open(P, 'w', encoding='utf-8').write(src[:a] + json.dumps(lex, ensure_ascii=False, separators=(',', ':')) + src[a + end:])
print('fields updated', n, 'entries', len(FIX))
