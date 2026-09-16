/* ============================================================================
 * Bible Genealogy — "Who's Who" family-tree map for Rhema
 * ----------------------------------------------------------------------------
 * A self-contained feature module. It owns:
 *   • the genealogical dataset (the Adam → Jesus redemptive line + key branches)
 *   • a deterministic, offline cartoon-avatar engine (unique SVG per person)
 *   • a scroll-down family-tree overlay ("the map")
 *   • a per-person info card (every verse they're mentioned in + why)
 *   • the reader hook that puts a little person icon at the end of any verse
 *     where someone's genealogy is recorded.
 *
 * No network, no external image library — everything renders from data so it
 * stays reliable and works fully offline inside the PWA.  Exposed as
 * window.BibleGenealogy plus a few global helpers used by the reader.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.BibleGenealogy) return; // already loaded

  /* ---- Book display names (kept local so the module stands alone) --------- */
  var BOOK_NAMES = (window.RhemaBookNames) || {
    GEN: 'Genesis', RUT: 'Ruth', '1CH': '1 Chronicles', '1SA': '1 Samuel',
    '2SA': '2 Samuel', '1KI': '1 Kings', MAT: 'Matthew', LUK: 'Luke',
    EXO: 'Exodus', NUM: 'Numbers', HEB: 'Hebrews'
  };
  function bookName(code) {
    return (window.RhemaBookNames && window.RhemaBookNames[code]) || BOOK_NAMES[code] || code;
  }
  function refDisplay(ref) {
    // "GEN 5:3" -> "Genesis 5:3"
    var m = /^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(ref);
    if (!m) return ref;
    return bookName(m[1]) + ' ' + m[2] + ':' + m[3] + (m[4] ? '-' + m[4] : '');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ========================================================================
   * ERA STYLING — each stretch of the line gets its own accent + label so the
   * long scroll reads like chapters of one story.
   * ======================================================================*/
  var ERAS = {
    creation:   { label: 'From Adam to Noah',     accent: '#7c6cf0', soft: '#efecff', ink: '#3a2f8f' },
    postflood:  { label: 'From Noah to Abraham',  accent: '#0ea5a4', soft: '#e2fbf8', ink: '#0b6b6a' },
    patriarch:  { label: 'The Patriarchs',        accent: '#e0872b', soft: '#fdf0dd', ink: '#9a5a12' },
    judges:     { label: 'The Line of Judah',     accent: '#5b9a4e', soft: '#e9f7e4', ink: '#3c6a33' },
    kings:      { label: 'The Kings of Judah',    accent: '#8b5cf6', soft: '#f1eafe', ink: '#5b2ea6' },
    exile:      { label: 'Exile & Return',        accent: '#5f7590', soft: '#eaeff5', ink: '#3d4d61' },
    messiah:    { label: 'The Messiah',           accent: '#e0a919', soft: '#fdf4d8', ink: '#8a6608' }
  };

  /* ========================================================================
   * AVATAR PALETTES
   * ======================================================================*/
  var SKIN = {
    light: '#f2c8a0', olive: '#e0ad78', tan: '#cf9b62', brown: '#a9713f', deep: '#875128'
  };
  var HAIR = {
    black: '#211b1a', darkbrown: '#3a2519', brown: '#5b3a22', auburn: '#7a3b1e',
    gray: '#9b9490', grey: '#9b9490', silver: '#c9c6c1', white: '#e9e6df', red: '#8a3a1c'
  };
  // (guard a typo above by normalising unknown hair to brown at read time)
  function hairHex(k) { return HAIR[k] || '#5b3a22'; }

  /* ========================================================================
   * DATA — the redemptive spine (Adam → Jesus) plus notable branches.
   * Fathers on the spine chain to the previous entry automatically; branch
   * people attach to a spine person via `branchOf`.
   *
   * Fields:
   *   id, name, gender('m'|'f'), meaning
   *   bornWhenFather  (father's age at their birth — Gen 5 & 11), lived (years)
   *   spouse, origin, role, era, blurb
   *   gen:      anchor refs — verses that RECORD this person's genealogy/line
   *             (these are what light up the reader's person icon)
   *   mentions: [{ref, q}] notable appearances + a quick fact for each
   *   av: {skin,hair,style,beard,head,halo}  — avatar attributes
   * ======================================================================*/

  // Spine, in order. father = previous spine id (set after construction).
  var SPINE = [
    { id:'adam', name:'Adam', gender:'m', meaning:'“man / from the ground”', lived:930, bornWhenFather:null,
      spouse:'Eve', origin:'The Garden of Eden', role:'The first man', era:'creation',
      blurb:'Formed by God from the dust and given breath; father of the human family.',
      gen:['GEN 5:1','GEN 5:3','1CH 1:1','LUK 3:38'],
      mentions:[
        {ref:'GEN 1:27', q:'Created in the image of God, male and female.'},
        {ref:'GEN 2:7', q:'Formed from the dust; God breathed life into him.'},
        {ref:'GEN 3:20', q:'Named his wife Eve, “mother of all living.”'},
        {ref:'GEN 5:5', q:'Lived 930 years, then died.'},
        {ref:'ROM 5:14', q:'Paul calls him a pattern of the One to come.'} ],
      av:{skin:'tan', hair:'darkbrown', style:'short', beard:'full', head:'none'} },

    { id:'seth', name:'Seth', gender:'m', meaning:'“appointed / granted”', lived:912, bornWhenFather:130,
      origin:'East of Eden', role:'Appointed son', era:'creation',
      blurb:'Born to Adam in place of Abel; through him the godly line continued.',
      gen:['GEN 5:6','GEN 4:25','1CH 1:1','LUK 3:38'],
      mentions:[
        {ref:'GEN 4:25', q:'Eve: “God has appointed for me another offspring.”'},
        {ref:'GEN 4:26', q:'In his days people began to call on the name of the LORD.'},
        {ref:'GEN 5:8', q:'Lived 912 years.'} ],
      av:{skin:'tan', hair:'brown', style:'short', beard:'short', head:'none'} },

    { id:'enosh', name:'Enosh', gender:'m', meaning:'“mortal man”', lived:905, bornWhenFather:105,
      role:'Son of Seth', era:'creation',
      blurb:'His name means frail, mortal humanity — a quiet link in the early chain.',
      gen:['GEN 5:9','1CH 1:1','LUK 3:38'],
      mentions:[ {ref:'GEN 5:11', q:'Lived 905 years.'} ],
      av:{skin:'tan', hair:'brown', style:'short', beard:'short', head:'none'} },

    { id:'kenan', name:'Kenan', gender:'m', meaning:'“possession”', lived:910, bornWhenFather:90,
      role:'Son of Enosh', era:'creation',
      blurb:'One of the long-lived fathers before the Flood.',
      gen:['GEN 5:12','1CH 1:2','LUK 3:37'],
      mentions:[ {ref:'GEN 5:14', q:'Lived 910 years.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'none'} },

    { id:'mahalalel', name:'Mahalalel', gender:'m', meaning:'“praise of God”', lived:895, bornWhenFather:70,
      role:'Son of Kenan', era:'creation',
      blurb:'His name is a small hymn: “the praise of God.”',
      gen:['GEN 5:15','1CH 1:2','LUK 3:37'],
      mentions:[ {ref:'GEN 5:17', q:'Lived 895 years.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'none'} },

    { id:'jared', name:'Jared', gender:'m', meaning:'“descent”', lived:962, bornWhenFather:65,
      role:'Father of Enoch', era:'creation',
      blurb:'Second-longest-lived man recorded; father of Enoch who walked with God.',
      gen:['GEN 5:18','1CH 1:2','LUK 3:37'],
      mentions:[ {ref:'GEN 5:20', q:'Lived 962 years.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'none'} },

    { id:'enoch', name:'Enoch', gender:'m', meaning:'“dedicated”', lived:365, bornWhenFather:162,
      role:'Walked with God', era:'creation',
      blurb:'“Enoch walked with God, and he was not, for God took him” — he did not see death.',
      gen:['GEN 5:21','1CH 1:3','LUK 3:37'],
      mentions:[
        {ref:'GEN 5:24', q:'Walked with God, then God took him away.'},
        {ref:'HEB 11:5', q:'By faith he was taken up so as not to see death.'},
        {ref:'JUD 1:14', q:'Prophesied of the Lord coming with His holy ones.'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'none', halo:'soft'} },

    { id:'methuselah', name:'Methuselah', gender:'m', meaning:'“man of the dart”', lived:969, bornWhenFather:65,
      role:'Oldest man recorded', era:'creation',
      blurb:'Lived 969 years — the longest life in Scripture. Grandfather of Noah.',
      gen:['GEN 5:25','1CH 1:3','LUK 3:37'],
      mentions:[ {ref:'GEN 5:27', q:'Lived 969 years — longer than anyone recorded.'} ],
      av:{skin:'tan', hair:'white', style:'long', beard:'long', head:'none'} },

    { id:'lamech', name:'Lamech', gender:'m', meaning:'“powerful”', lived:777, bornWhenFather:187,
      role:'Father of Noah', era:'creation',
      blurb:'Named his son Noah, hoping for relief “from the painful toil of our hands.”',
      gen:['GEN 5:28','1CH 1:3','LUK 3:36'],
      mentions:[
        {ref:'GEN 5:29', q:'Named Noah, longing for comfort from the cursed ground.'},
        {ref:'GEN 5:31', q:'Lived 777 years.'} ],
      av:{skin:'tan', hair:'brown', style:'short', beard:'full', head:'none'} },

    { id:'noah', name:'Noah', gender:'m', meaning:'“rest / comfort”', lived:950, bornWhenFather:182,
      spouse:'(unnamed)', origin:'The old world', role:'Builder of the ark', era:'creation',
      blurb:'A righteous man who walked with God; God saved him and his family through the Flood.',
      gen:['GEN 5:32','GEN 10:1','1CH 1:4','LUK 3:36'],
      mentions:[
        {ref:'GEN 6:9', q:'Righteous and blameless; he walked with God.'},
        {ref:'GEN 7:1', q:'God: “I have seen that you are righteous before me.”'},
        {ref:'GEN 9:1', q:'Blessed with his sons to be fruitful and fill the earth.'},
        {ref:'HEB 11:7', q:'By faith he built the ark, condemning the world.'} ],
      av:{skin:'tan', hair:'white', style:'long', beard:'long', head:'none'} },

    // After the Flood — Shem's line (Genesis 11)
    { id:'shem', name:'Shem', gender:'m', meaning:'“name / renown”', lived:600, bornWhenFather:500,
      role:'Son of Noah', era:'postflood',
      blurb:'The son through whom the promised line ran; ancestor of the Semitic peoples.',
      gen:['GEN 11:10','GEN 10:21','1CH 1:4','LUK 3:36'],
      mentions:[
        {ref:'GEN 9:26', q:'Noah blessed “the LORD, the God of Shem.”'},
        {ref:'GEN 11:11', q:'Lived 500 years after fathering Arphaxad.'} ],
      av:{skin:'tan', hair:'gray', style:'short', beard:'full', head:'turban'} },

    { id:'arphaxad', name:'Arphaxad', gender:'m', meaning:'—', lived:438, bornWhenFather:100,
      role:'Son of Shem', era:'postflood',
      blurb:'Born two years after the Flood; a link toward Eber and Abraham.',
      gen:['GEN 11:12','1CH 1:17','LUK 3:36'],
      mentions:[ {ref:'GEN 11:13', q:'Lived 403 years after fathering Shelah.'} ],
      av:{skin:'tan', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },

    { id:'shelah', name:'Shelah', gender:'m', meaning:'“sprout”', lived:433, bornWhenFather:35,
      role:'Son of Arphaxad', era:'postflood',
      blurb:'Father of Eber, from whom the “Hebrews” take their name.',
      gen:['GEN 11:14','1CH 1:18','LUK 3:35'],
      mentions:[ {ref:'GEN 11:15', q:'Lived 403 years after fathering Eber.'} ],
      av:{skin:'tan', hair:'brown', style:'short', beard:'full', head:'turban'} },

    { id:'eber', name:'Eber', gender:'m', meaning:'“the other side / to cross over”', lived:464, bornWhenFather:30,
      role:'Namesake of the Hebrews', era:'postflood',
      blurb:'The word “Hebrew” echoes his name — those who came “from the other side.”',
      gen:['GEN 11:16','GEN 10:24','1CH 1:18','LUK 3:35'],
      mentions:[ {ref:'GEN 10:25', q:'His son Peleg was named for the earth being divided.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },

    { id:'peleg', name:'Peleg', gender:'m', meaning:'“division”', lived:239, bornWhenFather:34,
      role:'Son of Eber', era:'postflood',
      blurb:'“In his days the earth was divided” — after which lifespans drop sharply.',
      gen:['GEN 11:18','GEN 10:25','1CH 1:19','LUK 3:35'],
      mentions:[ {ref:'GEN 10:25', q:'Named because in his days the earth was divided.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'turban'} },

    { id:'reu', name:'Reu', gender:'m', meaning:'“friend”', lived:239, bornWhenFather:30,
      role:'Son of Peleg', era:'postflood',
      blurb:'A quiet name in the chain from the Flood to Abraham.',
      gen:['GEN 11:20','1CH 1:25','LUK 3:35'],
      mentions:[ {ref:'GEN 11:21', q:'Lived 207 years after fathering Serug.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'turban'} },

    { id:'serug', name:'Serug', gender:'m', meaning:'“branch”', lived:230, bornWhenFather:32,
      role:'Grandfather of Terah', era:'postflood',
      blurb:'Two generations before Abraham’s father Terah.',
      gen:['GEN 11:22','1CH 1:26','LUK 3:35'],
      mentions:[ {ref:'GEN 11:23', q:'Lived 200 years after fathering Nahor.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },

    { id:'nahor1', name:'Nahor', gender:'m', meaning:'“snorting / snorer”', lived:148, bornWhenFather:30,
      role:'Grandfather of Abraham', era:'postflood',
      blurb:'Grandfather of Abram; his grandson Nahor kept the name.',
      gen:['GEN 11:24','1CH 1:26','LUK 3:34'],
      mentions:[ {ref:'GEN 11:25', q:'Lived 119 years after fathering Terah.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },

    { id:'terah', name:'Terah', gender:'m', meaning:'“wanderer / station”', lived:205, bornWhenFather:70,
      origin:'Ur of the Chaldeans', role:'Father of Abraham', era:'postflood',
      blurb:'Set out from Ur toward Canaan with Abram, but settled in Haran.',
      gen:['GEN 11:26','GEN 11:27','1CH 1:26','LUK 3:34'],
      mentions:[
        {ref:'GEN 11:31', q:'Led the family from Ur toward Canaan, stopping in Haran.'},
        {ref:'JOS 24:2', q:'Beyond the River, he served other gods.'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'long', head:'turban'} },

    // The Patriarchs
    { id:'abraham', name:'Abraham', gender:'m', meaning:'“father of a multitude”', lived:175, bornWhenFather:130,
      spouse:'Sarah', origin:'Ur of the Chaldeans', role:'Father of the faithful', era:'patriarch',
      blurb:'Called by God to a land he did not know; believed the promise and it was counted as righteousness.',
      gen:['GEN 11:27','MAT 1:1','MAT 1:2','1CH 1:27','1CH 1:28','LUK 3:34'],
      mentions:[
        {ref:'GEN 12:2', q:'“I will make of you a great nation… you will be a blessing.”'},
        {ref:'GEN 15:6', q:'He believed the LORD, counted to him as righteousness.'},
        {ref:'GEN 17:5', q:'Renamed from Abram — “father of a multitude.”'},
        {ref:'GEN 22:18', q:'“In your offspring all nations shall be blessed.”'},
        {ref:'MAT 1:1', q:'Jesus is called “the son of David, the son of Abraham.”'},
        {ref:'ROM 4:16', q:'The father of all who believe.'} ],
      av:{skin:'olive', hair:'white', style:'long', beard:'long', head:'turban'} },

    { id:'isaac', name:'Isaac', gender:'m', meaning:'“he laughs”', lived:180, bornWhenFather:100,
      spouse:'Rebekah', origin:'Canaan (Beersheba)', role:'The child of promise', era:'patriarch',
      blurb:'The long-promised son, born to Abraham and Sarah in their old age.',
      gen:['GEN 21:3','MAT 1:2','1CH 1:28','1CH 1:34','LUK 3:34'],
      mentions:[
        {ref:'GEN 21:6', q:'Sarah: “God has made laughter for me.”'},
        {ref:'GEN 22:9', q:'Bound on the altar; God provided a ram instead.'},
        {ref:'GEN 26:4', q:'The promise to Abraham renewed to Isaac.'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'turban'} },

    { id:'jacob', name:'Jacob (Israel)', gender:'m', meaning:'“he grasps the heel / supplanter”', lived:147, bornWhenFather:60,
      spouse:'Leah & Rachel', origin:'Canaan / Paddan-aram', role:'Father of the twelve tribes', era:'patriarch',
      blurb:'Wrestled with God and was renamed Israel; his twelve sons became the tribes.',
      gen:['GEN 25:26','MAT 1:2','1CH 1:34','1CH 2:1','LUK 3:34'],
      mentions:[
        {ref:'GEN 28:12', q:'Dreamed of a ladder to heaven at Bethel.'},
        {ref:'GEN 32:28', q:'Renamed Israel — “you have striven with God.”'},
        {ref:'GEN 49:10', q:'Blessed Judah: the scepter will not depart from him.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'long', head:'turban'} },

    { id:'judah', name:'Judah', gender:'m', meaning:'“praise”', lived:null, bornWhenFather:null,
      spouse:'Bath-shua; Tamar', origin:'Canaan', role:'Head of the royal tribe', era:'patriarch',
      blurb:'Jacob’s fourth son; from his tribe came the kings — and the Messiah.',
      gen:['GEN 29:35','MAT 1:2','MAT 1:3','1CH 2:1','1CH 2:3','LUK 3:33','RUT 4:12'],
      mentions:[
        {ref:'GEN 44:33', q:'Offered himself as a slave in place of Benjamin.'},
        {ref:'GEN 49:9', q:'Called a lion’s cub by his father Jacob.'},
        {ref:'GEN 49:10', q:'The scepter and the ruler’s staff belong to Judah.'},
        {ref:'REV 5:5', q:'Jesus is “the Lion of the tribe of Judah.”'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },

    { id:'perez', name:'Perez', gender:'m', meaning:'“a breach / breakthrough”', lived:null, bornWhenFather:null,
      origin:'Canaan', role:'Son of Judah & Tamar', era:'judges',
      blurb:'Twin who “broke through” first at birth; ancestor of David and of Christ.',
      gen:['GEN 38:29','RUT 4:18','MAT 1:3','1CH 2:4','1CH 2:5','LUK 3:33'],
      mentions:[
        {ref:'GEN 38:29', q:'Broke out first at birth — “What a breach you have made!”'},
        {ref:'RUT 4:12', q:'Bethlehem blesses Boaz’s house to be like Perez’s.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'turban'} },

    { id:'hezron', name:'Hezron', gender:'m', meaning:'“enclosed”', lived:null, bornWhenFather:null,
      role:'Son of Perez', era:'judges',
      blurb:'Went down to Egypt with Jacob’s household; a link in the royal chain.',
      gen:['RUT 4:18','MAT 1:3','1CH 2:5','1CH 2:9','LUK 3:33','GEN 46:12'],
      mentions:[ {ref:'GEN 46:12', q:'Listed among those who went to Egypt with Jacob.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },

    { id:'ram', name:'Ram', gender:'m', meaning:'“exalted”', lived:null, bornWhenFather:null,
      role:'Son of Hezron', era:'judges',
      blurb:'Called Aram in the Greek genealogies; father of Amminadab.',
      gen:['RUT 4:19','MAT 1:3','MAT 1:4','1CH 2:9','1CH 2:10','LUK 3:33'],
      mentions:[ {ref:'1CH 2:10', q:'Father of Amminadab in the Chronicler’s list.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'turban'} },

    { id:'amminadab', name:'Amminadab', gender:'m', meaning:'“my kinsman is noble”', lived:null, bornWhenFather:null,
      role:'Father-in-law of Aaron', era:'judges',
      blurb:'His daughter Elisheba married Aaron, joining the royal and priestly lines.',
      gen:['RUT 4:19','MAT 1:4','1CH 2:10','LUK 3:33'],
      mentions:[ {ref:'EXO 6:23', q:'His daughter Elisheba became Aaron’s wife.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },

    { id:'nahshon', name:'Nahshon', gender:'m', meaning:'“enchanter”', lived:null, bornWhenFather:null,
      origin:'The wilderness camp', role:'Prince of Judah', era:'judges',
      blurb:'Leader of the tribe of Judah in the wilderness; first to bring his offering.',
      gen:['RUT 4:20','MAT 1:4','1CH 2:10','1CH 2:11','LUK 3:32'],
      mentions:[
        {ref:'NUM 1:7', q:'Named leader of the people of Judah.'},
        {ref:'NUM 7:12', q:'First to present his offering at the tabernacle.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'band'} },

    { id:'salmon', name:'Salmon', gender:'m', meaning:'“garment / shady”', lived:null, bornWhenFather:null,
      spouse:'Rahab', role:'Husband of Rahab', era:'judges',
      blurb:'Married Rahab of Jericho; father of Boaz.',
      gen:['RUT 4:20','RUT 4:21','MAT 1:4','MAT 1:5','1CH 2:11','LUK 3:32'],
      mentions:[ {ref:'MAT 1:5', q:'“Salmon the father of Boaz by Rahab.”'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'turban'} },

    { id:'boaz', name:'Boaz', gender:'m', meaning:'“in him is strength”', lived:null, bornWhenFather:null,
      spouse:'Ruth', origin:'Bethlehem', role:'The kinsman-redeemer', era:'judges',
      blurb:'A worthy man of Bethlehem who redeemed Ruth and Naomi’s family line.',
      gen:['RUT 4:21','MAT 1:5','1CH 2:11','1CH 2:12','LUK 3:32'],
      mentions:[
        {ref:'RUT 2:1', q:'“A worthy man of the clan of Elimelech.”'},
        {ref:'RUT 4:9', q:'Publicly redeemed Naomi’s land and married Ruth.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },

    { id:'obed', name:'Obed', gender:'m', meaning:'“servant / worshipper”', lived:null, bornWhenFather:null,
      origin:'Bethlehem', role:'Grandfather of David', era:'judges',
      blurb:'Son of Boaz and Ruth; the women of Bethlehem rejoiced over his birth.',
      gen:['RUT 4:21','RUT 4:22','MAT 1:5','1CH 2:12','LUK 3:32'],
      mentions:[ {ref:'RUT 4:17', q:'The women named him: “A son has been born to Naomi.”'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'turban'} },

    { id:'jesse', name:'Jesse', gender:'m', meaning:'“gift / the LORD exists”', lived:null, bornWhenFather:null,
      origin:'Bethlehem', role:'Father of David', era:'judges',
      blurb:'A Bethlehemite whose youngest son, David, God chose to be king.',
      gen:['RUT 4:22','MAT 1:5','MAT 1:6','1CH 2:12','1CH 2:13','LUK 3:32'],
      mentions:[
        {ref:'1SA 16:1', q:'God sends Samuel to Jesse to anoint a king.'},
        {ref:'ISA 11:1', q:'“A shoot from the stump of Jesse” — a messianic hope.'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'long', head:'turban'} },

    // Kings of Judah
    { id:'david', name:'David', gender:'m', meaning:'“beloved”', lived:70, bornWhenFather:null,
      spouse:'Michal, Abigail, Bathsheba…', origin:'Bethlehem', role:'King of Israel', era:'kings',
      blurb:'Shepherd, giant-slayer, psalmist and king; “a man after God’s own heart.”',
      gen:['RUT 4:22','MAT 1:6','1CH 2:15','1CH 3:1','LUK 3:31','1SA 16:13'],
      mentions:[
        {ref:'1SA 16:13', q:'Samuel anoints him; the Spirit rushes upon him.'},
        {ref:'1SA 17:50', q:'Strikes down Goliath with a sling and a stone.'},
        {ref:'2SA 7:16', q:'God promises his throne will endure forever.'},
        {ref:'MAT 1:1', q:'Jesus is called “the son of David.”'} ],
      av:{skin:'olive', hair:'auburn', style:'short', beard:'short', head:'crown'} },

    { id:'solomon', name:'Solomon', gender:'m', meaning:'“peace”', lived:null, bornWhenFather:null,
      spouse:'many', origin:'Jerusalem', role:'The wise king', era:'kings',
      blurb:'David’s son by Bathsheba; asked for wisdom and built the temple.',
      gen:['MAT 1:6','MAT 1:7','1CH 3:5','2SA 12:24','1CH 3:10'],
      mentions:[
        {ref:'1KI 3:12', q:'God gives him a wise and discerning heart.'},
        {ref:'1KI 6:1', q:'Begins building the temple of the LORD.'},
        {ref:'MAT 1:6', q:'Born to David “by the wife of Uriah.”'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'crown'} },

    { id:'rehoboam', name:'Rehoboam', gender:'m', meaning:'“he enlarges the people”', lived:null, bornWhenFather:null,
      origin:'Jerusalem', role:'King of Judah', era:'kings',
      blurb:'His harsh answer split the kingdom; the northern tribes broke away.',
      gen:['MAT 1:7','1CH 3:10'],
      mentions:[ {ref:'1KI 12:16', q:'Israel rejects him: “To your tents, O Israel!”'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'crown'} },

    { id:'abijah', name:'Abijah', gender:'m', meaning:'“my father is the LORD”', lived:null, bornWhenFather:null,
      role:'King of Judah', era:'kings',
      blurb:'Reigned in Jerusalem; warred with Jeroboam of the north.',
      gen:['MAT 1:7','1CH 3:10'],
      mentions:[ {ref:'2CH 13:12', q:'Warns Israel not to fight against the LORD.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'crown'} },

    { id:'asa', name:'Asa', gender:'m', meaning:'“healer / physician”', lived:null, bornWhenFather:null,
      role:'Reforming king', era:'kings',
      blurb:'Tore down idols and “did what was good in the eyes of the LORD.”',
      gen:['MAT 1:7','MAT 1:8','1CH 3:10'],
      mentions:[ {ref:'1KI 15:11', q:'Did what was right, like his father David.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'crown'} },

    { id:'jehoshaphat', name:'Jehoshaphat', gender:'m', meaning:'“the LORD judges”', lived:null, bornWhenFather:null,
      role:'King of Judah', era:'kings',
      blurb:'Sent teachers through Judah with the book of the Law; trusted God in battle.',
      gen:['MAT 1:8','1CH 3:10'],
      mentions:[ {ref:'2CH 20:12', q:'“We do not know what to do, but our eyes are on you.”'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'crown'} },

    { id:'joram', name:'Joram (Jehoram)', gender:'m', meaning:'“the LORD is exalted”', lived:null, bornWhenFather:null,
      role:'King of Judah', era:'kings',
      blurb:'Married into Ahab’s house and walked in evil ways.',
      gen:['MAT 1:8','1CH 3:11'],
      mentions:[ {ref:'2KI 8:18', q:'Walked in the ways of the kings of Israel.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'crown'} },

    { id:'uzziah', name:'Uzziah (Azariah)', gender:'m', meaning:'“the LORD is my strength”', lived:null, bornWhenFather:null,
      role:'King of Judah', era:'kings',
      blurb:'Reigned long and prospered, but was struck with leprosy for pride in the temple.',
      gen:['MAT 1:8','MAT 1:9','1CH 3:12'],
      mentions:[
        {ref:'2CH 26:5', q:'As long as he sought the LORD, God made him prosper.'},
        {ref:'ISA 6:1', q:'“In the year that King Uzziah died, I saw the Lord.”'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'crown'} },

    { id:'jotham', name:'Jotham', gender:'m', meaning:'“the LORD is perfect”', lived:null, bornWhenFather:null,
      role:'King of Judah', era:'kings',
      blurb:'“He became mighty, because he ordered his ways before the LORD.”',
      gen:['MAT 1:9','1CH 3:12'],
      mentions:[ {ref:'2CH 27:6', q:'Grew mighty by ordering his ways before God.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'crown'} },

    { id:'ahaz', name:'Ahaz', gender:'m', meaning:'“he has grasped”', lived:null, bornWhenFather:null,
      role:'King of Judah', era:'kings',
      blurb:'A faithless king to whom Isaiah gave the sign of Immanuel.',
      gen:['MAT 1:9','1CH 3:13'],
      mentions:[ {ref:'ISA 7:14', q:'The sign given: “the virgin shall conceive… Immanuel.”'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'crown'} },

    { id:'hezekiah', name:'Hezekiah', gender:'m', meaning:'“the LORD strengthens”', lived:null, bornWhenFather:null,
      role:'Faithful king', era:'kings',
      blurb:'Trusted the LORD like no other king of Judah; God spared Jerusalem in his day.',
      gen:['MAT 1:9','MAT 1:10','1CH 3:13'],
      mentions:[
        {ref:'2KI 18:5', q:'Trusted the LORD like no king before or after in Judah.'},
        {ref:'2KI 19:15', q:'Spread the Assyrian letter before the LORD in prayer.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'crown'} },

    { id:'manasseh', name:'Manasseh', gender:'m', meaning:'“causing to forget”', lived:null, bornWhenFather:null,
      role:'King of Judah', era:'kings',
      blurb:'Reigned longest of all Judah’s kings; deeply wicked, yet humbled and restored.',
      gen:['MAT 1:10','1CH 3:13'],
      mentions:[ {ref:'2CH 33:13', q:'In prison he humbled himself; God brought him back.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'crown'} },

    { id:'amon', name:'Amon', gender:'m', meaning:'“skilled / faithful”', lived:null, bornWhenFather:null,
      role:'King of Judah', era:'kings',
      blurb:'Walked in his father’s early idolatry; killed by his own servants.',
      gen:['MAT 1:10','1CH 3:14'],
      mentions:[ {ref:'2KI 21:20', q:'Did evil, as Manasseh had done.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'crown'} },

    { id:'josiah', name:'Josiah', gender:'m', meaning:'“the LORD supports”', lived:null, bornWhenFather:null,
      role:'The reforming boy-king', era:'kings',
      blurb:'Crowned as a child; rediscovered the Book of the Law and renewed the covenant.',
      gen:['MAT 1:10','MAT 1:11','1CH 3:14'],
      mentions:[
        {ref:'2KI 22:2', q:'Did what was right, turning neither right nor left.'},
        {ref:'2KI 23:25', q:'No king turned to the LORD like him with all his heart.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'crown'} },

    { id:'jeconiah', name:'Jeconiah (Jehoiachin)', gender:'m', meaning:'“the LORD establishes”', lived:null, bornWhenFather:null,
      origin:'Jerusalem → Babylon', role:'King carried into exile', era:'exile',
      blurb:'Carried to Babylon; the genealogy’s hinge “at the deportation.”',
      gen:['MAT 1:11','MAT 1:12','1CH 3:16','1CH 3:17'],
      mentions:[
        {ref:'2KI 24:15', q:'Carried away captive to Babylon.'},
        {ref:'JER 22:30', q:'A hard word — yet the line runs on to Christ.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'crown'} },

    { id:'shealtiel', name:'Shealtiel', gender:'m', meaning:'“I have asked of God”', lived:null, bornWhenFather:null,
      origin:'Babylon', role:'Of the exile', era:'exile',
      blurb:'A son of the exile; father (or, in Chronicles, guardian) of Zerubbabel.',
      gen:['MAT 1:12','1CH 3:17','LUK 3:27'],
      mentions:[ {ref:'HAG 1:1', q:'Named as the father of Zerubbabel the governor.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },

    { id:'zerubbabel', name:'Zerubbabel', gender:'m', meaning:'“sown / seed of Babylon”', lived:null, bornWhenFather:null,
      origin:'Babylon → Jerusalem', role:'Governor who rebuilt the temple', era:'exile',
      blurb:'Led the return from exile and rebuilt the temple’s foundation.',
      gen:['MAT 1:12','MAT 1:13','1CH 3:19','LUK 3:27'],
      mentions:[
        {ref:'EZR 3:8', q:'Began the rebuilding of the house of God.'},
        {ref:'HAG 2:23', q:'“I will make you like a signet ring, for I have chosen you.”'},
        {ref:'ZEC 4:9', q:'“His hands shall complete” the temple.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },

    { id:'abiud', name:'Abiud', gender:'m', meaning:'“my father is majesty”', lived:null, bornWhenFather:null,
      role:'After the exile', era:'exile',
      blurb:'One of the little-known names bridging the return to the birth of Christ.',
      gen:['MAT 1:13'],
      mentions:[ {ref:'MAT 1:13', q:'Listed among the generations after the exile.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'turban'} },

    { id:'eliakim2', name:'Eliakim', gender:'m', meaning:'“God raises up”', lived:null, bornWhenFather:null,
      role:'After the exile', era:'exile',
      blurb:'A quiet link in Matthew’s post-exile line.',
      gen:['MAT 1:13'],
      mentions:[ {ref:'MAT 1:13', q:'Son of Abiud in the genealogy of Jesus.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },

    { id:'azor', name:'Azor', gender:'m', meaning:'“helper”', lived:null, bornWhenFather:null,
      role:'After the exile', era:'exile',
      blurb:'Named only in Matthew’s genealogy of Jesus.',
      gen:['MAT 1:13','MAT 1:14'],
      mentions:[ {ref:'MAT 1:14', q:'Father of Zadok in the line to Christ.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'turban'} },

    { id:'zadok2', name:'Zadok', gender:'m', meaning:'“righteous”', lived:null, bornWhenFather:null,
      role:'After the exile', era:'exile',
      blurb:'Bears the name of David’s faithful priest; here, an ancestor of Joseph.',
      gen:['MAT 1:14'],
      mentions:[ {ref:'MAT 1:14', q:'Listed in the generations toward Joseph.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },

    { id:'achim', name:'Achim', gender:'m', meaning:'“the LORD establishes”', lived:null, bornWhenFather:null,
      role:'After the exile', era:'exile',
      blurb:'One of the final names before Joseph in Matthew’s list.',
      gen:['MAT 1:14'],
      mentions:[ {ref:'MAT 1:14', q:'Father of Eliud in Jesus’ genealogy.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'turban'} },

    { id:'eliud', name:'Eliud', gender:'m', meaning:'“God is my praise”', lived:null, bornWhenFather:null,
      role:'After the exile', era:'exile',
      blurb:'Grandfather of Matthan in the line to Joseph.',
      gen:['MAT 1:14','MAT 1:15'],
      mentions:[ {ref:'MAT 1:15', q:'Father of Eleazar in the genealogy.'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },

    { id:'eleazar2', name:'Eleazar', gender:'m', meaning:'“God has helped”', lived:null, bornWhenFather:null,
      role:'After the exile', era:'exile',
      blurb:'Shares the name of Aaron’s priestly son; here an ancestor of Joseph.',
      gen:['MAT 1:15'],
      mentions:[ {ref:'MAT 1:15', q:'Father of Matthan in the line to Christ.'} ],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'turban'} },

    { id:'matthan', name:'Matthan', gender:'m', meaning:'“gift”', lived:null, bornWhenFather:null,
      role:'Grandfather of Joseph', era:'exile',
      blurb:'Father of Jacob and grandfather of Joseph, Mary’s husband.',
      gen:['MAT 1:15'],
      mentions:[ {ref:'MAT 1:15', q:'Father of Jacob in Jesus’ genealogy.'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'turban'} },

    { id:'jacob2', name:'Jacob', gender:'m', meaning:'“he grasps the heel”', lived:null, bornWhenFather:null,
      role:'Father of Joseph', era:'exile',
      blurb:'Namesake of the patriarch; the father of Joseph in Matthew’s account.',
      gen:['MAT 1:15','MAT 1:16'],
      mentions:[ {ref:'MAT 1:16', q:'“Jacob the father of Joseph the husband of Mary.”'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'long', head:'turban'} },

    { id:'joseph', name:'Joseph', gender:'m', meaning:'“may he add”', lived:null, bornWhenFather:null,
      spouse:'Mary', origin:'Nazareth (of Bethlehem’s line)', role:'Guardian of Jesus', era:'messiah',
      blurb:'A righteous carpenter of David’s line who took Mary as his wife and named the child Jesus.',
      gen:['MAT 1:16','LUK 3:23'],
      mentions:[
        {ref:'MAT 1:19', q:'“A just man,” unwilling to shame Mary.'},
        {ref:'MAT 1:20', q:'An angel: “do not fear to take Mary as your wife.”'},
        {ref:'LUK 2:4', q:'Went up to Bethlehem, “of the house and lineage of David.”'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },

    { id:'jesus', name:'Jesus', gender:'m', meaning:'“the LORD saves”', lived:null, bornWhenFather:null,
      origin:'Bethlehem / Nazareth', role:'The Christ, Son of God', era:'messiah',
      blurb:'The promised Seed in whom every genealogy converges — Son of David, Son of Abraham, Son of God.',
      gen:['MAT 1:16','MAT 1:1','LUK 3:23'],
      mentions:[
        {ref:'MAT 1:16', q:'“…of whom Jesus was born, who is called Christ.”'},
        {ref:'MAT 1:21', q:'“You shall call his name Jesus, for he will save his people.”'},
        {ref:'LUK 2:11', q:'“Born this day… a Savior, who is Christ the Lord.”'},
        {ref:'JOH 1:14', q:'“The Word became flesh and dwelt among us.”'},
        {ref:'REV 22:16', q:'“I am the root and the descendant of David.”'} ],
      av:{skin:'olive', hair:'brown', style:'long', beard:'full', head:'none', halo:'bright'} }
  ];

  /* ---- Branch people (attach to a spine person via branchOf) -------------- */
  var BRANCHES = [
    { id:'eve', name:'Eve', gender:'f', branchOf:'adam', meaning:'“life / living”', spouse:'Adam',
      role:'Mother of all living', era:'creation',
      blurb:'The first woman, taken from Adam’s side; “the mother of all living.”',
      gen:['GEN 3:20','GEN 4:1'],
      mentions:[
        {ref:'GEN 2:22', q:'Made by God from Adam’s rib.'},
        {ref:'GEN 3:20', q:'Named Eve, “because she was the mother of all living.”'} ],
      av:{skin:'tan', hair:'brown', style:'long', beard:'none', head:'veil'} },

    { id:'cain', name:'Cain', gender:'m', branchOf:'adam', meaning:'“acquired”',
      role:'Firstborn of Adam', era:'creation',
      blurb:'Adam’s firstborn, a farmer, who killed his brother Abel.',
      gen:['GEN 4:1'],
      mentions:[ {ref:'GEN 4:8', q:'Killed his brother Abel in the field.'} ],
      av:{skin:'tan', hair:'darkbrown', style:'short', beard:'short', head:'none'} },

    { id:'abel', name:'Abel', gender:'m', branchOf:'adam', meaning:'“breath / vapor”',
      role:'The righteous shepherd', era:'creation',
      blurb:'A keeper of flocks whose offering God accepted; killed by Cain.',
      gen:['GEN 4:2'],
      mentions:[ {ref:'HEB 11:4', q:'By faith he offered a better sacrifice than Cain.'} ],
      av:{skin:'tan', hair:'brown', style:'short', beard:'none', head:'none'} },

    { id:'ham', name:'Ham', gender:'m', branchOf:'noah', meaning:'“hot / warm”',
      role:'Son of Noah', era:'postflood',
      blurb:'A son of Noah; father of Cush, Egypt, Put and Canaan.',
      gen:['GEN 10:6','1CH 1:8'],
      mentions:[ {ref:'GEN 9:22', q:'Saw his father’s nakedness and told his brothers.'} ],
      av:{skin:'brown', hair:'black', style:'short', beard:'full', head:'none'} },

    { id:'japheth', name:'Japheth', gender:'m', branchOf:'noah', meaning:'“may he enlarge”',
      role:'Son of Noah', era:'postflood',
      blurb:'Eldest son of Noah; ancestor of the seafaring coastland peoples.',
      gen:['GEN 10:2','1CH 1:5'],
      mentions:[ {ref:'GEN 9:27', q:'“May God enlarge Japheth.”'} ],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'none'} },

    { id:'nimrod', name:'Nimrod', gender:'m', branchOf:'cush', meaning:'“we shall rebel”',
      role:'The first mighty man', era:'postflood',
      blurb:'A grandson of Ham through Cush; “a mighty hunter before the LORD,” founder of Babel.',
      gen:['GEN 10:8','1CH 1:10'],
      mentions:[ {ref:'GEN 10:10', q:'His kingdom began with Babel in the land of Shinar.'} ],
      av:{skin:'brown', hair:'black', style:'short', beard:'forked', head:'crown'} },

    { id:'sarah', name:'Sarah', gender:'f', branchOf:'abraham', meaning:'“princess”', spouse:'Abraham',
      role:'Mother of the promise', era:'patriarch',
      blurb:'Abraham’s wife, who laughed at the promise yet bore Isaac in her old age.',
      gen:['GEN 11:29','GEN 21:2'],
      mentions:[
        {ref:'GEN 17:15', q:'Renamed from Sarai to Sarah — “princess.”'},
        {ref:'GEN 21:2', q:'Bore Isaac to Abraham in his old age.'},
        {ref:'HEB 11:11', q:'By faith she received power to conceive.'} ],
      av:{skin:'olive', hair:'gray', style:'long', beard:'none', head:'veil'} },

    { id:'ishmael', name:'Ishmael', gender:'m', branchOf:'abraham', meaning:'“God hears”',
      role:'Firstborn of Abraham', era:'patriarch',
      blurb:'Abraham’s son by Hagar; God made him a great nation of twelve princes.',
      gen:['GEN 16:15','GEN 25:12','1CH 1:28'],
      mentions:[ {ref:'GEN 21:18', q:'“I will make him into a nation.”'} ],
      av:{skin:'tan', hair:'black', style:'short', beard:'full', head:'band'} },

    { id:'esau', name:'Esau (Edom)', gender:'m', branchOf:'isaac', meaning:'“hairy”', spouse:'Judith, Basemath…',
      role:'Father of Edom', era:'patriarch',
      blurb:'Isaac’s firstborn twin, who sold his birthright; father of the Edomites.',
      gen:['GEN 25:25','GEN 36:1','1CH 1:34'],
      mentions:[
        {ref:'GEN 25:33', q:'Sold his birthright to Jacob for a meal.'},
        {ref:'GEN 27:38', q:'Wept for the blessing his father had given Jacob.'} ],
      av:{skin:'tan', hair:'auburn', style:'short', beard:'long', head:'none'} },

    { id:'rebekah', name:'Rebekah', gender:'f', branchOf:'isaac', meaning:'“to bind / captivating”', spouse:'Isaac',
      role:'Wife of Isaac', era:'patriarch',
      blurb:'Drew water for Abraham’s servant and his camels; became Isaac’s wife and mother of the twins.',
      gen:['GEN 24:15','GEN 25:21'],
      mentions:[ {ref:'GEN 24:19', q:'“I will draw water for your camels also.”'} ],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },

    // Jacob's other sons (the tribes) — branch off Jacob
    { id:'reuben', name:'Reuben', gender:'m', branchOf:'jacob', meaning:'“behold, a son”',
      role:'Firstborn of Jacob', era:'patriarch', blurb:'Jacob’s firstborn by Leah; lost his birthright.',
      gen:['GEN 29:32','GEN 35:23','1CH 2:1'], mentions:[{ref:'GEN 37:22', q:'Tried to rescue Joseph from the pit.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'band'} },
    { id:'simeon', name:'Simeon', gender:'m', branchOf:'jacob', meaning:'“heard”',
      role:'Son of Jacob', era:'patriarch', blurb:'Second son of Leah; head of the tribe of Simeon.',
      gen:['GEN 29:33','1CH 2:1'], mentions:[{ref:'GEN 42:24', q:'Bound by Joseph in Egypt as surety.'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'band'} },
    { id:'levi', name:'Levi', gender:'m', branchOf:'jacob', meaning:'“joined”',
      role:'Father of the priestly tribe', era:'patriarch',
      blurb:'Third son of Leah; his descendants Moses, Aaron and the priests served the tabernacle.',
      gen:['GEN 29:34','1CH 2:1','EXO 6:16'], mentions:[{ref:'EXO 32:26', q:'The Levites rally to Moses: “Who is on the LORD’s side?”'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'priest'} },
    { id:'dan', name:'Dan', gender:'m', branchOf:'jacob', meaning:'“judge”',
      role:'Son of Jacob', era:'patriarch', blurb:'First son of Bilhah, Rachel’s servant.',
      gen:['GEN 30:6','1CH 2:2'], mentions:[{ref:'GEN 49:16', q:'“Dan shall judge his people.”'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'band'} },
    { id:'naphtali', name:'Naphtali', gender:'m', branchOf:'jacob', meaning:'“my wrestling”',
      role:'Son of Jacob', era:'patriarch', blurb:'Second son of Bilhah; “a doe let loose.”',
      gen:['GEN 30:8','1CH 2:2'], mentions:[{ref:'GEN 49:21', q:'“A doe let loose that bears beautiful fawns.”'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'band'} },
    { id:'gad', name:'Gad', gender:'m', branchOf:'jacob', meaning:'“good fortune / a troop”',
      role:'Son of Jacob', era:'patriarch', blurb:'First son of Zilpah, Leah’s servant.',
      gen:['GEN 30:11','1CH 2:2'], mentions:[{ref:'GEN 49:19', q:'“Raiders shall raid Gad, but he shall raid at their heels.”'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'band'} },
    { id:'asher', name:'Asher', gender:'m', branchOf:'jacob', meaning:'“happy / blessed”',
      role:'Son of Jacob', era:'patriarch', blurb:'Second son of Zilpah; “his food shall be rich.”',
      gen:['GEN 30:13','1CH 2:2'], mentions:[{ref:'GEN 49:20', q:'“Asher’s food shall be rich; he shall yield royal delicacies.”'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'band'} },
    { id:'issachar', name:'Issachar', gender:'m', branchOf:'jacob', meaning:'“reward”',
      role:'Son of Jacob', era:'patriarch', blurb:'Ninth son of Leah; “a strong donkey.”',
      gen:['GEN 30:18','1CH 2:1'], mentions:[{ref:'1CH 12:32', q:'His tribe “had understanding of the times.”'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'band'} },
    { id:'zebulun', name:'Zebulun', gender:'m', branchOf:'jacob', meaning:'“dwelling / honor”',
      role:'Son of Jacob', era:'patriarch', blurb:'Tenth son of Leah; a tribe “at the shore of the sea.”',
      gen:['GEN 30:20','1CH 2:1'], mentions:[{ref:'GEN 49:13', q:'“Zebulun shall dwell at the shore of the sea.”'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'band'} },
    { id:'josephp', name:'Joseph', gender:'m', branchOf:'jacob', meaning:'“may he add”',
      role:'Ruler in Egypt', era:'patriarch',
      blurb:'Rachel’s firstborn, sold into Egypt, who rose to save many lives; father of Ephraim and Manasseh.',
      gen:['GEN 30:24','GEN 46:20'], mentions:[
        {ref:'GEN 45:5', q:'“God sent me before you to preserve life.”'},
        {ref:'GEN 50:20', q:'“You meant evil… but God meant it for good.”'} ],
      av:{skin:'tan', hair:'brown', style:'short', beard:'short', head:'egypt'} },
    { id:'benjamin', name:'Benjamin', gender:'m', branchOf:'jacob', meaning:'“son of the right hand”',
      role:'Youngest son of Jacob', era:'patriarch',
      blurb:'Rachel’s second son, born as she died; the beloved youngest of the twelve.',
      gen:['GEN 35:18','1CH 2:2'], mentions:[{ref:'GEN 42:4', q:'Jacob would not send him to Egypt with his brothers.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'none', head:'band'} },
    { id:'dinah', name:'Dinah', gender:'f', branchOf:'jacob', meaning:'“judgment / vindicated”',
      role:'Daughter of Jacob', era:'patriarch', blurb:'The daughter of Jacob and Leah.',
      gen:['GEN 30:21','GEN 34:1'], mentions:[{ref:'GEN 34:1', q:'Went out to see the women of the land.'}],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },

    // Women of the Messianic line (named in Matthew 1)
    { id:'tamar', name:'Tamar', gender:'f', branchOf:'judah', meaning:'“palm tree”',
      role:'Mother of Perez & Zerah', era:'judges',
      blurb:'Judah’s daughter-in-law, denied her rights, who secured the family line — named in Jesus’ genealogy.',
      gen:['GEN 38:6','MAT 1:3'], mentions:[{ref:'GEN 38:26', q:'Judah: “She is more righteous than I.”'}],
      av:{skin:'tan', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },
    { id:'zerah', name:'Zerah', gender:'m', branchOf:'judah', meaning:'“dawning / scarlet”',
      role:'Twin of Perez', era:'judges',
      blurb:'Judah and Tamar’s other twin, whose hand came out first with a scarlet thread.',
      gen:['GEN 38:30','1CH 2:4'], mentions:[{ref:'GEN 38:28', q:'The midwife tied a scarlet thread on his hand.'}],
      av:{skin:'tan', hair:'brown', style:'short', beard:'short', head:'turban'} },
    { id:'rahab', name:'Rahab', gender:'f', branchOf:'salmon', meaning:'“broad / spacious”', spouse:'Salmon',
      role:'Of Jericho, mother of Boaz', era:'judges',
      blurb:'The woman of Jericho who hid Israel’s spies; grafted into the royal line, named in Matthew 1.',
      gen:['MAT 1:5'], mentions:[
        {ref:'JOS 2:11', q:'“The LORD your God, he is God in the heavens above.”'},
        {ref:'HEB 11:31', q:'By faith she welcomed the spies in peace.'} ],
      av:{skin:'tan', hair:'black', style:'long', beard:'none', head:'veil'} },
    { id:'ruth', name:'Ruth', gender:'f', branchOf:'boaz', meaning:'“friendship”', spouse:'Boaz',
      role:'The faithful Moabite', era:'judges',
      blurb:'A Moabite widow who clung to Naomi and to Naomi’s God; great-grandmother of David.',
      gen:['RUT 4:13','MAT 1:5'], mentions:[
        {ref:'RUT 1:16', q:'“Your people shall be my people, and your God my God.”'},
        {ref:'RUT 4:13', q:'Boaz took Ruth, and she bore Obed.'} ],
      av:{skin:'tan', hair:'brown', style:'long', beard:'none', head:'veil'} },
    { id:'bathsheba', name:'Bathsheba', gender:'f', branchOf:'david', meaning:'“daughter of the oath”', spouse:'David',
      role:'Mother of Solomon', era:'kings',
      blurb:'The “wife of Uriah” in Matthew’s list; mother of Solomon and the royal line.',
      gen:['MAT 1:6','2SA 12:24'], mentions:[{ref:'1KI 1:31', q:'Secured Solomon’s succession before David.'}],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },

    { id:'mary', name:'Mary', gender:'f', branchOf:'joseph', meaning:'“beloved / bitterness”', spouse:'Joseph',
      role:'Mother of Jesus', era:'messiah',
      blurb:'The young woman of Nazareth who bore the Christ; “blessed among women.”',
      gen:['MAT 1:16','LUK 1:27'], mentions:[
        {ref:'LUK 1:38', q:'“Behold, I am the servant of the Lord.”'},
        {ref:'LUK 1:46', q:'“My soul magnifies the Lord.”'} ],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil', halo:'soft'} },

    // Priestly branch off Levi (well-loved figures)
    { id:'kohath', name:'Kohath', gender:'m', branchOf:'levi', meaning:'“assembly”',
      role:'Son of Levi', era:'patriarch', blurb:'Levi’s son; grandfather of Moses and Aaron.',
      gen:['EXO 6:16','1CH 6:1'], mentions:[{ref:'NUM 4:15', q:'His clan carried the holy things of the tabernacle.'}],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'priest'} },
    { id:'amram', name:'Amram', gender:'m', branchOf:'levi', meaning:'“exalted people”', spouse:'Jochebed',
      role:'Father of Moses & Aaron', era:'patriarch', blurb:'Married Jochebed; father of Miriam, Aaron and Moses.',
      gen:['EXO 6:20','1CH 6:3'], mentions:[{ref:'EXO 6:20', q:'Father of Aaron and Moses.'}],
      av:{skin:'olive', hair:'gray', style:'short', beard:'long', head:'priest'} },
    { id:'aaron', name:'Aaron', gender:'m', branchOf:'levi', meaning:'“exalted / mountain”',
      role:'The first high priest', era:'patriarch',
      blurb:'Moses’ brother and spokesman; first high priest of Israel.',
      gen:['EXO 6:20','1CH 6:3'], mentions:[
        {ref:'EXO 4:14', q:'Sent to be Moses’ mouth before Pharaoh.'},
        {ref:'EXO 28:1', q:'Set apart with his sons to serve as priests.'} ],
      av:{skin:'olive', hair:'gray', style:'short', beard:'long', head:'priest'} },
    { id:'moses', name:'Moses', gender:'m', branchOf:'levi', meaning:'“drawn out”',
      role:'Deliverer & lawgiver', era:'patriarch',
      blurb:'Drawn from the Nile, he led Israel out of Egypt and received the Law at Sinai.',
      gen:['EXO 6:20','1CH 6:3'], mentions:[
        {ref:'EXO 3:10', q:'“I will send you to Pharaoh… bring out my people.”'},
        {ref:'DEU 34:10', q:'“No prophet has arisen since… like Moses.”'} ],
      av:{skin:'olive', hair:'gray', style:'long', beard:'long', head:'none'} },

    /* ── Cain’s line (Genesis 4) ── */
    { id:'lamechCain', name:'Lamech', gender:'m', branchOf:'cain', meaning:'“powerful”', era:'creation',
      role:'Of the line of Cain', blurb:'A descendant of Cain who took two wives and boasted of vengeance in the first recorded poem.',
      gen:['GEN 4:18'], mentions:[{ref:'GEN 4:23', q:'“I have killed a man for wounding me…”'}],
      av:{skin:'tan', hair:'darkbrown', style:'short', beard:'full', head:'none'} },
    { id:'jabal', name:'Jabal', gender:'m', branchOf:'cain', meaning:'“stream / wanderer”', era:'creation',
      role:'Father of herdsmen', blurb:'“The father of those who dwell in tents and have livestock.”',
      gen:['GEN 4:20'], mentions:[{ref:'GEN 4:20', q:'The first of the tent-dwelling herdsmen.'}],
      av:{skin:'tan', hair:'brown', style:'short', beard:'short', head:'band'} },
    { id:'jubal', name:'Jubal', gender:'m', branchOf:'cain', meaning:'“sound / trumpet”', era:'creation',
      role:'Father of musicians', blurb:'“The father of all who play the lyre and pipe” — music’s first name.',
      gen:['GEN 4:21'], mentions:[{ref:'GEN 4:21', q:'The first musician recorded in Scripture.'}],
      av:{skin:'tan', hair:'brown', style:'short', beard:'none', head:'none'} },
    { id:'tubalcain', name:'Tubal-cain', gender:'m', branchOf:'cain', meaning:'“smith”', era:'creation',
      role:'Father of metalworkers', blurb:'“Forger of all instruments of bronze and iron” — the first smith.',
      gen:['GEN 4:22'], mentions:[{ref:'GEN 4:22', q:'The first worker of bronze and iron.'}],
      av:{skin:'brown', hair:'black', style:'short', beard:'full', head:'band'} },

    /* ── The Table of Nations (Genesis 10) ── */
    { id:'cush', name:'Cush', gender:'m', branchOf:'ham', meaning:'“black / Ethiopia”', era:'postflood',
      role:'Son of Ham', blurb:'A son of Ham and father of Nimrod; associated with the lands south of Egypt.',
      gen:['GEN 10:6','1CH 1:8'], mentions:[{ref:'GEN 10:8', q:'Father of Nimrod, the first mighty man.'}],
      av:{skin:'deep', hair:'black', style:'short', beard:'full', head:'none'} },
    { id:'mizraim', name:'Mizraim', gender:'m', branchOf:'ham', meaning:'“Egypt”', era:'postflood',
      role:'Son of Ham', blurb:'The son of Ham whose name is the Hebrew word for Egypt.',
      gen:['GEN 10:6','1CH 1:8'], mentions:[{ref:'GEN 10:13', q:'Ancestor of the peoples of Egypt.'}],
      av:{skin:'brown', hair:'black', style:'short', beard:'short', head:'egypt'} },
    { id:'canaan', name:'Canaan', gender:'m', branchOf:'ham', meaning:'“lowland”', era:'postflood',
      role:'Son of Ham', blurb:'Youngest son of Ham; his descendants filled the land Israel would later enter.',
      gen:['GEN 10:6','GEN 9:25'], mentions:[{ref:'GEN 9:25', q:'“Cursed be Canaan; a servant of servants shall he be.”'}],
      av:{skin:'tan', hair:'darkbrown', style:'short', beard:'full', head:'none'} },

    /* ── Terah’s household & Abraham’s wider family ── */
    { id:'haran', name:'Haran', gender:'m', branchOf:'terah', meaning:'“mountaineer”', era:'postflood',
      role:'Brother of Abraham', blurb:'Abraham’s brother who died in Ur; father of Lot, Milcah and Iscah.',
      gen:['GEN 11:27'], mentions:[{ref:'GEN 11:28', q:'Died in Ur of the Chaldeans, in his father’s presence.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },
    { id:'lot', name:'Lot', gender:'m', branchOf:'terah', meaning:'“covering / veil”', era:'patriarch',
      role:'Nephew of Abraham', blurb:'Abraham’s nephew who settled in Sodom and was rescued from its destruction.',
      gen:['GEN 11:27'], mentions:[{ref:'GEN 13:11', q:'Chose the well-watered Jordan valley.'},{ref:'GEN 19:16', q:'Pulled out of Sodom by the angels’ hands.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },
    { id:'nahorBro', name:'Nahor', gender:'m', branchOf:'terah', meaning:'“snorting”', era:'postflood',
      role:'Brother of Abraham', blurb:'Abraham’s brother; grandfather of Rebekah through his son Bethuel.',
      gen:['GEN 11:26','GEN 22:20'], mentions:[{ref:'GEN 22:20', q:'His family line reported to Abraham.'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'turban'} },
    { id:'bethuel', name:'Bethuel', gender:'m', branchOf:'terah', meaning:'“man of God”', era:'patriarch',
      role:'Father of Rebekah', blurb:'Son of Nahor; father of Rebekah and Laban.',
      gen:['GEN 22:23'], mentions:[{ref:'GEN 24:50', q:'Agreed to send Rebekah to Isaac.'}],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'turban'} },
    { id:'hagar', name:'Hagar', gender:'f', branchOf:'abraham', meaning:'“flight”', era:'patriarch',
      role:'Mother of Ishmael', blurb:'Sarah’s Egyptian servant; God met her in the wilderness and heard her son’s cry.',
      gen:['GEN 16:15'], mentions:[{ref:'GEN 16:13', q:'“You are a God of seeing.”'},{ref:'GEN 21:17', q:'God heard the voice of the boy.'}],
      av:{skin:'brown', hair:'black', style:'long', beard:'none', head:'veil'} },
    { id:'keturah', name:'Keturah', gender:'f', branchOf:'abraham', meaning:'“incense”', era:'patriarch',
      role:'Later wife of Abraham', blurb:'Abraham’s wife after Sarah; mother of six sons, including Midian.',
      gen:['GEN 25:1','1CH 1:32'], mentions:[{ref:'GEN 25:2', q:'Bore Zimran, Jokshan, Medan, Midian, Ishbak and Shuah.'}],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },
    { id:'midian', name:'Midian', gender:'m', branchOf:'abraham', meaning:'“strife”', era:'patriarch',
      role:'Son of Keturah', blurb:'Father of the Midianites — among whom Moses later found refuge and a wife.',
      gen:['GEN 25:2','1CH 1:32'], mentions:[{ref:'EXO 2:15', q:'Moses fled to the land of Midian.'}],
      av:{skin:'tan', hair:'black', style:'short', beard:'full', head:'band'} },
    { id:'laban', name:'Laban', gender:'m', branchOf:'jacob', meaning:'“white”', era:'patriarch',
      role:'Uncle & father-in-law of Jacob', blurb:'Rebekah’s brother; Jacob served him fourteen years for Leah and Rachel.',
      gen:['GEN 24:29'], mentions:[{ref:'GEN 29:25', q:'Gave Leah before Rachel by a wedding-night trick.'}],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'turban'} },
    { id:'leah', name:'Leah', gender:'f', branchOf:'jacob', meaning:'“weary / wild cow”', era:'patriarch',
      role:'Wife of Jacob', blurb:'Jacob’s first wife; mother of six tribes, including Judah and Levi.',
      gen:['GEN 29:16'], mentions:[{ref:'GEN 29:35', q:'At Judah’s birth: “This time I will praise the LORD.”'}],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },
    { id:'rachel', name:'Rachel', gender:'f', branchOf:'jacob', meaning:'“ewe”', era:'patriarch',
      role:'Wife of Jacob', blurb:'Jacob’s beloved wife; mother of Joseph and Benjamin, she died near Bethlehem.',
      gen:['GEN 29:16'], mentions:[{ref:'GEN 35:19', q:'Died giving birth to Benjamin on the way to Bethlehem.'}],
      av:{skin:'olive', hair:'brown', style:'long', beard:'none', head:'veil'} },

    /* ── Esau / Edom ── */
    { id:'amalek', name:'Amalek', gender:'m', branchOf:'esau', meaning:'“warlike”', era:'patriarch',
      role:'Grandson of Esau', blurb:'A grandson of Esau; father of the Amalekites, Israel’s persistent foe.',
      gen:['GEN 36:12','1CH 1:36'], mentions:[{ref:'EXO 17:8', q:'Amalek fought Israel at Rephidim.'}],
      av:{skin:'tan', hair:'darkbrown', style:'short', beard:'full', head:'band'} },

    /* ── Judah’s household (Genesis 38) ── */
    { id:'er', name:'Er', gender:'m', branchOf:'judah', meaning:'“watchful”', era:'patriarch',
      role:'Firstborn of Judah', blurb:'Judah’s firstborn, husband of Tamar; wicked in the LORD’s sight.',
      gen:['GEN 38:3','1CH 2:3'], mentions:[{ref:'GEN 38:7', q:'The LORD put him to death.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'turban'} },
    { id:'onan', name:'Onan', gender:'m', branchOf:'judah', meaning:'“strong / vigorous”', era:'patriarch',
      role:'Second son of Judah', blurb:'Refused to raise up offspring for his brother Er; he too died.',
      gen:['GEN 38:4','1CH 2:3'], mentions:[{ref:'GEN 38:9', q:'Refused an heir for his brother.'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'turban'} },
    { id:'shelahJ', name:'Shelah', gender:'m', branchOf:'judah', meaning:'“request”', era:'patriarch',
      role:'Third son of Judah', blurb:'Judah’s youngest by Bath-shua; a clan of Judah descends from him.',
      gen:['GEN 38:5','1CH 2:3'], mentions:[{ref:'GEN 38:26', q:'Withheld from Tamar, prompting her plan.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'turban'} },

    /* ── The priestly line of Levi (continued) ── */
    { id:'miriam', name:'Miriam', gender:'f', branchOf:'levi', meaning:'“beloved / bitterness”', era:'patriarch',
      role:'Prophetess, sister of Moses', blurb:'Watched over baby Moses in the Nile; later led Israel in song at the sea.',
      gen:['NUM 26:59'], mentions:[{ref:'EXO 15:20', q:'Led the women with tambourine and dance.'}],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },
    { id:'nadab', name:'Nadab', gender:'m', branchOf:'levi', meaning:'“generous”', era:'patriarch',
      role:'Son of Aaron', blurb:'Aaron’s eldest son; died offering unauthorized fire before the LORD.',
      gen:['EXO 6:23','1CH 6:3'], mentions:[{ref:'LEV 10:1', q:'Offered strange fire and was consumed.'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'priest'} },
    { id:'abihu', name:'Abihu', gender:'m', branchOf:'levi', meaning:'“he is my father”', era:'patriarch',
      role:'Son of Aaron', blurb:'Aaron’s second son; died with Nadab for offering unauthorized fire.',
      gen:['EXO 6:23','1CH 6:3'], mentions:[{ref:'LEV 10:2', q:'Fire came out and consumed them.'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'priest'} },
    { id:'eleazarP', name:'Eleazar', gender:'m', branchOf:'levi', meaning:'“God has helped”', era:'patriarch',
      role:'High priest after Aaron', blurb:'Aaron’s third son who succeeded him as high priest.',
      gen:['EXO 6:23','1CH 6:3'], mentions:[{ref:'NUM 20:28', q:'Clothed with Aaron’s priestly garments.'}],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'priest'} },
    { id:'ithamar', name:'Ithamar', gender:'m', branchOf:'levi', meaning:'“palm coast”', era:'patriarch',
      role:'Son of Aaron', blurb:'Aaron’s youngest son; oversaw the service of the tabernacle.',
      gen:['EXO 6:23','1CH 6:3'], mentions:[{ref:'EXO 38:21', q:'Directed the record of the tabernacle.'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'priest'} },
    { id:'phinehas', name:'Phinehas', gender:'m', branchOf:'levi', meaning:'“mouth of brass”', era:'patriarch',
      role:'Zealous priest', blurb:'Eleazar’s son; his zeal turned back the plague and won a covenant of peace.',
      gen:['EXO 6:25','1CH 6:4'], mentions:[{ref:'NUM 25:11', q:'His zeal turned away God’s wrath from Israel.'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'priest'} },

    /* ── The house of Elimelech (Ruth) ── */
    { id:'elimelech', name:'Elimelech', gender:'m', branchOf:'boaz', meaning:'“my God is king”', era:'judges',
      role:'Naomi’s husband', blurb:'A man of Bethlehem who moved to Moab in the famine; Boaz redeemed his line.',
      gen:['RUT 1:2'], mentions:[{ref:'RUT 1:3', q:'Died in Moab, leaving Naomi and two sons.'}],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'turban'} },
    { id:'naomi', name:'Naomi', gender:'f', branchOf:'boaz', meaning:'“pleasant”', era:'judges',
      role:'Ruth’s mother-in-law', blurb:'Returned to Bethlehem bereaved, and cradled Ruth’s son Obed as her own.',
      gen:['RUT 1:2'], mentions:[{ref:'RUT 1:20', q:'“Call me Mara, for the Almighty has dealt bitterly.”'},{ref:'RUT 4:16', q:'Took the child Obed to her bosom.'}],
      av:{skin:'olive', hair:'gray', style:'long', beard:'none', head:'veil'} },
    { id:'mahlon', name:'Mahlon', gender:'m', branchOf:'boaz', meaning:'“sickly”', era:'judges',
      role:'Ruth’s first husband', blurb:'Son of Elimelech and Naomi; Ruth’s first husband, who died in Moab.',
      gen:['RUT 4:10','RUT 1:2'], mentions:[{ref:'RUT 4:10', q:'Boaz revived his name over his inheritance.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'turban'} },
    { id:'orpah', name:'Orpah', gender:'f', branchOf:'boaz', meaning:'“neck / gazelle”', era:'judges',
      role:'Naomi’s other daughter-in-law', blurb:'Kissed Naomi goodbye and returned to Moab — the road Ruth refused.',
      gen:['RUT 1:4'], mentions:[{ref:'RUT 1:14', q:'“Orpah kissed her mother-in-law, but Ruth clung to her.”'}],
      av:{skin:'tan', hair:'black', style:'long', beard:'none', head:'veil'} },

    /* ── David’s house (2 Samuel / 1 Chronicles 3) ── */
    { id:'nathanSon', name:'Nathan', gender:'m', branchOf:'david', meaning:'“gift”', era:'kings',
      role:'Son of David', blurb:'A son of David and Bathsheba; Luke traces Jesus’ line to David through Nathan, not Solomon.',
      gen:['2SA 5:14','1CH 3:5','LUK 3:31'], mentions:[{ref:'LUK 3:31', q:'Luke’s genealogy runs through Nathan the son of David.'},{ref:'ZEC 12:12', q:'“The family of the house of Nathan” mourns.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'band'} },
    { id:'absalom', name:'Absalom', gender:'m', branchOf:'david', meaning:'“father of peace”', era:'kings',
      role:'Son of David', blurb:'David’s handsome son who rebelled and seized the throne, then died in an oak.',
      gen:['2SA 3:3','1CH 3:2'], mentions:[{ref:'2SA 18:33', q:'David wept: “O Absalom, my son, my son!”'}],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'short', head:'band'} },
    { id:'adonijah', name:'Adonijah', gender:'m', branchOf:'david', meaning:'“the LORD is my Lord”', era:'kings',
      role:'Son of David', blurb:'David’s son who tried to claim the throne before Solomon was made king.',
      gen:['2SA 3:4','1CH 3:2'], mentions:[{ref:'1KI 1:5', q:'“I will be king,” he declared, exalting himself.'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'short', head:'band'} },
    { id:'tamarD', name:'Tamar', gender:'f', branchOf:'david', meaning:'“palm tree”', era:'kings',
      role:'Daughter of David', blurb:'David’s daughter, sister of Absalom; her wrong set his rebellion in motion.',
      gen:['2SA 13:1','1CH 3:9'], mentions:[{ref:'2SA 13:1', q:'“Absalom… had a beautiful sister, whose name was Tamar.”'}],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },
    { id:'amnon', name:'Amnon', gender:'m', branchOf:'david', meaning:'“faithful”', era:'kings',
      role:'Firstborn of David', blurb:'David’s eldest son, whose crime against Tamar led to his death by Absalom.',
      gen:['2SA 3:2','1CH 3:1'], mentions:[{ref:'2SA 13:28', q:'Killed by Absalom’s servants at a feast.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'band'} },

    /* ── The sons of Japheth (Genesis 10) ── */
    { id:'gomer', name:'Gomer', gender:'m', branchOf:'japheth', meaning:'“complete”', era:'postflood',
      role:'Son of Japheth', blurb:'Eldest son of Japheth; ancestor of peoples to Israel’s far north.',
      gen:['GEN 10:2','1CH 1:5'], mentions:[{ref:'EZK 38:6', q:'Named among the northern nations of Gog.'}],
      av:{skin:'light', hair:'brown', style:'short', beard:'full', head:'none'} },
    { id:'javan', name:'Javan', gender:'m', branchOf:'japheth', meaning:'“Greece / Ionia”', era:'postflood',
      role:'Son of Japheth', blurb:'The son of Japheth whose name is the Hebrew word for the Greeks.',
      gen:['GEN 10:2','1CH 1:5'], mentions:[{ref:'DAN 8:21', q:'“The king of Greece” — the goat of Daniel’s vision.'}],
      av:{skin:'light', hair:'auburn', style:'short', beard:'short', head:'none'} },

    /* ── Ishmael’s sons (Genesis 25) ── */
    { id:'nebaioth', name:'Nebaioth', gender:'m', branchOf:'ishmael', meaning:'“heights”', era:'patriarch',
      role:'Firstborn of Ishmael', blurb:'The eldest of Ishmael’s twelve princes; his flocks are named by Isaiah.',
      gen:['GEN 25:13','1CH 1:29'], mentions:[{ref:'ISA 60:7', q:'“The rams of Nebaioth shall minister to you.”'}],
      av:{skin:'tan', hair:'black', style:'short', beard:'full', head:'band'} },
    { id:'kedar', name:'Kedar', gender:'m', branchOf:'ishmael', meaning:'“dark”', era:'patriarch',
      role:'Son of Ishmael', blurb:'Father of a desert people whose tents the psalmist longed to leave.',
      gen:['GEN 25:13','1CH 1:29'], mentions:[{ref:'PSA 120:5', q:'“Woe to me… that I dwell among the tents of Kedar!”'}],
      av:{skin:'tan', hair:'black', style:'short', beard:'full', head:'band'} },

    /* ── Samuel’s family (1 Samuel 1; 1 Chronicles 6) ── */
    { id:'elkanah', name:'Elkanah', gender:'m', branchOf:'levi', meaning:'“God has created”', era:'judges',
      role:'Father of Samuel', blurb:'A Levite of the hill country of Ephraim; husband of Hannah and Peninnah.',
      gen:['1SA 1:1','1CH 6:27'], mentions:[{ref:'1SA 1:19', q:'Worshipped at Shiloh before the LORD.'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'full', head:'turban'} },
    { id:'hannah', name:'Hannah', gender:'f', branchOf:'levi', meaning:'“grace / favor”', era:'judges',
      role:'Mother of Samuel', blurb:'Prayed for a son and gave him back to the LORD; her song foreshadows Mary’s.',
      gen:['1SA 1:2'], mentions:[{ref:'1SA 1:27', q:'“For this child I prayed.”'},{ref:'1SA 2:1', q:'“My heart exults in the LORD.”'}],
      av:{skin:'olive', hair:'darkbrown', style:'long', beard:'none', head:'veil'} },
    { id:'samuel', name:'Samuel', gender:'m', branchOf:'levi', meaning:'“heard of God”', era:'judges',
      role:'Prophet who anointed kings', blurb:'The last judge and first great prophet; he anointed both Saul and David.',
      gen:['1SA 1:20','1CH 6:28'], mentions:[{ref:'1SA 3:10', q:'“Speak, for your servant hears.”'},{ref:'1SA 16:13', q:'Anointed David in the midst of his brothers.'}],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'none'} },

    /* ── The house of Saul (Benjamin — 1 Samuel; 1 Chronicles 8) ── */
    { id:'kish', name:'Kish', gender:'m', branchOf:'benjamin', meaning:'“bow / snare”', era:'judges',
      role:'Father of Saul', blurb:'A Benjamite of standing whose lost donkeys sent Saul to meet Samuel.',
      gen:['1SA 9:1','1CH 8:33'], mentions:[{ref:'1SA 9:3', q:'His lost donkeys began Saul’s journey to the throne.'}],
      av:{skin:'olive', hair:'gray', style:'short', beard:'full', head:'turban'} },
    { id:'saul', name:'Saul', gender:'m', branchOf:'benjamin', meaning:'“asked for”', era:'judges',
      role:'The first king of Israel', blurb:'Israel’s first king, head and shoulders above the rest; his disobedience cost him the throne.',
      gen:['1SA 9:2','1CH 8:33'], mentions:[{ref:'1SA 10:1', q:'Samuel anointed him leader over Israel.'},{ref:'1SA 15:23', q:'“You have rejected the word of the LORD.”'}],
      av:{skin:'olive', hair:'darkbrown', style:'short', beard:'full', head:'crown'} },
    { id:'jonathan', name:'Jonathan', gender:'m', branchOf:'benjamin', meaning:'“the LORD has given”', era:'judges',
      role:'Son of Saul, friend of David', blurb:'Saul’s valiant son whose covenant love for David outran his own claim to the throne.',
      gen:['1SA 14:49','1CH 8:33'], mentions:[{ref:'1SA 18:3', q:'Made a covenant with David, loving him as himself.'},{ref:'1SA 14:6', q:'“Nothing can hinder the LORD from saving.”'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'band'} },
    { id:'mephibosheth', name:'Mephibosheth', gender:'m', branchOf:'benjamin', meaning:'“dispeller of shame”', era:'judges',
      role:'Grandson of Saul', blurb:'Jonathan’s lame son whom David sought out and seated at his own table for Jonathan’s sake.',
      gen:['2SA 4:4','1CH 8:34'], mentions:[{ref:'2SA 9:7', q:'“You shall eat at my table always.”'}],
      av:{skin:'olive', hair:'brown', style:'short', beard:'short', head:'none'} }
  ];

  /* ---- Assemble: index, link fathers along the spine ---------------------- */
  var PEOPLE = SPINE.concat(BRANCHES);
  var BY_ID = {};
  PEOPLE.forEach(function (p) { BY_ID[p.id] = p; });
  for (var i = 0; i < SPINE.length; i++) {
    SPINE[i].spineIndex = i;
    SPINE[i].isSpine = true;
    SPINE[i].father = i > 0 ? SPINE[i - 1].id : null;
    SPINE[i].heir = i < SPINE.length - 1 ? SPINE[i + 1].id : null;
  }
  // group branches under their immediate parent (spine OR another branch)
  var BRANCHES_BY_PARENT = {};
  BRANCHES.forEach(function (b) {
    (BRANCHES_BY_PARENT[b.branchOf] = BRANCHES_BY_PARENT[b.branchOf] || []).push(b);
  });

  // The section label each relative is filed under in the tree. Lets clusters
  // (the twelve tribes, the priestly line, the house of Saul…) read as their
  // own tidy groups instead of one long "also in the family" pile.
  var BRANCH_GROUP = {
    // Adam & Cain
    eve: 'The first family', cain: 'The first family', abel: 'The first family',
    lamechCain: 'Cain’s line', jabal: 'Cain’s line', jubal: 'Cain’s line', tubalcain: 'Cain’s line',
    // Noah & the nations
    ham: 'Noah’s sons', japheth: 'Noah’s sons',
    cush: 'The sons of Ham', mizraim: 'The sons of Ham', canaan: 'The sons of Ham', nimrod: 'The sons of Ham',
    gomer: 'The sons of Japheth', javan: 'The sons of Japheth',
    // Terah
    haran: 'Terah’s household', lot: 'Terah’s household', nahorBro: 'Terah’s household', bethuel: 'Terah’s household',
    // Abraham & Ishmael
    sarah: 'Abraham’s family', hagar: 'Abraham’s family', keturah: 'Abraham’s family', ishmael: 'Abraham’s family', midian: 'Abraham’s family',
    nebaioth: 'Ishmael’s sons', kedar: 'Ishmael’s sons',
    // Isaac
    esau: 'Isaac’s household', rebekah: 'Isaac’s household',
    // Jacob
    reuben: 'The twelve tribes', simeon: 'The twelve tribes', levi: 'The twelve tribes', dan: 'The twelve tribes',
    naphtali: 'The twelve tribes', gad: 'The twelve tribes', asher: 'The twelve tribes', issachar: 'The twelve tribes',
    zebulun: 'The twelve tribes', josephp: 'The twelve tribes', benjamin: 'The twelve tribes', dinah: 'The twelve tribes',
    leah: 'Jacob’s household', rachel: 'Jacob’s household', laban: 'Jacob’s household',
    kish: 'The house of Saul', saul: 'The house of Saul', jonathan: 'The house of Saul', mephibosheth: 'The house of Saul',
    // Judah
    er: 'Judah’s children', onan: 'Judah’s children', shelahJ: 'Judah’s children', tamar: 'Judah’s children', zerah: 'Judah’s children',
    // Levi & Samuel
    kohath: 'The priestly line', amram: 'The priestly line', aaron: 'The priestly line', moses: 'The priestly line',
    miriam: 'The priestly line', nadab: 'The priestly line', abihu: 'The priestly line', eleazarP: 'The priestly line',
    ithamar: 'The priestly line', phinehas: 'The priestly line',
    elkanah: 'Samuel’s family', hannah: 'Samuel’s family', samuel: 'Samuel’s family',
    // Ruth
    rahab: 'Salmon & Rahab',
    elimelech: 'The house of Elimelech', naomi: 'The house of Elimelech', mahlon: 'The house of Elimelech',
    orpah: 'The house of Elimelech', ruth: 'The house of Elimelech',
    // David
    bathsheba: 'The house of David', nathanSon: 'The house of David', absalom: 'The house of David',
    adonijah: 'The house of David', tamarD: 'The house of David', amnon: 'The house of David'
  };

  // Every relative that descends from a spine person (any depth), so a spine
  // node can show all their branches — the twelve tribes, the priestly line
  // through Levi, the house of Saul through Benjamin, and so on.
  function descendantBranches(spineId) {
    var out = [];
    (function walk(id) {
      (BRANCHES_BY_PARENT[id] || []).forEach(function (b) { out.push(b); walk(b.id); });
    })(spineId);
    return out;
  }

  /* ---- Anchor index: verse-key -> [personId] ------------------------------ */
  var ANCHORS = {};
  PEOPLE.forEach(function (p) {
    (p.gen || []).forEach(function (ref) {
      (ANCHORS[ref] = ANCHORS[ref] || []).push(p.id);
    });
  });

  function personsForVerse(book, chapter, verse) {
    var key = book + ' ' + chapter + ':' + verse;
    var ids = ANCHORS[key];
    if (!ids) return [];
    // de-dup, preserve order, spine people first
    var seen = {}, out = [];
    ids.forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(BY_ID[id]); } });
    out.sort(function (a, b) { return (a.isSpine ? 0 : 1) - (b.isSpine ? 0 : 1); });
    return out;
  }

  /* ========================================================================
   * AVATAR ENGINE — deterministic cartoon SVG, unique per person.
   * Attributes carry the identity; a tiny name-hash adds gentle variety
   * (smile curve, eye spacing) so no two faces feel stamped.
   * ======================================================================*/
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }

  function avatarSvg(p, opts) {
    opts = opts || {};
    var a = p.av || {};
    var h = hashStr(p.id);
    var era = ERAS[p.era] || ERAS.creation;
    var skin = SKIN[a.skin] || SKIN.olive;
    var skinShade = shade(skin, -18);
    var hair = hairHex(a.hair);
    var isF = p.gender === 'f';
    // gentle per-person variety
    var eyeGap = 20 + (h % 3);              // 20..22
    var smile = 5 + ((h >> 3) % 5);         // 5..9 (mouth curve)
    var browY = 44 - ((h >> 5) % 2);
    var uid = 'g' + h.toString(36);
    var acc = era.accent;

    // garment / shoulders colour keyed to era, a touch darker for depth
    var robe = shade(acc, isF ? 8 : -4);
    var robe2 = shade(acc, -26);

    var parts = [];
    parts.push('<defs>' +
      '<radialGradient id="' + uid + 'bg" cx="50%" cy="38%" r="72%">' +
        '<stop offset="0%" stop-color="' + shade(era.soft, 6) + '"/>' +
        '<stop offset="100%" stop-color="' + shade(acc, 30) + '"/>' +
      '</radialGradient>' +
      '<linearGradient id="' + uid + 'robe" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + robe + '"/>' +
        '<stop offset="100%" stop-color="' + robe2 + '"/>' +
      '</linearGradient>' +
      '<clipPath id="' + uid + 'clip"><circle cx="60" cy="60" r="58"/></clipPath>' +
    '</defs>');

    parts.push('<g clip-path="url(#' + uid + 'clip)">');
    parts.push('<circle cx="60" cy="60" r="60" fill="url(#' + uid + 'bg)"/>');

    // halo (behind head) for Enoch / Mary / Jesus
    if (a.halo === 'bright') parts.push('<circle cx="60" cy="52" r="34" fill="none" stroke="#fff3bf" stroke-width="6" opacity="0.9"/><circle cx="60" cy="52" r="40" fill="none" stroke="#ffe27a" stroke-width="3" opacity="0.7"/>');
    else if (a.halo === 'soft') parts.push('<circle cx="60" cy="52" r="36" fill="#ffffff" opacity="0.28"/>');

    // shoulders / robe
    parts.push('<path d="M18 120 Q22 86 44 80 L76 80 Q98 86 102 120 Z" fill="url(#' + uid + 'robe)"/>');
    parts.push('<path d="M60 80 L52 96 L60 104 L68 96 Z" fill="' + shade(robe, 12) + '" opacity="0.9"/>'); // collar V

    // long hair behind shoulders
    if (a.style === 'long') parts.push('<path d="M34 58 Q30 96 40 108 L44 82 Q40 66 44 54 Z M86 58 Q90 96 80 108 L76 82 Q80 66 76 54 Z" fill="' + hair + '"/>');

    // ears
    parts.push('<circle cx="37" cy="60" r="6" fill="' + skinShade + '"/><circle cx="83" cy="60" r="6" fill="' + skinShade + '"/>');

    // face
    parts.push('<path d="M40 44 Q40 28 60 28 Q80 28 80 44 L80 60 Q80 82 60 84 Q40 82 40 60 Z" fill="' + skin + '"/>');
    // subtle cheek shading
    parts.push('<path d="M40 60 Q40 82 60 84 Q52 80 48 62 Z" fill="' + skinShade + '" opacity="0.35"/>');

    // hair top (unless fully covered by crown/priest headwear that sits on hairline anyway)
    var covered = a.head === 'egypt';
    if (!covered) {
      if (a.style === 'bald') {
        // fringe only
        parts.push('<path d="M40 46 Q42 40 48 42 M80 46 Q78 40 72 42" fill="none" stroke="' + hair + '" stroke-width="3"/>');
      } else if (a.style === 'receding') {
        parts.push('<path d="M40 46 Q44 34 60 34 Q60 42 50 44 Q44 44 40 50 Z M80 46 Q76 34 60 34" fill="' + hair + '"/>');
      } else {
        // full top
        parts.push('<path d="M38 50 Q36 26 60 26 Q84 26 82 50 Q78 40 68 39 Q60 33 52 39 Q42 40 38 50 Z" fill="' + hair + '"/>');
        if (a.style === 'long' || isF) parts.push('<path d="M38 48 Q34 62 38 72 L44 60 Q42 52 44 48 Z M82 48 Q86 62 82 72 L76 60 Q78 52 76 48 Z" fill="' + hair + '"/>');
      }
    }

    // eyebrows
    parts.push('<path d="M' + (60 - eyeGap - 4) + ' ' + browY + ' q6 -4 12 0" fill="none" stroke="' + shade(hair, -6) + '" stroke-width="2.4" stroke-linecap="round"/>');
    parts.push('<path d="M' + (60 + eyeGap - 8) + ' ' + browY + ' q6 -4 12 0" fill="none" stroke="' + shade(hair, -6) + '" stroke-width="2.4" stroke-linecap="round"/>');

    // eyes
    var eyeY = 52;
    parts.push('<ellipse cx="' + (60 - eyeGap / 2) + '" cy="' + eyeY + '" rx="4.4" ry="5" fill="#fff"/>');
    parts.push('<ellipse cx="' + (60 + eyeGap / 2) + '" cy="' + eyeY + '" rx="4.4" ry="5" fill="#fff"/>');
    parts.push('<circle cx="' + (60 - eyeGap / 2) + '" cy="' + (eyeY + 1) + '" r="2.3" fill="#2a2320"/>');
    parts.push('<circle cx="' + (60 + eyeGap / 2) + '" cy="' + (eyeY + 1) + '" r="2.3" fill="#2a2320"/>');

    // nose
    parts.push('<path d="M60 55 q-3 6 -1 8 q1 1 3 0" fill="none" stroke="' + skinShade + '" stroke-width="2" stroke-linecap="round"/>');

    // mouth (friendly)
    parts.push('<path d="M' + (60 - 8) + ' ' + (68) + ' q8 ' + smile + ' 16 0" fill="none" stroke="#a34a3a" stroke-width="2.4" stroke-linecap="round"/>');

    // beard styles (drawn over lower face)
    if (a.beard && a.beard !== 'none') {
      if (a.beard === 'stubble') {
        parts.push('<path d="M42 64 Q44 80 60 84 Q76 80 78 64 Q70 74 60 74 Q50 74 42 64 Z" fill="' + hair + '" opacity="0.3"/>');
      } else if (a.beard === 'short') {
        parts.push('<path d="M43 62 Q44 82 60 86 Q76 82 77 62 Q72 74 60 76 Q48 74 43 62 Z" fill="' + hair + '"/>');
        // mouth over beard
        parts.push('<path d="M52 70 q8 4 16 0" fill="none" stroke="#7d3a2e" stroke-width="2" stroke-linecap="round"/>');
      } else if (a.beard === 'forked') {
        parts.push('<path d="M44 62 Q46 84 56 90 L60 80 L64 90 Q74 84 76 62 Q70 76 60 76 Q50 76 44 62 Z" fill="' + hair + '"/>');
      } else { // full / long
        var chin = a.beard === 'long' ? 100 : 92;
        parts.push('<path d="M42 60 Q42 86 60 ' + chin + ' Q78 86 78 60 Q72 78 60 80 Q48 78 42 60 Z" fill="' + hair + '"/>');
        // moustache
        parts.push('<path d="M50 66 Q60 72 70 66 Q60 70 50 66 Z" fill="' + shade(hair, -8) + '"/>');
      }
    }

    // headwear (on top, drawn last)
    parts.push(headwear(a.head, uid, acc, skin));

    parts.push('</g>');
    // ring
    parts.push('<circle cx="60" cy="60" r="58.5" fill="none" stroke="' + shade(acc, -14) + '" stroke-width="3" opacity="0.85"/>');

    var size = opts.size || 120;
    return '<svg viewBox="0 0 120 120" width="' + size + '" height="' + size + '" role="img" aria-label="' +
      esc(p.name) + '" xmlns="http://www.w3.org/2000/svg">' + parts.join('') + '</svg>';
  }

  function headwear(kind, uid, acc, skin) {
    switch (kind) {
      case 'crown':
        return '<path d="M40 34 L46 22 L52 32 L60 20 L68 32 L74 22 L80 34 Q60 40 40 34 Z" fill="#f6c945" stroke="#c99312" stroke-width="1.6" stroke-linejoin="round"/>' +
               '<circle cx="60" cy="24" r="2.4" fill="#e5484d"/><circle cx="47" cy="26" r="1.8" fill="#3b82f6"/><circle cx="73" cy="26" r="1.8" fill="#3b82f6"/>' +
               '<rect x="40" y="33" width="40" height="5" rx="2" fill="#eab308"/>';
      case 'turban':
        return '<path d="M36 44 Q34 24 60 22 Q86 24 84 44 Q84 34 60 33 Q36 34 36 44 Z" fill="' + shade(acc, 18) + '" stroke="' + shade(acc, -10) + '" stroke-width="1.4"/>' +
               '<path d="M38 42 Q60 30 82 42" fill="none" stroke="' + shade(acc, -6) + '" stroke-width="2.2"/>' +
               '<path d="M40 38 Q60 28 80 38" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.5"/>';
      case 'band':
        return '<path d="M37 42 Q60 34 83 42 L83 47 Q60 40 37 47 Z" fill="' + shade(acc, -6) + '"/>' +
               '<path d="M83 44 l10 6 -3 -8 z" fill="' + shade(acc, -18) + '"/>';
      case 'veil':
        return '<path d="M32 56 Q30 22 60 20 Q90 22 88 56 Q88 34 60 32 Q32 34 32 56 Z" fill="' + shade(acc, 22) + '" stroke="' + shade(acc, -6) + '" stroke-width="1.4"/>' +
               '<path d="M32 56 Q34 92 44 108 L48 82 Q40 66 40 52 Z M88 56 Q86 92 76 108 L72 82 Q80 66 80 52 Z" fill="' + shade(acc, 16) + '"/>';
      case 'priest':
        return '<path d="M40 40 Q40 22 60 22 Q80 22 80 40 Q60 32 40 40 Z" fill="#f5f2e8" stroke="#cbb98a" stroke-width="1.4"/>' +
               '<rect x="50" y="24" width="20" height="8" rx="2" fill="#3b6bd6"/>' +
               '<circle cx="55" cy="28" r="1.5" fill="#e5c34d"/><circle cx="60" cy="28" r="1.5" fill="#4caf50"/><circle cx="65" cy="28" r="1.5" fill="#e5484d"/>';
      case 'egypt':
        return '<path d="M34 40 Q34 20 60 20 Q86 20 86 40 L86 62 Q80 58 78 48 Q60 42 42 48 Q40 58 34 62 Z" fill="#2c4a8a"/>' +
               '<path d="M34 40 Q34 20 60 20 Q86 20 86 40" fill="none" stroke="#e5c34d" stroke-width="3"/>' +
               '<path d="M52 20 Q60 12 68 20 Q60 16 52 20 Z" fill="#e5c34d"/><circle cx="60" cy="18" r="2.4" fill="#e5484d"/>';
      default:
        return '';
    }
  }

  // lighten(+)/darken(-) a hex colour by percent
  function shade(hex, pct) {
    hex = (hex || '#888').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
    var t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
    r = Math.round((t - r) * p) + r; g = Math.round((t - g) * p) + g; b = Math.round((t - b) * p) + b;
    return '#' + [r, g, b].map(function (x) { return ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2); }).join('');
  }

  // expose so the reader can render a tiny icon-sized face if it wants
  window.__genAvatar = avatarSvg;

  /* ========================================================================
   * STYLES — injected once. Self-contained; adapts to light/dark.
   * ======================================================================*/
  function injectStyles() {
    if (document.getElementById('bibleGenealogyStyles')) return;
    // Everything is driven by the app's own theme tokens (--card-color,
    // --font-color, --secondary/accent, color-mix on --font-color) exactly like
    // the reader's other overlays — so the map follows whatever theme the user
    // picked (light, dark, or any of the colour themes). The per-era accent
    // colours stay only as identity highlights (the dot, the card's tint, the
    // hero header), washed INTO the theme's card colour so text stays readable
    // on light and dark themes alike.
    var css = ''
+ '.rgen-overlay{position:fixed;inset:0;z-index:4200;display:flex;flex-direction:column;'
+ 'background:linear-gradient(180deg,var(--primary-color,#f6ede0),var(--primary-light,#fdf6e9));'
+ 'opacity:0;transition:opacity .28s ease;overflow:hidden;color:var(--font-color,#2c2519);}'
+ '.rgen-overlay.open{opacity:1;}'
+ '.rgen-topbar{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:14px 16px 10px 16px;'
+ 'padding-top:calc(14px + env(safe-area-inset-top,0));position:relative;z-index:3;'
+ 'border-bottom:1px solid color-mix(in srgb,var(--font-color) 8%,transparent);}'
+ '.rgen-title{font-family:"Patrick Hand",system-ui,cursive;font-size:1.55rem;line-height:1;margin:0;letter-spacing:.3px;color:var(--secondary-color,inherit);}'
+ '.rgen-sub{font-size:.72rem;color:var(--muted-color,inherit);opacity:.9;margin-top:2px;font-family:system-ui,sans-serif;}'
+ '.rgen-x{margin-left:auto;width:40px;height:40px;border:none;border-radius:50%;cursor:pointer;'
+ 'background:color-mix(in srgb,var(--font-color) 8%,transparent);color:inherit;display:grid;place-items:center;flex:0 0 auto;}'
+ '.rgen-x:hover{background:color-mix(in srgb,var(--font-color) 16%,transparent);}'
+ '.rgen-scroll{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:6px 16px 60px;position:relative;z-index:2;}'
+ '.rgen-tree{max-width:640px;margin:0 auto;position:relative;padding-top:6px;}'
// ── sub-bar: search + era jump-nav ──
+ '.rgen-subbar{flex:0 0 auto;position:relative;z-index:3;padding:0 16px 8px;border-bottom:1px solid color-mix(in srgb,var(--font-color) 8%,transparent);}'
+ '.rgen-search{position:relative;max-width:620px;margin:0 auto 8px;display:flex;align-items:center;gap:8px;'
+ 'background:color-mix(in srgb,var(--font-color) 6%,transparent);border-radius:14px;padding:0 10px;height:42px;}'
+ '.rgen-search-ico{font-size:20px;opacity:.6;flex:0 0 auto;}'
+ '.rgen-search input{flex:1 1 auto;min-width:0;border:none;background:transparent;color:var(--font-color,inherit);font-size:.95rem;font-family:system-ui,sans-serif;outline:none;height:100%;}'
+ '.rgen-search input::placeholder{color:var(--muted-color,inherit);opacity:.8;}'
+ '.rgen-search-clear{display:none;flex:0 0 auto;width:26px;height:26px;border:none;border-radius:50%;cursor:pointer;background:color-mix(in srgb,var(--font-color) 12%,transparent);color:inherit;place-items:center;}'
+ '.rgen-search-clear.show{display:grid;}'
+ '.rgen-search-clear .material-symbols-outlined{font-size:16px;}'
+ '.rgen-search-results{position:absolute;left:0;right:0;top:48px;z-index:20;max-height:60vh;overflow-y:auto;'
+ 'background:var(--card-solid-color,#fff);border:1px solid color-mix(in srgb,var(--font-color) 12%,transparent);border-radius:16px;'
+ 'box-shadow:0 18px 44px rgba(0,0,0,.3);padding:6px;display:none;}'
+ '.rgen-search-results.show{display:block;}'
+ '.rgen-search-row{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;background:transparent;cursor:pointer;'
+ 'color:var(--font-color,inherit);padding:7px 8px;border-radius:11px;}'
+ '.rgen-search-row:hover{background:color-mix(in srgb,var(--font-color) 8%,transparent);}'
+ '.rgen-search-row .mini{width:30px;height:30px;border-radius:50%;overflow:hidden;flex:0 0 auto;}'
+ '.rgen-search-row .mini svg{width:100%;height:100%;display:block;}'
+ '.rgen-search-name{flex:1 1 auto;min-width:0;font-weight:700;font-size:.9rem;display:flex;flex-direction:column;line-height:1.1;}'
+ '.rgen-search-name small{font-weight:600;font-size:.68rem;color:var(--muted-color,inherit);margin-top:2px;}'
+ '.rgen-search-go{font-size:16px;opacity:.4;flex:0 0 auto;}'
+ '.rgen-search-empty{padding:14px;text-align:center;color:var(--muted-color,inherit);font-size:.85rem;}'
+ '.rgen-nav{display:flex;gap:7px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;max-width:620px;margin:0 auto;padding-bottom:2px;}'
+ '.rgen-nav::-webkit-scrollbar{display:none;}'
+ '.rgen-nav-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;cursor:pointer;font-size:.78rem;font-weight:700;'
+ 'background:color-mix(in srgb,var(--font-color) 6%,transparent);border:1.5px solid transparent;color:var(--font-color,inherit);white-space:nowrap;transition:background .16s ease,border-color .16s ease;}'
+ '.rgen-nav-chip .dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}'
+ '.rgen-nav-chip .n{font-size:.66rem;opacity:.6;font-weight:800;}'
+ '.rgen-nav-chip.active{background:color-mix(in srgb,var(--rgen-accent,#888) 16%,transparent);border-color:color-mix(in srgb,var(--rgen-accent,#888) 55%,transparent);}'
// ── collapsible era sections ──
+ '.rgen-era-group{margin:14px 0 6px;}'
+ '.rgen-era-head{width:100%;display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;'
+ 'background:color-mix(in srgb,var(--rgen-accent,#888) 8%,var(--card-solid-color,#fff));border:1.5px solid color-mix(in srgb,var(--rgen-accent,#888) 30%,transparent);'
+ 'border-radius:16px;padding:11px 14px;color:var(--font-color,inherit);font-family:"Patrick Hand",cursive;font-size:1.15rem;position:sticky;top:0;z-index:5;}'
+ '.rgen-era-head .dot{width:13px;height:13px;border-radius:50%;flex:0 0 auto;box-shadow:0 1px 4px rgba(0,0,0,.25);}'
+ '.rgen-era-title{flex:1 1 auto;}'
+ '.rgen-era-count{font-family:system-ui,sans-serif;font-size:.7rem;font-weight:800;color:#fff;background:var(--rgen-accent,#888);padding:2px 9px;border-radius:999px;}'
+ '.rgen-era-chev{transition:transform .2s ease;opacity:.7;}'
+ '.rgen-era-group.rgen-collapsed .rgen-era-chev{transform:rotate(-90deg);}'
+ '.rgen-era-body{padding-top:10px;}'
+ '.rgen-era-group.rgen-collapsed .rgen-era-body{display:none;}'
+ '.rgen-era{display:flex;align-items:center;gap:8px;margin:26px 0 10px;font-family:"Patrick Hand",cursive;font-size:1.05rem;}'
+ '.rgen-era:first-child{margin-top:6px;}'
+ '.rgen-era .dot{width:12px;height:12px;border-radius:50%;flex:0 0 auto;box-shadow:0 1px 4px rgba(0,0,0,.25);}'
+ '.rgen-era .ln{flex:1 1 auto;height:2px;border-radius:2px;opacity:.45;}'
+ '.rgen-node{position:relative;display:flex;justify-content:center;}'
+ '.rgen-connector{display:block;width:4px;height:26px;margin:0 auto;border-radius:4px;background:color-mix(in srgb,var(--font-color) 22%,transparent);}'
+ '.rgen-connector.branchy{position:relative;}'
+ '.rgen-card{position:relative;width:100%;max-width:440px;display:flex;gap:14px;align-items:center;padding:12px 14px;border-radius:20px;'
+ 'background:color-mix(in srgb,var(--rgen-accent,#888) 9%,var(--card-solid-color,#fff));color:var(--font-color,inherit);'
+ 'box-shadow:0 6px 18px rgba(0,0,0,.14);'
+ 'border:2px solid color-mix(in srgb,var(--rgen-accent,#ddd) 60%,transparent);cursor:pointer;transition:transform .16s ease,box-shadow .16s ease;text-align:left;}'
+ '.rgen-card:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(0,0,0,.22);}'
+ '.rgen-card:active{transform:scale(.99);}'
+ '.rgen-card.spine{max-width:460px;}'
// The avatar IS the tap target: an accent ring makes it read as a button and a
// small "TAP" cue sits inside the circle (clipped by overflow, so it can never
// half-spill the way a corner badge did).
+ '.rgen-ava{flex:0 0 auto;width:78px;height:78px;border-radius:50%;overflow:hidden;position:relative;background:color-mix(in srgb,var(--font-color) 10%,transparent);'
+ 'box-shadow:0 0 0 3px color-mix(in srgb,var(--rgen-accent,#888) 70%,transparent),0 4px 12px rgba(0,0,0,.18);transition:box-shadow .16s ease,transform .16s ease;}'
+ '.rgen-ava svg{display:block;width:100%;height:100%;}'
+ '.rgen-ava-cue{position:absolute;left:0;right:0;bottom:0;height:34%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px;'
+ 'font-family:system-ui,sans-serif;font-size:.56rem;font-weight:800;letter-spacing:.14em;color:#fff;'
+ 'background:linear-gradient(to top,rgba(0,0,0,.6),rgba(0,0,0,0));text-shadow:0 1px 2px rgba(0,0,0,.5);pointer-events:none;transition:opacity .16s ease;}'
+ '.rgen-card:hover .rgen-ava{box-shadow:0 0 0 3px var(--rgen-accent,#888),0 6px 16px rgba(0,0,0,.28);transform:scale(1.04);}'
+ '.rgen-card:active .rgen-ava{transform:scale(.97);}'
+ '.rgen-card-go{flex:0 0 auto;align-self:center;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;'
+ 'color:var(--rgen-accent,#888);opacity:.5;}'
+ '.rgen-card-go .material-symbols-outlined{font-size:22px;}'
+ '.rgen-meta{flex:1 1 auto;min-width:0;}'
+ '.rgen-name{font-family:"Patrick Hand",cursive;font-size:1.32rem;line-height:1.05;margin:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;color:var(--font-color,inherit);}'
+ '.rgen-name .role{font-family:system-ui,sans-serif;font-size:.66rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;'
+ 'color:#fff;background:var(--rgen-accent,#555);padding:2px 7px;border-radius:999px;}'
+ '.rgen-facts{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.78rem;color:var(--muted-color,inherit);}'
+ '.rgen-facts li{display:flex;align-items:center;gap:4px;}'
+ '.rgen-facts .material-symbols-outlined{font-size:15px;opacity:.7;}'
+ '.rgen-blurb{margin:7px 0 0;font-size:.82rem;line-height:1.34;opacity:.86;}'
+ '.rgen-branches{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:460px;margin:10px auto 0;}'
+ '.rgen-branch-chip{display:flex;align-items:center;gap:7px;padding:5px 12px 5px 5px;border-radius:999px;cursor:pointer;'
+ 'background:color-mix(in srgb,var(--rgen-accent,#888) 8%,var(--card-solid-color,#fff));border:1.5px dashed color-mix(in srgb,var(--rgen-accent,#ccc) 55%,transparent);font-size:.8rem;font-weight:600;color:var(--font-color,inherit);}'
+ '.rgen-branch-chip:hover{background:color-mix(in srgb,var(--rgen-accent,#888) 16%,var(--card-solid-color,#fff));}'
+ '.rgen-branch-chip .mini{width:30px;height:30px;border-radius:50%;overflow:hidden;flex:0 0 auto;}'
+ '.rgen-branch-chip .mini svg{width:100%;height:100%;display:block;}'
+ '.rgen-branch-chip.has-line{border-style:solid;}'
+ '.rgen-chip-more{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;margin-left:-1px;'
+ 'background:color-mix(in srgb,var(--rgen-accent,#888) 20%,transparent);color:var(--rgen-accent,#888);}'
+ '.rgen-chip-more .material-symbols-outlined{font-size:13px;}'
+ '.rgen-branch-label{display:flex;align-items:center;gap:4px;justify-content:center;margin:12px auto 2px;font-size:.72rem;color:var(--muted-color,inherit);opacity:.85;'
+ 'text-transform:uppercase;letter-spacing:.6px;font-weight:600;}'
+ '.rgen-highlight .rgen-card{animation:rgenPulse 1.6s ease 2;}'
+ '@keyframes rgenPulse{0%,100%{box-shadow:0 6px 18px rgba(0,0,0,.14);}50%{box-shadow:0 0 0 5px var(--rgen-accent),0 12px 30px rgba(0,0,0,.28);}}'
// intro
+ '.rgen-intro{text-align:center;max-width:520px;margin:8px auto 4px;}'
+ '.rgen-intro p{font-size:.9rem;line-height:1.4;opacity:.85;margin:6px 0 0;}'
+ '.rgen-legend{display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;margin:14px auto 0;font-size:.72rem;color:var(--muted-color,inherit);}'
+ '.rgen-legend span{display:inline-flex;align-items:center;gap:5px;}'
+ '.rgen-legend i{width:10px;height:10px;border-radius:50%;display:inline-block;}'
// person card modal
+ '.rgen-sheet{position:fixed;inset:0;z-index:4300;display:flex;align-items:flex-end;justify-content:center;'
+ 'background:rgba(20,14,4,.5);opacity:0;transition:opacity .24s ease;padding:0;backdrop-filter:blur(2px);}'
+ '.rgen-sheet.open{opacity:1;}'
+ '.rgen-sheet-card{width:100%;max-width:520px;max-height:90vh;overflow-y:auto;-webkit-overflow-scrolling:touch;'
+ 'background:var(--card-solid-color,#fbf4e6);color:var(--font-color,inherit);border-radius:26px 26px 0 0;transform:translateY(24px);transition:transform .26s cubic-bezier(.2,.9,.3,1);'
+ 'box-shadow:0 -10px 40px rgba(0,0,0,.35);padding:0 0 30px;position:relative;}'
+ '.rgen-sheet.open .rgen-sheet-card{transform:translateY(0);}'
+ '@media(min-width:560px){.rgen-sheet{align-items:center;}.rgen-sheet-card{border-radius:26px;transform:translateY(30px) scale(.98);}}'
+ '.rgen-sheet-hero{position:relative;padding:22px 22px 16px;border-radius:26px 26px 0 0;color:#fff;overflow:hidden;}'
+ '.rgen-sheet-hero .bgtint{position:absolute;inset:0;opacity:.92;}'
+ '.rgen-sheet-hero>*{position:relative;z-index:1;}'
+ '.rgen-sheet-x{position:absolute;top:12px;right:12px;z-index:2;width:36px;height:36px;border:none;border-radius:50%;'
+ 'background:rgba(255,255,255,.22);color:#fff;cursor:pointer;display:grid;place-items:center;}'
+ '.rgen-sheet-x:hover{background:rgba(255,255,255,.34);}'
+ '.rgen-hero-row{display:flex;gap:16px;align-items:center;}'
+ '.rgen-hero-ava{width:96px;height:96px;border-radius:50%;overflow:hidden;flex:0 0 auto;box-shadow:0 6px 18px rgba(0,0,0,.3);}'
+ '.rgen-hero-ava svg{width:100%;height:100%;display:block;}'
+ '.rgen-hero-name{font-family:"Patrick Hand",cursive;font-size:2rem;line-height:1;margin:0;color:#fff;}'
+ '.rgen-hero-mean{font-size:.82rem;opacity:.92;margin-top:4px;font-style:italic;}'
+ '.rgen-hero-role{display:inline-block;margin-top:8px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;'
+ 'background:rgba(255,255,255,.22);padding:3px 10px;border-radius:999px;}'
+ '.rgen-sheet-body{padding:18px 20px 4px;}'
+ '.rgen-quickfacts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 16px;}'
+ '.rgen-qf{background:color-mix(in srgb,var(--font-color) 6%,transparent);border-radius:14px;padding:9px 12px;}'
+ '.rgen-qf .k{font-size:.62rem;text-transform:uppercase;letter-spacing:.6px;color:var(--muted-color,inherit);font-weight:700;display:flex;align-items:center;gap:4px;}'
+ '.rgen-qf .k .material-symbols-outlined{font-size:14px;}'
+ '.rgen-qf .v{font-size:.92rem;font-weight:600;margin-top:2px;}'
+ '.rgen-relrow{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;}'
+ '.rgen-relchip{display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;cursor:pointer;'
+ 'background:color-mix(in srgb,var(--font-color) 6%,transparent);border:none;color:inherit;font-size:.8rem;font-weight:600;}'
+ '.rgen-relchip:hover{background:color-mix(in srgb,var(--font-color) 12%,transparent);}'
+ '.rgen-relchip .mini{width:34px;height:34px;border-radius:50%;overflow:hidden;flex:0 0 auto;}'
+ '.rgen-relchip .mini svg{width:100%;height:100%;display:block;}'
+ '.rgen-relchip small{display:block;font-size:.6rem;color:var(--muted-color,inherit);font-weight:700;text-transform:uppercase;letter-spacing:.4px;}'
+ '.rgen-sech{font-family:"Patrick Hand",cursive;font-size:1.2rem;margin:20px 0 8px;display:flex;align-items:center;gap:7px;color:var(--secondary-color,inherit);}'
+ '.rgen-sech .material-symbols-outlined{font-size:20px;opacity:.7;}'
+ '.rgen-sech-hint{font-size:.76rem;color:var(--muted-color,inherit);opacity:.9;margin:-4px 0 10px;}'
+ '.rgen-verse{display:block;width:100%;text-align:left;background:color-mix(in srgb,var(--font-color) 4%,transparent);border:1px solid color-mix(in srgb,var(--font-color) 9%,transparent);'
+ 'border-radius:14px;padding:11px 13px;margin-bottom:9px;cursor:pointer;color:var(--font-color,inherit);}'
+ '.rgen-verse:hover{background:color-mix(in srgb,var(--font-color) 8%,transparent);}'
+ '.rgen-verse .ref{font-weight:700;font-size:.86rem;display:flex;align-items:center;gap:6px;color:color-mix(in srgb,var(--rgen-accent,#8a5a12) 78%,var(--font-color));}'
+ '.rgen-verse .ref .material-symbols-outlined{font-size:15px;}'
+ '.rgen-verse .q{font-size:.84rem;line-height:1.34;margin-top:3px;opacity:.88;}'
+ '.rgen-verse .go{float:right;font-size:.66rem;color:var(--muted-color,inherit);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-top:2px;}'
+ '.rgen-tag{display:inline-block;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.55;margin-left:4px;}'
// toast
+ '.rgen-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:4400;'
+ 'background:var(--secondary-color,#2c2519);color:var(--btn-text-color,#fff);padding:10px 16px;border-radius:999px;font-size:.82rem;opacity:0;transition:all .25s ease;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.3);}'
+ '.rgen-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}'
// respect reduced-motion, like the app's other premium surfaces
+ '@media(prefers-reduced-motion:reduce){.rgen-overlay,.rgen-card,.rgen-sheet,.rgen-sheet-card,.rgen-branch-chip,.rgen-relchip,.rgen-verse,.rgen-x,.rgen-toast,.rgen-ava,.rgen-era-chev,.rgen-nav-chip{transition:none!important;}.rgen-highlight .rgen-card{animation:none!important;}.rgen-card:hover{transform:none;}.rgen-card:hover .rgen-ava,.rgen-card:active .rgen-ava{transform:none;}}'
;
    var st = document.createElement('style');
    st.id = 'bibleGenealogyStyles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ========================================================================
   * RENDER — the scroll-down family tree
   * ======================================================================*/
  function factLine(p) {
    var items = [];
    if (p.lived) items.push('<li><span class="material-symbols-outlined">hourglass_bottom</span>Lived ' + p.lived + ' yrs</li>');
    if (p.bornWhenFather != null) items.push('<li><span class="material-symbols-outlined">cake</span>Born when father was ' + p.bornWhenFather + '</li>');
    if (p.origin) items.push('<li><span class="material-symbols-outlined">location_on</span>' + esc(p.origin) + '</li>');
    var fa = p.father ? BY_ID[p.father] : (p.branchOf ? BY_ID[p.branchOf] : null);
    if (fa) items.push('<li><span class="material-symbols-outlined">family_history</span>' + (p.gender === 'f' && p.spouse ? 'Wife of ' + esc(p.spouse.split(/[,;]/)[0]) : 'Son of ' + esc(fa.name.replace(/\s*\(.*$/, ''))) + '</li>');
    return items.join('');
  }

  function cardHtml(p, cls) {
    var era = ERAS[p.era] || ERAS.creation;
    var role = p.role ? '<span class="role">' + esc(shortRole(p.role)) + '</span>' : '';
    // The avatar itself is the tap target: an accent ring marks it as a button
    // and a small "tap" cue sits INSIDE the circle (clipped, never spilling).
    return '<button class="rgen-card ' + (cls || '') + '" style="--rgen-accent:' + era.accent + ';--rgen-soft:' + era.soft + '" '
      + 'data-person="' + esc(p.id) + '" onclick="BibleGenealogy.openPersonCard(\'' + esc(p.id) + '\')">'
      + '<span class="rgen-ava">' + avatarSvg(p, { size: 78 })
      + '<span class="rgen-ava-cue" aria-hidden="true">TAP</span></span>'
      + '<span class="rgen-meta">'
      + '<span class="rgen-name">' + esc(p.name) + role + '</span>'
      + '<ul class="rgen-facts">' + factLine(p) + '</ul>'
      + (p.blurb ? '<p class="rgen-blurb">' + esc(p.blurb) + '</p>' : '')
      + '</span>'
      + '<span class="rgen-card-go" aria-hidden="true"><span class="material-symbols-outlined">chevron_right</span></span>'
      + '</button>';
  }

  function shortRole(r) {
    if (r.length <= 22) return r;
    return r;
  }

  function hasLine(id) { return !!(BRANCHES_BY_PARENT[id] && BRANCHES_BY_PARENT[id].length); }

  function chipHtml(b) {
    var era = ERAS[b.era] || ERAS.creation;
    // A chip whose person heads their own line gets a small "opens a line" cue,
    // so it's obvious you can tap in and keep exploring downward.
    var more = hasLine(b.id) ? '<span class="rgen-chip-more" aria-hidden="true"><span class="material-symbols-outlined">account_tree</span></span>' : '';
    return '<button class="rgen-branch-chip' + (hasLine(b.id) ? ' has-line' : '') + '" style="--rgen-accent:' + era.accent + '" onclick="BibleGenealogy.openPersonCard(\'' + esc(b.id) + '\')">'
      + '<span class="mini">' + avatarSvg(b, { size: 30 }) + '</span>' + esc(b.name.replace(/\s*\(.*$/, '')) + more + '</button>';
  }

  // The tree shows each person's IMMEDIATE family only; deeper lines are one tap
  // away on that relative's card. That keeps every era section tidy and in its
  // own time, and makes exploring the tree the same simple move everywhere:
  // tap a face to go a generation deeper.
  function branchesHtml(spineId) {
    var list = BRANCHES_BY_PARENT[spineId] || [];
    if (!list.length) return '';
    var parent = BY_ID[spineId];
    var order = [], groups = {};
    list.forEach(function (b) {
      var g = b.group || BRANCH_GROUP[b.id] || branchLabel(parent);
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(b);
    });
    return order.map(function (g) {
      return '<div class="rgen-branch-label"><span class="material-symbols-outlined" style="font-size:14px">alt_route</span>' + esc(g) + '</div>'
        + '<div class="rgen-branches">' + groups[g].map(chipHtml).join('') + '</div>';
    }).join('');
  }

  // Clean fallback label for any relative not explicitly grouped.
  function branchLabel(parent) {
    if (!parent) return 'Family';
    return parent.name.replace(/\s*\(.*$/, '') + '’s household';
  }

  // Distinct eras in the order the spine walks through them.
  function eraOrder() {
    var order = [], seen = {};
    SPINE.forEach(function (p) { if (!seen[p.era]) { seen[p.era] = 1; order.push(p.era); } });
    return order;
  }
  // Count the main-line (spine) people per era — that's the number of trunk
  // cards each section actually shows, so the badge never overstates.
  function eraCounts() {
    var c = {};
    SPINE.forEach(function (p) { c[p.era] = (c[p.era] || 0) + 1; });
    return c;
  }

  // Sticky jump-nav: one chip per era so you can leap straight to a stretch of
  // the line instead of scrolling through everyone.
  function navHtml() {
    var counts = eraCounts();
    var chips = eraOrder().map(function (k, i) {
      var era = ERAS[k] || ERAS.creation;
      return '<button class="rgen-nav-chip' + (i === 0 ? ' active' : '') + '" data-era="' + k + '" style="--rgen-accent:' + era.accent + '" '
        + 'onclick="BibleGenealogy.jumpEra(\'' + k + '\')">'
        + '<span class="dot" style="background:' + era.accent + '"></span>' + esc(era.label)
        + '<span class="n">' + (counts[k] || 0) + '</span></button>';
    }).join('');
    return '<div class="rgen-nav" id="rgenNav">' + chips + '</div>';
  }

  function treeHtml() {
    var html = '<div class="rgen-tree">';
    html += '<div class="rgen-intro">'
      + '<p>From the first man to the Messiah. Open an era, then <b>tap any face</b> to read their story — every verse they’re named in, and the family that branches from them. Keep tapping to explore deeper.</p>'
      + '</div>';

    var counts = eraCounts();
    eraOrder().forEach(function (eraKey, ei) {
      var era = ERAS[eraKey] || ERAS.creation;
      var open = ei === 0; // first era open; the rest collapsed to keep it navigable
      html += '<section class="rgen-era-group' + (open ? '' : ' rgen-collapsed') + '" data-era="' + eraKey + '" id="rgen-era-' + eraKey + '">';
      html += '<button class="rgen-era-head" style="--rgen-accent:' + era.accent + '" aria-expanded="' + open + '" onclick="BibleGenealogy.toggleEra(\'' + eraKey + '\')">'
        + '<span class="dot" style="background:' + era.accent + '"></span>'
        + '<span class="rgen-era-title">' + esc(era.label) + '</span>'
        + '<span class="rgen-era-count">' + (counts[eraKey] || 0) + '</span>'
        + '<span class="material-symbols-outlined rgen-era-chev">expand_more</span>'
        + '</button>';
      html += '<div class="rgen-era-body">';
      var first = true;
      for (var i = 0; i < SPINE.length; i++) {
        var p = SPINE[i];
        if (p.era !== eraKey) continue;
        if (!first) html += '<div class="rgen-node"><span class="rgen-connector"></span></div>';
        first = false;
        html += '<div class="rgen-node" id="rgen-node-' + esc(p.id) + '">' + cardHtml(p, 'spine') + '</div>';
        html += branchesHtml(p.id);
      }
      html += '</div></section>';
    });

    html += '<div class="rgen-intro" style="margin-top:28px"><p style="opacity:.6">“The book of the genealogy of Jesus Christ, the son of David, the son of Abraham.” — Matthew 1:1</p></div>';
    html += '</div>';
    return html;
  }

  var _openPersonAfterMount = null;

  function openMap(focusPersonId) {
    injectStyles();
    var existing = document.getElementById('bibleGenealogyOverlay');
    if (existing) existing.remove();
    var ov = document.createElement('div');
    ov.className = 'rgen-overlay';
    ov.id = 'bibleGenealogyOverlay';
    ov.innerHTML =
      '<div class="rgen-topbar">'
      + '<div><h2 class="rgen-title">Bible Family Tree</h2>'
      + '<div class="rgen-sub">Who’s who from Adam to Jesus &middot; ' + SPINE.length + ' in the main line, ' + PEOPLE.length + ' people</div></div>'
      + '<button class="rgen-x" aria-label="Close" onclick="BibleGenealogy.close()"><span class="material-symbols-outlined">close</span></button>'
      + '</div>'
      + '<div class="rgen-subbar">'
      + '<div class="rgen-search">'
      + '<span class="material-symbols-outlined rgen-search-ico">search</span>'
      + '<input id="rgenSearch" type="text" placeholder="Find anyone — Adam, Ruth, David…" autocomplete="off" spellcheck="false" oninput="BibleGenealogy.search(this.value)">'
      + '<button class="rgen-search-clear" id="rgenSearchClear" aria-label="Clear" onclick="BibleGenealogy.clearSearch()"><span class="material-symbols-outlined">close</span></button>'
      + '<div class="rgen-search-results" id="rgenSearchResults"></div>'
      + '</div>'
      + navHtml()
      + '</div>'
      + '<div class="rgen-scroll" id="rgenScroll">' + treeHtml() + '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    // Scrollspy: keep the nav chip for the era you're looking at highlighted.
    var scroll = ov.querySelector('#rgenScroll');
    var spyScheduled = false;
    ov._spy = function () {
      if (spyScheduled) return;
      spyScheduled = true;
      requestAnimationFrame(function () {
        spyScheduled = false;
        var groups = scroll.querySelectorAll('.rgen-era-group');
        var y = scroll.scrollTop + 120, current = null;
        groups.forEach(function (g) { if (g.offsetTop <= y) current = g.getAttribute('data-era'); });
        if (current) setActiveNav(current, false);
      });
    };
    if (scroll) scroll.addEventListener('scroll', ov._spy, { passive: true });
    requestAnimationFrame(function () {
      ov.classList.add('open');
      if (focusPersonId) scrollToPerson(focusPersonId, true);
    });
    // esc to close
    ov._key = function (e) { if (e.key === 'Escape') { if (document.getElementById('rgenSearchResults')?.classList.contains('show')) { clearSearch(); return; } closeMap(); } };
    document.addEventListener('keydown', ov._key);
  }

  function expandEra(eraKey) {
    var g = document.getElementById('rgen-era-' + eraKey);
    if (!g) return;
    g.classList.remove('rgen-collapsed');
    var head = g.querySelector('.rgen-era-head');
    if (head) head.setAttribute('aria-expanded', 'true');
  }
  function toggleEra(eraKey) {
    var g = document.getElementById('rgen-era-' + eraKey);
    if (!g) return;
    var collapsed = g.classList.toggle('rgen-collapsed');
    var head = g.querySelector('.rgen-era-head');
    if (head) head.setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed) setActiveNav(eraKey, true);
  }
  function setActiveNav(eraKey, scrollChip) {
    var nav = document.getElementById('rgenNav');
    if (!nav) return;
    nav.querySelectorAll('.rgen-nav-chip').forEach(function (c) {
      var on = c.getAttribute('data-era') === eraKey;
      c.classList.toggle('active', on);
      if (on && scrollChip && c.scrollIntoView) { try { c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
    });
  }
  function jumpEra(eraKey) {
    expandEra(eraKey);
    setActiveNav(eraKey, true);
    var g = document.getElementById('rgen-era-' + eraKey);
    var scroll = document.getElementById('rgenScroll');
    if (g && scroll) requestAnimationFrame(function () {
      scroll.scrollTo({ top: Math.max(0, g.offsetTop - 8), behavior: 'smooth' });
    });
  }

  function scrollToPerson(id, highlight) {
    var p = BY_ID[id];
    if (p && p.isSpine) expandEra(p.era);
    var node = document.getElementById('rgen-node-' + id);
    var scroll = document.getElementById('rgenScroll');
    if (!node || !scroll) {
      // maybe a branch person → open its card directly (after opening its era)
      if (p && !p.isSpine) { if (p.branchOf && BY_ID[p.branchOf]) expandEra(BY_ID[p.branchOf].era); openPersonCard(id); }
      return;
    }
    requestAnimationFrame(function () {
      var top = node.offsetTop - 84;
      scroll.scrollTo({ top: Math.max(0, top), behavior: highlight ? 'smooth' : 'auto' });
      if (p) setActiveNav(p.era, true);
      if (highlight) {
        node.classList.add('rgen-highlight');
        setTimeout(function () { node.classList.remove('rgen-highlight'); }, 3400);
      }
    });
  }

  // Jump to anyone (from the search box): spine people scroll into the tree,
  // branch people open their card directly.
  function jumpToPerson(id) {
    clearSearch();
    var p = BY_ID[id];
    if (!p) return;
    if (p.isSpine) scrollToPerson(id, true);
    else { if (p.branchOf && BY_ID[p.branchOf]) expandEra(BY_ID[p.branchOf].era); openPersonCard(id); }
  }

  function search(q) {
    var box = document.getElementById('rgenSearchResults');
    var clear = document.getElementById('rgenSearchClear');
    if (!box) return;
    q = (q || '').trim().toLowerCase();
    if (clear) clear.classList.toggle('show', !!q);
    if (!q) { box.classList.remove('show'); box.innerHTML = ''; return; }
    var matches = PEOPLE.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) >= 0 || (p.role || '').toLowerCase().indexOf(q) >= 0 || (p.meaning || '').toLowerCase().indexOf(q) >= 0;
    });
    // spine people first, then by canonical order
    matches.sort(function (a, b) { return (a.isSpine ? 0 : 1) - (b.isSpine ? 0 : 1); });
    matches = matches.slice(0, 14);
    if (!matches.length) {
      box.innerHTML = '<div class="rgen-search-empty">No one by that name in the tree yet.</div>';
      box.classList.add('show');
      return;
    }
    box.innerHTML = matches.map(function (p) {
      var era = ERAS[p.era] || ERAS.creation;
      return '<button class="rgen-search-row" onclick="BibleGenealogy.jumpToPerson(\'' + esc(p.id) + '\')">'
        + '<span class="mini">' + avatarSvg(p, { size: 30 }) + '</span>'
        + '<span class="rgen-search-name">' + esc(p.name)
        + '<small>' + esc(era.label) + (p.isSpine ? '' : ' · relative') + '</small></span>'
        + '<span class="material-symbols-outlined rgen-search-go">north_east</span></button>';
    }).join('');
    box.classList.add('show');
  }
  function clearSearch() {
    var input = document.getElementById('rgenSearch');
    var box = document.getElementById('rgenSearchResults');
    var clear = document.getElementById('rgenSearchClear');
    if (input) input.value = '';
    if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    if (clear) clear.classList.remove('show');
  }

  function closeMap() {
    var ov = document.getElementById('bibleGenealogyOverlay');
    if (!ov) return;
    if (ov._key) document.removeEventListener('keydown', ov._key);
    ov.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { ov.remove(); }, 300);
  }

  /* ========================================================================
   * PERSON CARD — every verse + the quick facts
   * ======================================================================*/
  function qf(k, v, icon) {
    if (!v) return '';
    return '<div class="rgen-qf"><div class="k"><span class="material-symbols-outlined">' + icon + '</span>' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>';
  }

  function relChip(p, kind) {
    if (!p) return '';
    return '<button class="rgen-relchip" onclick="BibleGenealogy.openPersonCard(\'' + esc(p.id) + '\')">'
      + '<span class="mini">' + avatarSvg(p, { size: 34 }) + '</span>'
      + '<span>' + (kind ? '<small>' + esc(kind) + '</small>' : '') + esc(p.name.replace(/\s*\(.*$/, '')) + '</span></button>';
  }

  function openPersonCard(id) {
    var p = BY_ID[id];
    if (!p) return;
    injectStyles();
    var era = ERAS[p.era] || ERAS.creation;
    var existing = document.getElementById('bibleGenealogySheet');
    if (existing) existing.remove();

    // Relationships — where this person sits on the line.
    var rels = '';
    if (p.isSpine) {
      var father = p.father ? BY_ID[p.father] : null;
      var heir = p.heir ? BY_ID[p.heir] : null;
      if (father) rels += relChip(father, 'Comes after');
      if (heir) rels += relChip(heir, 'Then comes');
    } else {
      var par = p.branchOf ? BY_ID[p.branchOf] : null;
      if (par) rels += relChip(par, 'Part of');
    }
    var relRow = rels ? '<div class="rgen-relrow">' + rels + '</div>' : '';

    // Their own family & line — the relatives who branch from this person, as
    // tappable faces, so you can keep drilling generation by generation.
    var kids = BRANCHES_BY_PARENT[p.id] || [];
    var lineHtml = '';
    if (kids.length) {
      var lorder = [], lgroups = {};
      kids.forEach(function (b) {
        var g = b.group || BRANCH_GROUP[b.id] || (p.name.replace(/\s*\(.*$/, '') + '’s household');
        if (!lgroups[g]) { lgroups[g] = []; lorder.push(g); }
        lgroups[g].push(b);
      });
      lineHtml = '<div class="rgen-sech"><span class="material-symbols-outlined">diversity_1</span>Their family &amp; line</div>'
        + '<p class="rgen-sech-hint">Tap anyone to open their story and keep exploring.</p>'
        + lorder.map(function (g) {
          return '<div class="rgen-branch-label" style="justify-content:flex-start"><span class="material-symbols-outlined" style="font-size:14px">alt_route</span>' + esc(g) + '</div>'
            + '<div class="rgen-branches" style="justify-content:flex-start">' + lgroups[g].map(chipHtml).join('') + '</div>';
        }).join('');
    }

    // quick facts grid
    var facts = ''
      + qf('Meaning', p.meaning && p.meaning !== '—' ? p.meaning : '', 'translate')
      + qf('Where from', p.origin, 'public')
      + qf('Lifespan', p.lived ? p.lived + ' years' : '', 'hourglass_bottom')
      + qf('Spouse', p.spouse, 'favorite')
      + qf('Era', era.label, 'history_edu')
      + qf('Role', p.role, 'workspace_premium');

    // genealogy anchor refs (where their line is recorded)
    var genRefs = (p.gen || []).map(function (r) {
      return '<button class="rgen-verse" onclick="BibleGenealogy.goToRef(\'' + esc(r) + '\')">'
        + '<span class="go">Open ›</span>'
        + '<span class="ref"><span class="material-symbols-outlined">account_tree</span>' + esc(refDisplay(r)) + '</span></button>';
    }).join('');

    // mentions with quick facts
    var mentions = (p.mentions || []).map(function (m) {
      return '<button class="rgen-verse" onclick="BibleGenealogy.goToRef(\'' + esc(m.ref) + '\')">'
        + '<span class="go">Open ›</span>'
        + '<span class="ref"><span class="material-symbols-outlined">menu_book</span>' + esc(refDisplay(m.ref)) + '</span>'
        + '<span class="q">' + esc(m.q) + '</span></button>';
    }).join('');

    var sh = document.createElement('div');
    sh.className = 'rgen-sheet';
    sh.id = 'bibleGenealogySheet';
    sh.onclick = function (e) { if (e.target === sh) closeSheet(); };
    sh.innerHTML =
      '<div class="rgen-sheet-card" style="--rgen-accent:' + era.accent + ';--rgen-accent2:' + shade(era.accent, 30) + '">'
      + '<div class="rgen-sheet-hero"><div class="bgtint" style="background:linear-gradient(135deg,' + era.accent + ',' + shade(era.accent, -22) + ')"></div>'
      + '<button class="rgen-sheet-x" aria-label="Close" onclick="BibleGenealogy.closeSheet()"><span class="material-symbols-outlined">close</span></button>'
      + '<div class="rgen-hero-row">'
      + '<span class="rgen-hero-ava">' + avatarSvg(p, { size: 96 }) + '</span>'
      + '<div><h3 class="rgen-hero-name">' + esc(p.name) + '</h3>'
      + (p.meaning && p.meaning !== '—' ? '<div class="rgen-hero-mean">' + esc(p.meaning) + '</div>' : '')
      + (p.role ? '<span class="rgen-hero-role">' + esc(p.role) + '</span>' : '')
      + '</div></div></div>'
      + '<div class="rgen-sheet-body">'
      + (p.blurb ? '<p style="margin:2px 0 16px;font-size:.92rem;line-height:1.45;opacity:.92">' + esc(p.blurb) + '</p>' : '')
      + '<div class="rgen-quickfacts">' + facts + '</div>'
      + relRow
      + lineHtml
      + '<div class="rgen-sech"><span class="material-symbols-outlined">account_tree</span>Where the genealogy is written</div>'
      + genRefs
      + (mentions ? '<div class="rgen-sech"><span class="material-symbols-outlined">menu_book</span>Every mention &amp; why it matters</div>' + mentions : '')
      + '</div></div>';
    document.body.appendChild(sh);
    requestAnimationFrame(function () { sh.classList.add('open'); });
    sh._key = function (e) { if (e.key === 'Escape') closeSheet(); };
    document.addEventListener('keydown', sh._key);
  }

  function closeSheet() {
    var sh = document.getElementById('bibleGenealogySheet');
    if (!sh) return;
    if (sh._key) document.removeEventListener('keydown', sh._key);
    sh.classList.remove('open');
    setTimeout(function () { sh.remove(); }, 260);
  }

  /* ---- Jump to a verse in the Rhema reader -------------------------------- */
  function goToRef(ref) {
    var m = /^(\S+)\s+(\d+):(\d+)/.exec(ref);
    if (!m) return;
    var book = m[1], chapter = String(m[2]), verse = String(m[3]);
    closeSheet();
    closeMap();
    // Same path Sermon Notes uses: make sure the Rhema reader is open, then
    // set the verse (snSetRhemaVerse jumps without polluting the trail;
    // jumpToRhemaVerse is the fallback).
    var setter = window.snSetRhemaVerse || window.jumpToRhemaVerse;
    if (typeof window.showRhema === 'function' && typeof setter === 'function') {
      try {
        Promise.resolve(window.showRhema()).then(function () {
          setTimeout(function () { try { setter(book, chapter, verse); } catch (e) {} }, 60);
        });
        return;
      } catch (e) {}
    }
    // Reader not available yet — at least tell the user where to look.
    toast('Open your Bible to ' + refDisplay(ref));
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'rgen-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2200);
  }

  /* ---- Reader entry: open map focused on the person(s) at a verse ---------- */
  function openForVerse(book, chapter, verse) {
    var ppl = personsForVerse(book, chapter, verse);
    if (!ppl.length) { openMap(); return; }
    if (ppl.length === 1) {
      // spine person → open map scrolled to them; branch person → open their card
      if (ppl[0].isSpine) openMap(ppl[0].id);
      else { openMap(); setTimeout(function () { jumpToPerson(ppl[0].id); }, 380); }
      return;
    }
    // several people on one verse (e.g. Matthew 1:2) → open map at the first, they can tap others
    var spine = ppl.filter(function (x) { return x.isSpine; });
    openMap((spine[0] || ppl[0]).id);
  }

  /* ========================================================================
   * PUBLIC API
   * ======================================================================*/
  window.BibleGenealogy = {
    people: PEOPLE,
    byId: BY_ID,
    spine: SPINE,
    personsForVerse: personsForVerse,
    hasVerse: function (b, c, v) { return personsForVerse(b, c, v).length > 0; },
    avatarSvg: avatarSvg,
    open: openMap,
    openMap: openMap,
    close: closeMap,
    openForVerse: openForVerse,
    openPersonCard: openPersonCard,
    closeSheet: closeSheet,
    goToRef: goToRef,
    toggleEra: toggleEra,
    jumpEra: jumpEra,
    jumpToPerson: jumpToPerson,
    search: search,
    clearSearch: clearSearch
  };

  // Global helpers the reader / home tile call by name.
  window.openGenealogyMap = function (id) { openMap(id); };
  window.openGenealogyForVerse = openForVerse;
})();
