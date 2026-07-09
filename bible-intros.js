// Book Introductions for all 66 books — author, date, setting, purpose, theme
// (anchored in the book's own wording), key verse, outline, and fair "both
// sides" write-ups where authorship/date/purpose are genuinely debated
// (including where Free Grace interpreters read a book differently).
// Reading time is computed at runtime from the actual MSB word counts.
// Verify: node scripts/test-intros-data.js
window.BibleIntros = {
  version: 1,
  books: {

  // ════ LAW ═══════════════════════════════════════════════════════════════
  GEN: {
    genre: "Law (Torah) — narrative",
    author: "Moses",
    authorNote: "The Pentateuch presents itself as Mosaic (Ex 17:14; 24:4; Deut 31:9), and Jesus calls it “the Book of Moses” (Mark 12:26).",
    date: "c. 1446–1406 BC",
    dateNote: "Written during the wilderness years, drawing on earlier records and oral history reaching back to the patriarchs.",
    setting: "Israel in the wilderness, about to inherit promises made centuries earlier. Genesis tells them who their God is, who they are, and why they exist as a nation.",
    purpose: "To trace God’s purpose from creation to the family of Abraham — showing that Israel’s God is the Creator of all, and that His plan to bless all nations runs through one chosen line (12:1-3).",
    theme: "Beginnings under promise. The book’s own skeleton is the repeated line “these are the generations of…” (2:4; 5:1; 6:9…), moving from the whole creation down to one family. Sin fractures everything (3–11), but God keeps narrowing His promise — a seed (3:15), a covenant (15), a people (46) — and Joseph can say of it all, “you meant evil against me, but God meant it for good” (50:20).",
    key: "GEN 12:3",
    outline: [
      ["1–11", "Creation, fall, flood, and the nations"],
      ["12–25", "Abraham: the promise given and tested"],
      ["25–36", "Isaac and Jacob: the promise carried"],
      ["37–50", "Joseph: the promise preserved in Egypt"]
    ],
    debates: [
      { q: "Did Moses really write Genesis?",
        s: "Traditional Mosaic authorship vs. the critical “documentary” theory.",
        more: "Critical scholarship (the Documentary Hypothesis) has argued the Pentateuch was stitched together from later sources (J, E, D, P) between the 9th and 5th centuries BC, pointing to different divine names, doublets, and style shifts. The traditional position answers that the text itself claims Mosaic writing (Ex 24:4; Deut 31:9), that Jesus and the apostles treat Moses as the author (Mark 12:26; John 5:46), that divine-name variation tracks meaning (Elohim for the Creator, Yahweh for the covenant God) rather than sources, and that ancient authors routinely used earlier records — Genesis covering events before Moses’ birth naturally rests on patriarchal records and oral history. Conservative scholars also note the hypothesis keeps mutating because the source divisions never hold still. Most evangelical interpreters affirm substantial Mosaic authorship with minor later updates (e.g., place-name modernizations like “Dan” in 14:14)." }
    ]
  },

  EXO: {
    genre: "Law (Torah) — narrative and covenant",
    author: "Moses",
    authorNote: "Exodus repeatedly records Moses writing (17:14; 24:4; 34:27-28); he is the eyewitness at the center of the events.",
    date: "c. 1446–1406 BC",
    dateNote: "Composed in the wilderness after the events it records.",
    setting: "Israel enslaved in Egypt roughly four centuries after Joseph. God remembers His covenant with Abraham (2:24) and acts.",
    purpose: "To record how God redeemed Israel out of slavery, bound them to Himself by covenant at Sinai, and came to dwell among them in the tabernacle.",
    theme: "Redemption unto God’s presence. The book moves in three great acts declared by its own refrains: “Let My people go, that they may serve Me” (8:1), “I will take you as My own people, and I will be your God” (6:7), and the goal — “have them make Me a sanctuary, so that I may dwell among them” (25:8). It ends with the glory filling the tabernacle (40:34).",
    key: "EXO 6:7",
    outline: [
      ["1–15", "Deliverance: plagues, Passover, and the sea"],
      ["16–18", "Journey to Sinai"],
      ["19–24", "Covenant: the law given and accepted"],
      ["25–40", "God’s dwelling: the tabernacle commanded, broken covenant renewed, glory descends"]
    ],
    debates: [
      { q: "When did the exodus happen?",
        s: "An early date (c. 1446 BC) vs. a late date (c. 1260 BC).",
        more: "The early date rests on the Bible’s own arithmetic: 1 Kings 6:1 places the exodus 480 years before Solomon’s fourth year (c. 966 BC), giving c. 1446 BC, and Judges 11:26 has Israel in the land 300 years by Jephthah’s day, which fits the same math. The late date argues from archaeology: Exodus 1:11 names the store-city “Rameses,” pointing to Pharaoh Rameses II (13th century), and destruction layers in Canaan are said to fit a later conquest. Early-date advocates reply that “Rameses” can be an updated place-name (as in Gen 47:11, centuries before any Pharaoh Rameses), and that re-dating of sites like Jericho remains contested. Either way the event itself — Israel redeemed from Egypt by blood and power — is the foundation the rest of Scripture builds on (Micah 6:4)." }
    ]
  },

  LEV: {
    genre: "Law (Torah) — priestly instruction",
    author: "Moses",
    authorNote: "“The LORD called to Moses and spoke to him” frames the whole book (1:1); some fifty-six times it says the LORD spoke to Moses.",
    date: "c. 1445 BC",
    dateNote: "Given at Sinai in the month between the tabernacle’s completion (Ex 40) and the departure census (Num 1).",
    setting: "The tabernacle now stands in Israel’s camp. The question the book answers: how can a sinful people live with a holy God in their midst?",
    purpose: "To teach Israel how to approach God (offerings, priesthood) and how to live as His distinct people (purity, holiness, festivals).",
    theme: "Holiness that makes fellowship possible. The book’s own banner is “Be holy, for I the LORD your God am holy” (19:2), and its machinery is atonement — the word runs through the book, climaxing on the Day of Atonement: “on this day atonement will be made for you to cleanse you” (16:30). Blood is given “to make atonement for your souls” (17:11) — the verse Hebrews builds on.",
    key: "LEV 19:2",
    outline: [
      ["1–7", "The offerings: how to draw near"],
      ["8–10", "The priesthood installed"],
      ["11–15", "Clean and unclean"],
      ["16–17", "The Day of Atonement and the blood"],
      ["18–27", "Holy living: “Be holy, for I am holy”"]
    ]
  },

  NUM: {
    genre: "Law (Torah) — wilderness narrative",
    author: "Moses",
    authorNote: "Numbers 33:2 records Moses writing the journey stages “at the LORD’s command.”",
    date: "c. 1445–1406 BC",
    dateNote: "Spans the thirty-eight wilderness years, completed on the plains of Moab.",
    setting: "From Sinai to the edge of Canaan — twice. A journey of eleven days (Deut 1:2) becomes forty years because of unbelief at Kadesh.",
    purpose: "To record the wilderness generation’s failure and God’s faithfulness anyway — preserving both the warning and the promise for the generation about to enter the land.",
    theme: "God’s faithfulness through a faithless generation. The hinge is chapters 13–14: the people hear the promise, refuse to be persuaded (“they could not enter in because of unbelief,” Heb 3:19 looking back), and a generation dies in the desert. Yet the book ends with the new generation counted, Balaam unable to curse them (“He has blessed, and I cannot change it,” 23:20), and the land allotted before a foot crosses the Jordan.",
    key: "NUM 14:9",
    outline: [
      ["1–10", "Ordered at Sinai: the camp counted and arranged"],
      ["11–25", "Rebellion: Kadesh, wandering, and Balaam"],
      ["26–36", "The new generation prepared for the land"]
    ]
  },

  DEU: {
    genre: "Law (Torah) — covenant sermons",
    author: "Moses",
    authorNote: "Three farewell addresses by Moses (1:5; 31:9, 24); chapter 34 records his death, added by another hand — Jewish tradition says Joshua.",
    date: "c. 1406 BC",
    dateNote: "Delivered on the plains of Moab in the final weeks of Moses’ life.",
    setting: "The new generation stands where their parents fell. Moses preaches the covenant again — to hearts, not just ears — before they cross the Jordan.",
    purpose: "To renew the covenant with the generation entering Canaan: remember what God did, love Him wholly, and choose life in the land.",
    theme: "Love the LORD your God. The book’s heartbeat is the Shema: “Hear, O Israel: the LORD our God, the LORD is one. Love the LORD your God with all your heart” (6:4-5) — the verse Jesus calls the greatest commandment. Obedience here is the response of a redeemed people (“the LORD loved you and chose you,” 7:7-8), set before them as blessing or curse, life or death: “therefore choose life” (30:19).",
    key: "DEU 6:5",
    outline: [
      ["1–4", "First address: remember the journey"],
      ["5–26", "Second address: the covenant expounded"],
      ["27–30", "Blessings, curses, and the choice of life"],
      ["31–34", "Moses’ song, blessing, and death"]
    ],
    debates: [
      { q: "Was Deuteronomy written in Moses’ day or discovered/composed under Josiah?",
        s: "Mosaic origin vs. the 7th-century composition theory.",
        more: "Since the 1800s critical scholars have tied Deuteronomy to the book found in the temple under Josiah (2 Kings 22, c. 622 BC), suggesting it was composed then to centralize worship in Jerusalem. The traditional answer: the book’s form matches second-millennium Hittite treaty patterns (preamble, history, stipulations, witnesses, blessings/curses) far better than first-millennium ones; it never names Jerusalem; and Jesus quotes it as Moses’ word (Matt 4:4, 7, 10 — all from Deuteronomy). What Josiah’s workmen found is best read as a lost copy of an old book, not a new composition — the king’s horror (2 Kings 22:11-13) makes sense only if the scroll carried recognized, ancient authority." }
    ]
  },

  // ════ HISTORY ══════════════════════════════════════════════════════════
  JOS: {
    genre: "History — conquest narrative",
    author: "Joshua (with later additions)",
    authorNote: "Joshua wrote covenant records (24:26); the account of his death and a few “to this day” notes come from a later hand.",
    date: "c. 1400–1370 BC",
    dateNote: "Written close to the events; Rahab was still living when part of it was penned (6:25).",
    setting: "Israel crosses the Jordan into the land promised to Abraham six centuries earlier.",
    purpose: "To record that God kept His land promise completely — “not one word of all the good promises… failed” (21:45) — and to call Israel to keep covenant in the land.",
    theme: "God gives what He promised; possess it by faith. The charge “be strong and courageous” (1:6-9) rests on “the LORD your God is with you wherever you go.” Victory comes God’s way (Jericho) and unbelief forfeits blessing (Ai; the Gibeonite treaty), but the summary stands: “the LORD gave Israel all the land He had sworn to give their fathers” (21:43).",
    key: "JOS 21:45",
    outline: [
      ["1–5", "Entering: Jordan crossed, covenant renewed"],
      ["6–12", "Conquering: center, south, north"],
      ["13–22", "Dividing the inheritance"],
      ["23–24", "Joshua’s farewell: “choose whom you will serve”"]
    ]
  },

  JDG: {
    genre: "History — cycle narratives",
    author: "Unknown (tradition: Samuel)",
    authorNote: "Anonymous. The refrain “in those days there was no king in Israel” (17:6; 21:25) points to a writer living under the early monarchy; Jewish tradition names Samuel.",
    date: "c. 1050–1000 BC",
    dateNote: "Covers roughly 1380–1050 BC; written after the monarchy began.",
    setting: "The generations after Joshua “did not know the LORD or the work He had done for Israel” (2:10).",
    purpose: "To show what became of Israel without covenant loyalty or godly leadership — and so to explain why Israel needed a king after God’s own heart.",
    theme: "The downward spiral and the God who still delivers. The book states its own cycle: Israel does evil, God gives them to plunderers, they cry out, He raises a deliverer — “then the LORD was moved to pity by their groaning” (2:16-18). Each cycle spirals lower (from Othniel to Samson), until the closing line diagnoses the age: “everyone did what was right in his own eyes” (21:25).",
    key: "JDG 21:25",
    outline: [
      ["1–3", "Incomplete conquest and the pattern set"],
      ["3–16", "Twelve judges: the cycles of rescue"],
      ["17–21", "Two appendices: how dark it got"]
    ]
  },

  RUT: {
    genre: "History — family narrative",
    author: "Unknown (tradition: Samuel)",
    authorNote: "Anonymous; the closing genealogy reaching David (4:17-22) shows it was written in or after David’s rise.",
    date: "c. 1010–970 BC",
    dateNote: "Events occur “in the days when the judges ruled” (1:1); written during the early monarchy.",
    setting: "Bethlehem during the judges — the era of chapter 21:25 — where quiet covenant faithfulness still exists.",
    purpose: "To show God’s providence working through ordinary loyal love (hesed), bringing a Moabite widow into the line of Israel’s greatest king.",
    theme: "Redemption through a kinsman. Ruth’s pledge (“your people shall be my people, and your God my God,” 1:16) is answered by Boaz the goel — the kinsman-redeemer who freely pays to restore what was lost (4:9-10). The genealogy lands the point: this quiet story produced David (4:22), and through him, Messiah (Matt 1:5).",
    key: "RUT 1:16",
    outline: [
      ["1", "Emptied: famine, death, and return"],
      ["2", "Gleaning in the field of grace"],
      ["3", "The request at the threshing floor"],
      ["4", "Redeemed: the kinsman pays and the line continues"]
    ]
  },

  "1SA": {
    genre: "History — rise of the monarchy",
    author: "Unknown (sources: Samuel, Nathan, Gad)",
    authorNote: "1 Chronicles 29:29 names records by Samuel, Nathan, and Gad as sources for this era; the final compiler is unnamed.",
    date: "c. 930 BC or later",
    dateNote: "Compiled after the kingdom divided (note “kings of Judah,” 1 Sam 27:6).",
    setting: "From the last judge (Samuel) to Israel’s demand for a king “like all the nations” (8:5).",
    purpose: "To record how kingship came to Israel — the people’s king (Saul) failing, and God’s king (David) chosen and prepared through suffering.",
    theme: "“The LORD looks at the heart” (16:7). Hannah’s song sets the key at the start: God “brings low and lifts up” (2:7-8). Saul, the impressive king, is rejected for unbelieving disobedience — “to obey is better than sacrifice” (15:22) — while David, anointed but hunted, learns to strengthen himself in the LORD (30:6) rather than seize the throne.",
    key: "1SA 16:7",
    outline: [
      ["1–7", "Samuel: the last judge"],
      ["8–15", "Saul: the king the people wanted"],
      ["16–31", "David anointed, Saul’s decline"]
    ]
  },

  "2SA": {
    genre: "History — David’s reign",
    author: "Unknown (sources: Nathan, Gad)",
    authorNote: "Compiled from prophetic court records (1 Chr 29:29); author unnamed.",
    date: "c. 930 BC or later",
    dateNote: "Covers David’s forty-year reign, c. 1010–970 BC.",
    setting: "David finally crowned — first over Judah, then all Israel — and Jerusalem made the city of the great King.",
    purpose: "To record David’s reign with unflinching honesty: the covenant God made with his house, and the personal sin that scarred everything after it.",
    theme: "The sure covenant and the costly fall. The summit is chapter 7: “your house and your kingdom shall endure forever before Me” (7:16) — the Davidic covenant every prophet and the gospel itself builds on (Luke 1:32-33). The valley is chapter 11: David’s sin with Bathsheba, forgiven when confessed (“The LORD has taken away your sin,” 12:13) yet reaping a harvest of sword and sorrow in his own house — grace and governmental consequence side by side.",
    key: "2SA 7:16",
    outline: [
      ["1–10", "David’s rise: king, city, covenant"],
      ["11–20", "David’s fall and its harvest"],
      ["21–24", "Epilogue: songs, heroes, and the altar site"]
    ]
  },

  "1KI": {
    genre: "History — kingdom divided",
    author: "Unknown (tradition: Jeremiah)",
    authorNote: "Anonymous; compiled from cited court annals. Jewish tradition names Jeremiah; the final form comes from the exile.",
    date: "c. 560–550 BC",
    dateNote: "Kings ends with events of c. 561 BC (2 Kings 25:27), so the finished work dates to the exile.",
    setting: "From Solomon’s golden age to a kingdom torn in two, with prophets confronting kings.",
    purpose: "To explain the exile before it happens: the kingdom rose when kings kept covenant and split and sank when they didn’t.",
    theme: "Divided hearts divide kingdoms. Solomon receives wisdom and builds the temple — “I have consecrated this house” (9:3) — but “his heart was not fully devoted to the LORD” (11:4), and the kingdom tears in two. From then on every king is measured by one standard (right or evil “in the eyes of the LORD”), while Elijah’s Carmel question hangs over the whole book: “How long will you waver between two opinions?” (18:21).",
    key: "1KI 18:21",
    outline: [
      ["1–11", "Solomon: glory, temple, and drift"],
      ["12–16", "The kingdom splits; the pattern of kings"],
      ["17–22", "Elijah versus the house of Ahab"]
    ]
  },

  "2KI": {
    genre: "History — decline and exile",
    author: "Unknown (tradition: Jeremiah)",
    authorNote: "Continues 1 Kings (originally one book); finished during the exile.",
    date: "c. 560–550 BC",
    dateNote: "The last recorded event is Jehoiachin’s release in Babylon, c. 561 BC.",
    setting: "Two kingdoms sliding toward judgment — Israel to Assyria (722 BC), Judah to Babylon (586 BC) — with prophets as God’s last word to both.",
    purpose: "To show that the exile was not the failure of God’s promise but the keeping of His warnings — “the LORD warned Israel and Judah through all His prophets… but they would not listen” (17:13-14).",
    theme: "The long patience of God, then the promised judgment. Elisha’s ministry of grace, Hezekiah’s and Josiah’s reforms, and repeated prophetic warnings all delay but do not cancel the covenant curses. Yet the book’s last paragraph — the exiled Davidic king raised from prison to the king’s table (25:27-30) — leaves the lamp of David burning.",
    key: "2KI 17:13",
    outline: [
      ["1–8", "Elisha: grace in a dark kingdom"],
      ["9–17", "Israel’s fall to Assyria"],
      ["18–25", "Judah’s reforms, relapse, and fall to Babylon"]
    ]
  },

  "1CH": {
    genre: "History — priestly retrospective",
    author: "Unknown (tradition: Ezra)",
    authorNote: "Jewish tradition names Ezra; the writer is often simply called “the Chronicler.” Shares its closing verses with Ezra’s opening (2 Chr 36:22-23 = Ezra 1:1-3).",
    date: "c. 450–400 BC",
    dateNote: "Written after the return from exile; the genealogies run past Zerubbabel (3:19-24).",
    setting: "The little post-exilic community asking: are we still God’s people? Is the Davidic promise still alive?",
    purpose: "To retell Israel’s story for the returned remnant — anchoring their identity in the genealogies, David’s throne, and true worship at the temple.",
    theme: "David’s throne and God’s house. Chronicles retells David’s reign with the temple at the center: the ark brought up with joy (15–16), the covenant confirmed (17), and David organizing worship and gathering materials “for the house of my God” (29:2-3). His prayer gives the book its heart: “Yours, O LORD, is the greatness… Yours is the kingdom” (29:11).",
    key: "1CH 29:11",
    outline: [
      ["1–9", "Genealogies: from Adam to the returned remnant"],
      ["10–20", "David’s reign retold: ark, covenant, victories"],
      ["21–29", "Preparing the temple: order of worship"]
    ]
  },

  "2CH": {
    genre: "History — priestly retrospective",
    author: "Unknown (tradition: Ezra)",
    authorNote: "Continues 1 Chronicles (originally one work).",
    date: "c. 450–400 BC",
    dateNote: "Ends by quoting Cyrus’s decree of return (36:22-23), c. 538 BC.",
    setting: "Judah’s story from Solomon to exile — told for the generation rebuilding on the other side of it.",
    purpose: "To trace the fortunes of David’s line and God’s house, highlighting revival wherever a king sought the LORD, and holding out God’s readiness to hear humble prayer.",
    theme: "“If My people humble themselves…” God’s answer at the temple dedication is the book’s thesis: “if My people, who are called by My name, humble themselves and pray… then I will hear from heaven, forgive their sin, and heal their land” (7:14). Every reform (Asa, Jehoshaphat, Hezekiah, Josiah) illustrates it; the exile proves the warning half; Cyrus’s decree proves mercy gets the last word.",
    key: "2CH 7:14",
    outline: [
      ["1–9", "Solomon and the temple’s glory"],
      ["10–28", "Judah’s kings: reform and relapse"],
      ["29–36", "Hezekiah to the exile — and the decree of return"]
    ]
  },

  EZR: {
    genre: "History — return and rebuilding",
    author: "Ezra",
    authorNote: "Chapters 7–10 are first-person Ezra memoirs; the earlier chapters draw on official documents and lists.",
    date: "c. 440 BC",
    dateNote: "Covers two returns: under Zerubbabel (538 BC) and under Ezra (458 BC).",
    setting: "Persia now rules; God stirs pagan kings to send His people home, exactly as Jeremiah had said (1:1).",
    purpose: "To record the rebuilding of the temple and the reforming of the people — restoration of worship first, then of covenant life.",
    theme: "God’s good hand on a restored remnant. The temple rises against opposition because “the eye of their God was on the elders of the Jews” (5:5), and Ezra’s ministry is summarized in the verse that defines him: he “set his heart to study the Law of the LORD, and to practice it, and to teach” (7:10). Restoration means both altar and heart.",
    key: "EZR 7:10",
    outline: [
      ["1–6", "First return: the temple rebuilt"],
      ["7–10", "Ezra’s return: the people reformed"]
    ]
  },

  NEH: {
    genre: "History — memoir",
    author: "Nehemiah",
    authorNote: "Largely Nehemiah’s own first-person memoirs (“the words of Nehemiah,” 1:1).",
    date: "c. 430 BC",
    dateNote: "Nehemiah arrived in Jerusalem 444 BC; the book includes his second term (13:6-7).",
    setting: "Jerusalem’s walls still rubble ninety years after the first return — the city defenseless and demoralized.",
    purpose: "To record how God used a praying layman to rebuild Jerusalem’s walls in fifty-two days and to re-center the community on God’s word.",
    theme: "Prayerful work under a great God. Nehemiah’s pattern is prayer plus action: “we prayed to our God and posted a guard” (4:9). The wall is finished “with the help of our God” (6:16), but the climax is not stone — it is the people gathered as Ezra reads the Law, weeping and then feasting because “the joy of the LORD is your strength” (8:10).",
    key: "NEH 8:10",
    outline: [
      ["1–7", "The wall: burden, build, opposition, completion"],
      ["8–10", "The word: reading, repentance, covenant"],
      ["11–13", "The city ordered — and reform maintained"]
    ]
  },

  EST: {
    genre: "History — court narrative",
    author: "Unknown",
    authorNote: "Anonymous; a Persian-era Jew with detailed court knowledge. Mordecai kept records (9:20), leading some to suggest him.",
    date: "c. 460–400 BC",
    dateNote: "Events fall in the reign of Xerxes I (486–465 BC).",
    setting: "Jews scattered in the Persian empire — those who did not return — facing an empire-wide decree of annihilation.",
    purpose: "To record the deliverance behind the feast of Purim: how the scattered people were preserved through apparent coincidences that were nothing of the sort.",
    theme: "Providence without a spotlight. Famously, God is never named in Esther — the point, not an oversight. Every “coincidence” (a sleepless king, a book opened to the right page, a queen in place “for such a time as this,” 4:14) shows the God who rules even when unseen and unnamed, keeping His ancient promise that those who curse Abraham’s seed are cursed (Gen 12:3; Haman is an Agagite, an old enemy — 1 Sam 15).",
    key: "EST 4:14",
    outline: [
      ["1–2", "Esther raised to the throne"],
      ["3–5", "Haman’s decree; Esther’s resolve"],
      ["6–10", "The great reversal and Purim"]
    ]
  },

  // ════ POETRY & WISDOM ═════════════════════════════════════════════════
  JOB: {
    genre: "Wisdom — dramatic poetry",
    author: "Unknown",
    authorNote: "Anonymous. Suggestions range from Job himself to Moses to Solomon; the book gives no claim.",
    date: "Unknown (patriarchal setting)",
    dateNote: "The events breathe the patriarchal age (wealth in herds, Job as family priest, no law or temple); the composition date is unknown — possibly the oldest book in Scripture.",
    setting: "The land of Uz, outside Israel — wisdom’s questions are humanity’s questions.",
    purpose: "To wrestle with innocent suffering and destroy the neat formula that suffering always equals divine punishment — while showing what trust in God looks like in the dark.",
    theme: "Trusting God without the explanation. The reader sees the heavenly scene Job never sees (1–2): the accuser claims Job serves God only for pay. Job’s friends insist suffering proves sin; God calls their theology false (42:7). Job never gets the explanation — he gets God Himself (38–41), and that is enough: “I had heard of You by the hearing of the ear, but now my eye sees You” (42:5). James points to “the outcome of the Lord’s dealings” as proof He is compassionate (Jas 5:11).",
    key: "JOB 42:5",
    outline: [
      ["1–2", "The heavenly wager and the ash heap"],
      ["3–31", "Three cycles of debate with three friends"],
      ["32–37", "Elihu speaks"],
      ["38–42", "The LORD answers; Job restored"]
    ]
  },

  PSA: {
    genre: "Poetry — songbook of Israel",
    author: "David and others",
    authorNote: "David (73 psalms), Asaph (12), sons of Korah (11), Solomon (2), Moses (Ps 90), Ethan, Heman, and about 50 anonymous.",
    date: "c. 1440–430 BC",
    dateNote: "Composed across a millennium — from Moses to after the exile (Ps 126, 137) — and gathered into five books.",
    setting: "Israel’s worship in every season: coronation and exile, festival and sickbed, praise and protest.",
    purpose: "To give God’s people God’s own words for speaking back to Him — inspired prayer and praise for every condition of the heart.",
    theme: "From lament to praise, through trust. The Psalter is arranged, not random: Psalms 1–2 set the doors (the blessed man who delights in the LORD’s instruction; the anointed King the nations must kiss), and the flow of the five books moves from heavy lament toward the pure praise of 146–150. Along the way it teaches the honest path: pour out complaint, remember God’s character, and end at “yet I will trust” — while its royal psalms (2, 22, 69, 110…) speak beyond David to Messiah, as Jesus said: “everything written about Me… in the Psalms must be fulfilled” (Luke 24:44).",
    key: "PSA 1:2",
    outline: [
      ["1–41", "Book I — the man after God’s heart"],
      ["42–72", "Book II — the king and the kingdom"],
      ["73–89", "Book III — crisis: is the covenant failing?"],
      ["90–106", "Book IV — the LORD reigns"],
      ["107–150", "Book V — redeemed praise, ending in hallelujahs"]
    ]
  },

  PRO: {
    genre: "Wisdom — sayings and instruction",
    author: "Solomon and others",
    authorNote: "Mainly Solomon (1:1; 10:1; 25:1 — copied out by Hezekiah’s men), plus “the wise” (22:17), Agur (30), and King Lemuel (31).",
    date: "c. 950–700 BC",
    dateNote: "Solomon’s core collections, compiled into final form by Hezekiah’s day.",
    setting: "A father teaching a son to navigate real life — money, speech, work, sex, friendship, temper — in God’s ordered world.",
    purpose: "To give skill for living (“wisdom”) grounded in reverence for God — shaping character that generally reaps life rather than ruin.",
    theme: "“The fear of the LORD is the beginning of knowledge” (1:7). Wisdom is not mere cleverness but life lived in reality as God made it. Proverbs states how the world normally works — general patterns, not unconditional promises (as Job and Ecclesiastes remind us) — and personifies Wisdom calling in the streets (1; 8), a portrait the NT sees fulfilled in Christ, “in whom are hidden all the treasures of wisdom” (Col 2:3).",
    key: "PRO 1:7",
    outline: [
      ["1–9", "Wisdom’s call: a father’s appeals"],
      ["10–24", "Solomon’s proverbs and the sayings of the wise"],
      ["25–29", "More of Solomon, copied by Hezekiah’s men"],
      ["30–31", "Agur, Lemuel, and the excellent wife"]
    ]
  },

  ECC: {
    genre: "Wisdom — reflective monologue",
    author: "“The Preacher” (Qoheleth) — traditionally Solomon",
    authorNote: "“Son of David, king in Jerusalem” (1:1), unmatched in wisdom and wealth (1:16; 2:9) — the profile fits Solomon.",
    date: "c. 940 BC (if Solomon)",
    dateNote: "Traditionally from Solomon’s later years, looking back over his experiments in everything “under the sun.”",
    setting: "A man who had everything — wisdom, pleasure, projects, wealth — reporting what it all amounts to on its own.",
    purpose: "To demolish the hope that anything “under the sun” (life considered without God) can carry the weight of meaning — and so to drive the reader to fear God and receive life as His gift.",
    theme: "Vapor — and the gift. The refrain “vanity of vanities” (hevel: breath, vapor) is the verdict on life pursued as self-contained: wisdom, pleasure, toil, and wealth all slip through the fingers, and death flattens everything (2:14-16). Yet woven through is the counter-melody: eating, drinking, and finding good in one’s toil are “from the hand of God” (2:24; 3:13). The book lands where wisdom begins: “Fear God and keep His commandments… for God will bring every deed into judgment” (12:13-14).",
    key: "ECC 12:13",
    outline: [
      ["1–2", "The experiment: everything tried, nothing gained"],
      ["3–6", "Time, injustice, and toil under the sun"],
      ["7–11", "Wisdom for a vaporous life"],
      ["12", "Remember your Creator; the conclusion"]
    ],
    debates: [
      { q: "Did Solomon write Ecclesiastes?",
        s: "Traditional Solomonic authorship vs. a later wisdom writer speaking in Solomon’s persona.",
        more: "The traditional view takes 1:1 at face value: “son of David, king in Jerusalem,” with wisdom and wealth beyond all predecessors (1:16; 2:9) — a description only Solomon fits — and reads the book as his sadder-but-wiser retrospective. Many scholars (including some conservatives) instead note the book never says “Solomon,” that “Qoheleth” is a title (“assembler/preacher”), and that its Hebrew has late features (Persian loanwords like pardes), suggesting a post-exilic wisdom teacher adopting Solomon’s persona as a literary device — an accepted ancient convention, not deception. Either way the book’s inspired argument is unchanged: the man who had everything testifies that “under the sun” it is vapor, so fear God (12:13)." }
    ]
  },

  SNG: {
    genre: "Poetry — love song",
    author: "Solomon",
    authorNote: "“The song of songs, which is Solomon’s” (1:1); he appears throughout as the beloved king.",
    date: "c. 960 BC",
    dateNote: "From Solomon’s reign; “song of songs” means the best of his 1,005 songs (1 Kings 4:32).",
    setting: "A bride and bridegroom — courtship, wedding, and married love — sung in the countryside and city of Israel’s golden age.",
    purpose: "To celebrate covenant love and marital desire as God’s good gift — guarded until its time, then enjoyed without shame.",
    theme: "Love strong as death. The song delights in exclusive covenant love — “my beloved is mine, and I am his” (2:16) — warns three times “do not arouse love until it pleases” (2:7; 3:5; 8:4), and crescendos at 8:6-7: “love is as strong as death… many waters cannot quench love.” Read naturally, it dignifies marriage; read canonically, it echoes the covenant love God has always used marriage to picture (Eph 5:31-32).",
    key: "SNG 8:7",
    outline: [
      ["1–3", "Courtship and longing"],
      ["3–5", "The wedding and its delight"],
      ["5–8", "Love tested, matured, and sealed"]
    ],
    debates: [
      { q: "How should the Song be interpreted?",
        s: "Natural love poetry, allegory, or both?",
        more: "For centuries the dominant reading was allegorical: the book is “really” about God and Israel or Christ and the church, with every detail encoded. The literal-grammatical approach reads it first as what it plainly is — inspired love poetry celebrating marriage — since nothing in the text signals allegory, and allegorizing has historically produced fanciful, uncontrolled meanings. Many interpreters then add a typological layer with warrant: Scripture itself repeatedly casts God’s covenant love in marital terms (Hosea; Isa 62:5; Eph 5:31-32), so faithful human love genuinely pictures divine love — but that is an application built on the natural sense, not a replacement for it." }
    ]
  },

  // ════ MAJOR PROPHETS ═════════════════════════════════════════════════
  ISA: {
    genre: "Prophecy",
    author: "Isaiah son of Amoz",
    authorNote: "Ministered under Uzziah, Jotham, Ahaz, and Hezekiah (1:1); tradition says he was sawn in two under Manasseh (cf. Heb 11:37).",
    date: "c. 740–680 BC",
    dateNote: "Called in the year King Uzziah died (6:1, 740 BC); ministered some sixty years.",
    setting: "Judah between two superpowers — Assyria menacing now, Babylon rising later — tempted to trust alliances instead of the Holy One of Israel.",
    purpose: "To confront Judah’s sin and false trust, announce judgment by Assyria and exile by Babylon, and unveil beyond both a Servant who bears sin and a kingdom of everlasting peace.",
    theme: "The Holy One of Israel — judging, then comforting. Isaiah’s temple vision (“Holy, holy, holy,” 6:3) drives both halves: chapters 1–39 mostly warn (“if you will not believe, you surely shall not be established,” 7:9), chapters 40–66 mostly comfort (“Comfort, comfort My people,” 40:1). At the center of the comfort stands the Servant, “pierced through for our transgressions” while “the LORD has caused the iniquity of us all to fall on Him” (53:5-6) — the passage the NT quotes more than any other.",
    key: "ISA 53:6",
    outline: [
      ["1–12", "Judah confronted; Immanuel promised"],
      ["13–35", "The nations judged; the King foreseen"],
      ["36–39", "Historical hinge: Assyria repelled, Babylon foretold"],
      ["40–55", "Comfort: the Servant and the free pardon"],
      ["56–66", "The new heavens and new earth"]
    ],
    debates: [
      { q: "One Isaiah or two (or three)?",
        s: "Unity of the book vs. the “Deutero-Isaiah” theory.",
        more: "Because chapters 40–66 speak to exiles and name Cyrus (44:28; 45:1) a century and a half early, critical scholarship assigned them to later anonymous authors (“Second/Third Isaiah”). The unity position replies: the driving assumption is that detailed predictive prophecy can’t happen — yet naming a deliverer in advance is precisely the argument the text makes (“I declared the former things long ago… before they took place I proclaimed them to you,” 48:3-5). The book’s signature title “the Holy One of Israel” runs evenly through both halves; the Dead Sea Isaiah scroll shows no seam at chapter 40; and the NT quotes both halves as “Isaiah” — John 12:38-41 cites Isaiah 53 and Isaiah 6 together and says Isaiah “said these things because he saw His glory.”" }
    ]
  },

  JER: {
    genre: "Prophecy — with biography",
    author: "Jeremiah (with Baruch the scribe)",
    authorNote: "Jeremiah dictated his scrolls to Baruch (36:4, 32); chapter 52 is a historical appendix.",
    date: "c. 627–580 BC",
    dateNote: "Called in Josiah’s thirteenth year (1:2, 627 BC); ministered through Jerusalem’s fall (586) and into Egypt.",
    setting: "Judah’s last forty years — reform under Josiah, then a slide through four kings to Babylonian destruction, with Jeremiah preaching surrender and being branded a traitor.",
    purpose: "To press Judah to repent before Babylon strikes, to dismantle false confidence in the temple (“the temple of the LORD, the temple of the LORD,” 7:4), and to promise, beyond seventy years, a new covenant.",
    theme: "Broken covenant, weeping prophet, new covenant. Jeremiah is called “to uproot and tear down… to build and to plant” (1:10) — and both happen. Judgment falls because the people “have forsaken Me, the spring of living water, and dug their own cisterns” (2:13). Yet the book’s summit is 31:31-34: “I will make a new covenant… I will put My law within them… I will forgive their iniquity” — the covenant Jesus inaugurates in His blood (Luke 22:20).",
    key: "JER 31:33",
    outline: [
      ["1–25", "Warnings to Judah: the broken covenant"],
      ["26–45", "Jeremiah’s story: scroll, prison, fall of the city"],
      ["30–33", "The Book of Consolation: the new covenant"],
      ["46–52", "Oracles on the nations; Jerusalem falls"]
    ]
  },

  LAM: {
    genre: "Poetry — funeral laments",
    author: "Unknown (tradition: Jeremiah)",
    authorNote: "Anonymous acrostic poems; the ancient tradition (LXX, 2 Chr 35:25’s note on Jeremiah’s laments) points to Jeremiah as eyewitness.",
    date: "c. 586 BC",
    dateNote: "Written in the immediate shadow of Jerusalem’s destruction.",
    setting: "The smoking ruins of Jerusalem — the temple burned, the people deported, the survivors starving.",
    purpose: "To give grief holy language: five carefully crafted laments that face the full horror of judgment without letting go of God’s covenant love.",
    theme: "Great grief, greater faithfulness. The poems are alphabet acrostics — grief from A to Z, ordered rather than despairing. Dead center of the book stands its lone sunrise: “Because of the LORD’s loving devotion we are not consumed, for His mercies never fail. They are new every morning; great is Your faithfulness” (3:22-23) — hope confessed not after the disaster, but from inside it.",
    key: "LAM 3:22",
    outline: [
      ["1–2", "The city desolate; the LORD’s anger"],
      ["3", "The man of affliction — and morning mercies"],
      ["4–5", "The siege remembered; a plea for restoration"]
    ]
  },

  EZK: {
    genre: "Prophecy — visions and sign-acts",
    author: "Ezekiel",
    authorNote: "A priest called to prophesy in exile (1:1-3); his oracles are dated with unusual precision.",
    date: "593–571 BC",
    dateNote: "Ministered among the exiles by the Kebar canal in Babylon, before and after Jerusalem’s fall.",
    setting: "The first wave of exiles in Babylon, still assuming Jerusalem is safe because God’s temple is there. Ezekiel must break that illusion — then rebuild hope after the city falls.",
    purpose: "To justify God’s judgment on Jerusalem (His glory departs a defiled temple), and after its fall to promise resurrection: new heart, new spirit, new temple, God dwelling with His people again.",
    theme: "“Then they will know that I am the LORD” — the refrain some seventy times. The glory departs the temple step by step (8–11), and the exiles learn each person answers for their own sin (18). Then the tide turns: dry bones live (37), God promises “I will give you a new heart and put a new Spirit within you” (36:26), and the book closes with glory filling a new temple and a city named “The LORD Is There” (48:35).",
    key: "EZK 36:26",
    outline: [
      ["1–24", "Judgment on Jerusalem: the glory departs"],
      ["25–32", "Judgment on the nations"],
      ["33–39", "Restoration: new heart, dry bones, one shepherd"],
      ["40–48", "The vision of the new temple — The LORD Is There"]
    ]
  },

  DAN: {
    genre: "Prophecy — court narrative and apocalyptic",
    author: "Daniel",
    authorNote: "Speaks in the first person from chapter 7 on (“I, Daniel”); Jesus cites “Daniel the prophet” (Matt 24:15).",
    date: "c. 605–530 BC",
    dateNote: "Spans the whole exile, from Nebuchadnezzar’s first deportation to Cyrus’s third year (10:1).",
    setting: "Believers serving inside pagan superpowers — Babylon, then Persia — under pressure to compromise, while empires rise and fall around them.",
    purpose: "To show that “the Most High is sovereign over the kingdoms of men” (4:17): sustaining His faithful in exile now, and unveiling the whole sweep of Gentile empires until God’s everlasting kingdom crushes them all.",
    theme: "God rules the kingdoms — live faithfully and read the future with hope. The narratives (1–6) prove He can keep His servants in furnace and lions’ den; the visions (2; 7–12) trace four empires until “a stone cut without hands” fills the earth (2:34-35, 44) and “One like a Son of Man” receives an everlasting dominion (7:13-14) — the title Jesus took for Himself. The Seventy Weeks (9:24-27) anchor Messiah’s coming in datable history.",
    key: "DAN 7:14",
    outline: [
      ["1–6", "Faithful in Babylon: food, furnace, lions"],
      ["2, 7–8", "The empires: statue and beasts"],
      ["9", "The Seventy Weeks"],
      ["10–12", "The final vision: kings, tribulation, resurrection"]
    ],
    debates: [
      { q: "Sixth-century Daniel or second-century composition?",
        s: "The traditional date vs. the Maccabean-era theory.",
        more: "Because Daniel 11 predicts the Ptolemies, Seleucids, and Antiochus Epiphanes in remarkable detail, critical scholarship since Porphyry (3rd century AD) has dated the book to c. 165 BC — prophecy “after the fact.” The traditional case answers: the driving premise is again that real predictive prophecy is impossible; Daniel manuscripts at Qumran are arguably too early and too revered for a book composed only decades before; the Aramaic of Daniel fits the imperial Aramaic of the earlier period; details once called errors (Belshazzar’s existence and co-regency, explaining why Daniel is offered third place in the kingdom, 5:16) have been confirmed by archaeology; and Jesus attributes the book to “Daniel the prophet” and treats its abomination of desolation as still future (Matt 24:15). The visions beyond Antiochus (2:44; 7:13-14; 9:26; 12:2) resist a purely Maccabean frame." }
    ]
  },

  // ════ MINOR PROPHETS ═════════════════════════════════════════════════
  HOS: {
    genre: "Prophecy",
    author: "Hosea son of Beeri",
    date: "c. 755–715 BC",
    dateNote: "Ministered to the northern kingdom in its final decades before Assyria destroyed it (722 BC).",
    setting: "Israel prosperous, idolatrous, and unfaithful — Baal worship blended with Yahweh’s name.",
    purpose: "To dramatize, in Hosea’s own broken marriage, how Israel’s idolatry wounds the God who loves her — and how relentlessly He intends to win her back.",
    theme: "Covenant love for an unfaithful bride. God commands the prophet to live the message: marry Gomer, name the children Judgment, No-Mercy, Not-My-People (1) — then buy her back from the slave block (3). The charge is “no knowledge of God in the land” (4:1); the ache is “How can I give you up, O Ephraim?” (11:8); the promise reverses the names: “I will say to Not-My-People, ‘You are My people’” (2:23) — words Paul applies to the gospel (Rom 9:25-26).",
    key: "HOS 2:23",
    outline: [
      ["1–3", "The marriage: sign of God and Israel"],
      ["4–13", "The case against Israel"],
      ["14", "Return, and be healed freely"]
    ]
  },

  JOL: {
    genre: "Prophecy",
    author: "Joel son of Pethuel",
    date: "Uncertain — c. 835 BC or post-exilic",
    dateNote: "Joel gives no king’s name; see the date discussion below.",
    setting: "Judah devastated by a locust plague so total that Joel reads it as a preview of something larger — the Day of the LORD.",
    purpose: "To call Judah to genuine repentance (“rend your heart and not your garments,” 2:13) in the face of the Day of the LORD, and to promise the Spirit poured out and final restoration beyond it.",
    theme: "The Day of the LORD — devastation, then outpouring. The locusts are the near horizon; behind them looms the great and awesome Day. But mercy stands open: “everyone who calls on the name of the LORD will be saved” (2:32), and God promises “I will pour out My Spirit on all flesh” (2:28) — the very words Peter announces fulfilled at Pentecost (Acts 2:16-21).",
    key: "JOL 2:32",
    outline: [
      ["1", "The locust devastation"],
      ["2", "The Day of the LORD; rend your hearts; the Spirit promised"],
      ["3", "The nations judged; Judah restored"]
    ],
    debates: [
      { q: "When did Joel prophesy?",
        s: "An early date (9th century) vs. a post-exilic date.",
        more: "Joel names no king, so the date must be inferred. The early view (c. 835 BC, during young Joash’s regency) notes Joel’s position among the early minor prophets, the enemies he names (Philistia, Phoenicia, Egypt, Edom — not Assyria or Babylon), and the temple worship in full operation. The later view (after 515 BC) points to the mention of Greeks as slave-traders (3:6), the scattered-nation language (3:2), and the absence of any king. Nothing doctrinal hangs on the choice; on either date, Joel’s Day-of-the-LORD pattern and the promise of the Spirit stand, and Peter’s “this is what was spoken through the prophet Joel” (Acts 2:16) fixes its fulfillment’s beginning at Pentecost." }
    ]
  },

  AMO: {
    genre: "Prophecy",
    author: "Amos",
    authorNote: "A shepherd and fig-grower from Tekoa in Judah (1:1; 7:14-15), sent north to Israel — a layman, not a professional prophet.",
    date: "c. 760 BC",
    dateNote: "“Two years before the earthquake,” in the prosperous reigns of Uzziah and Jeroboam II.",
    setting: "Northern Israel at its wealthiest — and its most corrupt: luxury built on crushed poor, worship divorced from justice.",
    purpose: "To indict Israel’s social injustice and hollow religion, announce that the Day of the LORD they longed for will be darkness for them, and yet close with David’s booth rebuilt.",
    theme: "Let justice roll. God roars from Zion (1:2) through seven nations’ sins and lands on Israel’s own: selling the righteous for silver, trampling the helpless (2:6-7). Their festivals He hates: “let justice roll on like a river, and righteousness like an ever-flowing stream” (5:24). Yet the last word is restoration — “I will restore the fallen booth of David” (9:11), which James quotes at the Jerusalem council (Acts 15:16-17).",
    key: "AMO 5:24",
    outline: [
      ["1–2", "The roar: eight nations, ending on Israel"],
      ["3–6", "Three sermons: “hear this word”"],
      ["7–9", "Five visions — and David’s booth rebuilt"]
    ]
  },

  OBA: {
    genre: "Prophecy",
    author: "Obadiah",
    date: "c. 586 BC (or 9th century)",
    dateNote: "Most tie verses 11-14 to Edom’s gloating at Jerusalem’s fall in 586 BC; some place it after the Philistine-Arab raid of Jehoram’s day (2 Chr 21:16-17).",
    setting: "Edom — Esau’s descendants — watching, gloating, and looting as their brother Jacob’s city falls.",
    purpose: "To announce Edom’s doom for violence against “your brother Jacob” (v. 10), and to affirm that the kingdom belongs to the LORD.",
    theme: "Pride goes down; the kingdom is the LORD’s. Edom’s cliff-fortress bred arrogance: “who can bring me down to the ground?” (v. 3). God answers: “though you soar like the eagle… from there I will bring you down” (v. 4). The shortest OT book ends with the widest claim: “the kingdom will be the LORD’s” (v. 21).",
    key: "OBA 1:21",
    outline: [
      ["1", "Edom’s pride judged; the Day of the LORD; Zion delivered"]
    ]
  },

  JON: {
    genre: "Prophecy — narrative",
    author: "Jonah son of Amittai (or an account of him)",
    authorNote: "The prophet is known from 2 Kings 14:25, ministering under Jeroboam II. The book is told about him in the third person — either by Jonah looking back or by a narrator preserving his story.",
    date: "c. 780–750 BC",
    dateNote: "Nineveh was capital-region of Assyria, the empire that would later destroy Israel — which is exactly why Jonah ran.",
    setting: "A prophet ordered to preach to his nation’s cruelest enemy — and a God whose compassion refuses to stay inside Israel’s borders.",
    purpose: "To expose Israel’s (and the reader’s) grudging heart by contrast with God’s compassion for pagan Nineveh — “should I not have compassion on that great city?” (4:11).",
    theme: "Salvation belongs to the LORD — even for Nineveh. Jonah flees not from fear but from theology: “I knew that You are a gracious and compassionate God… who relents from calamity” (4:2), and he didn’t want that for Assyrians. The storm, the fish (“salvation is from the LORD,” 2:9), the plant — every scene presses the question the book leaves open on purpose: will God’s people share God’s heart? Jesus stakes His resurrection sign on Jonah’s three days (Matt 12:39-41).",
    key: "JON 4:2",
    outline: [
      ["1", "Running from God: the storm"],
      ["2", "Prayer from the deep"],
      ["3", "Nineveh repents"],
      ["4", "The prophet schooled by a plant"]
    ],
    debates: [
      { q: "Is Jonah history or parable?",
        s: "A historical account vs. a fictional teaching story.",
        more: "Some read Jonah as parable or satire, arguing the fish, the instant city-wide repentance, and the fast-growing plant read like crafted fiction with a moral. The historical reading answers: the book is written as straight narrative, anchored to a datable prophet (2 Kings 14:25); a “parable” naming a real man and real cities without any parable-markers would be unique; and — decisively for those who follow Jesus’ own hermeneutic — He treats both the fish and Nineveh’s repentance as fact and as the pattern of His own burial and resurrection: “the men of Nineveh will stand up at the judgment with this generation and condemn it, for they repented at the preaching of Jonah” (Matt 12:40-41). A fictional Nineveh can’t stand up at a real judgment. The miracles are no obstacle unless miracles themselves are." }
    ]
  },

  MIC: {
    genre: "Prophecy",
    author: "Micah of Moresheth",
    date: "c. 735–700 BC",
    dateNote: "A contemporary of Isaiah, ministering under Jotham, Ahaz, and Hezekiah — his preaching helped spark Hezekiah’s repentance (Jer 26:18-19).",
    setting: "Small-town prophet confronting the capitals: Samaria before its fall, Jerusalem behind it — land-grabbers, corrupt courts, prophets for hire.",
    purpose: "To announce judgment on both kingdoms for covenant injustice, and to promise a Ruler from Bethlehem and a God who delights to pardon.",
    theme: "Judgment for injustice; a Shepherd-King and pardoning God beyond it. The famous requirement — “do justice, love mercy, walk humbly with your God” (6:8) — indicts the courts and markets. Hope answers in two great promises: the Ruler “whose origins are from of old, from the days of eternity” born in tiny Bethlehem (5:2; quoted at Matt 2:6), and the incomparable God who “pardons iniquity… because He delights in loving devotion” and hurls sins into the depths of the sea (7:18-19).",
    key: "MIC 6:8",
    outline: [
      ["1–2", "The case against both capitals"],
      ["3–5", "False leaders — and the Bethlehem Ruler"],
      ["6–7", "What the LORD requires; who is a God like You?"]
    ]
  },

  NAM: {
    genre: "Prophecy",
    author: "Nahum of Elkosh",
    date: "c. 660–612 BC",
    dateNote: "After Thebes’ fall (663 BC, cited in 3:8) and before Nineveh’s (612 BC, predicted throughout).",
    setting: "A century after Jonah, Nineveh has returned to full cruelty — the empire that erased northern Israel now menaces Judah.",
    purpose: "To announce Nineveh’s certain fall and thereby comfort oppressed Judah (Nahum means “comfort”): the God slow to anger is not indifferent to tyranny.",
    theme: "The jealous Avenger who is also a stronghold. The opening poem holds both truths at once: “the LORD is slow to anger and great in power; the LORD will by no means leave the guilty unpunished” (1:3), and “the LORD is good, a stronghold in the day of distress; He knows those who take refuge in Him” (1:7). Jonah showed Nineveh mercy received; Nahum shows mercy finally exhausted.",
    key: "NAM 1:7",
    outline: [
      ["1", "The character of the divine Judge"],
      ["2–3", "The siege and fall of Nineveh"]
    ]
  },

  HAB: {
    genre: "Prophecy — dialogue and psalm",
    author: "Habakkuk",
    date: "c. 640–609 BC",
    dateNote: "As Babylon rises (1:6 “I am raising up the Chaldeans”) — shortly before it swallowed Judah.",
    setting: "Not a sermon to the people but a prophet arguing with God: why does He tolerate Judah’s violence — and how can He use wickeder Babylon to judge it?",
    purpose: "To work through the problem of God’s methods honestly, and to hand Judah the settled answer to live on through the coming catastrophe.",
    theme: "“The righteous one will live by his faith” (2:4). Habakkuk complains twice; God answers twice; and the hinge is the verse the NT quotes three times (Rom 1:17; Gal 3:11; Heb 10:38): while the proud soul is puffed up, the righteous live by trusting God’s word against appearances. The book ends in one of Scripture’s greatest confessions: crops may fail and stalls stand empty, “yet I will exult in the LORD” (3:17-18).",
    key: "HAB 2:4",
    outline: [
      ["1–2", "Two complaints, two answers, five woes"],
      ["3", "The prayer: remembering God’s power, resting in Him"]
    ]
  },

  ZEP: {
    genre: "Prophecy",
    author: "Zephaniah",
    authorNote: "Traces his line four generations to Hezekiah (1:1) — likely royal blood preaching to the royal city.",
    date: "c. 640–628 BC",
    dateNote: "Early in Josiah’s reign, before (and perhaps helping ignite) the great reform of 622 BC.",
    setting: "Jerusalem still soaked in Manasseh’s idolatry — Baal, star worship, and syncretism — under a young reforming king.",
    purpose: "To announce the sweeping Day of the LORD on Judah and the nations, call the humble to seek the LORD, and promise a purified, rejoicing remnant.",
    theme: "The Day of the LORD — and the God who sings. The book opens with near-total judgment (“I will sweep away everything,” 1:2-3) and pleads, “Seek the LORD, all you humble of the earth… perhaps you will be sheltered” (2:3). It closes with the tenderest line in the prophets: “He will rejoice over you with gladness… He will exult over you with singing” (3:17).",
    key: "ZEP 3:17",
    outline: [
      ["1", "The Day of the LORD against Judah"],
      ["2", "Seek the LORD; the nations judged"],
      ["3", "Jerusalem purified; God rejoicing over His remnant"]
    ]
  },

  HAG: {
    genre: "Prophecy",
    author: "Haggai",
    date: "520 BC",
    dateNote: "Four dated messages within four months of Darius’s second year.",
    setting: "Eighteen years after the return, the temple foundation lies abandoned while everyone builds their own paneled houses (1:4).",
    purpose: "To rouse the remnant to finish God’s house — reordering priorities (“seek first”) and promising His presence and a greater glory to come.",
    theme: "“Consider your ways” — and build. Haggai’s logic is simple: crops fail and wages leak away because God’s house lies desolate while His people prioritize their own (1:5-9). When they obey, the promise lands: “I am with you… my Spirit remains among you; do not fear” (1:13; 2:4-5), and “the latter glory of this house will be greater than the former” (2:9).",
    key: "HAG 2:9",
    outline: [
      ["1", "First message: build — and they obey"],
      ["2", "Greater glory, cleansed people, Zerubbabel the signet"]
    ]
  },

  ZEC: {
    genre: "Prophecy — visions and oracles",
    author: "Zechariah son of Berechiah",
    date: "520–480 BC",
    dateNote: "Began two months after Haggai (1:1); chapters 9–14 likely come from later in his ministry.",
    setting: "The same discouraged remnant Haggai stirred — small numbers, small resources, a “day of small things” (4:10).",
    purpose: "To encourage the temple builders with visions of God’s jealous love for Zion, and to stretch their hope forward to the coming King — pierced, rejected, then reigning.",
    theme: "“Not by might, nor by power, but by My Spirit” (4:6). Eight night visions assure the remnant God has returned to Jerusalem with mercy. Then the oracles paint Messiah in unmistakable detail: the King coming “humble and mounted on a donkey” (9:9), betrayed for thirty pieces of silver (11:12-13), the house of David looking “on Me whom they have pierced” (12:10), the Shepherd struck (13:7) — each line quoted of Jesus in the Gospels — until “the LORD will be King over all the earth” (14:9).",
    key: "ZEC 9:9",
    outline: [
      ["1–6", "Eight night visions and the crowned priest"],
      ["7–8", "From fasts to feasts"],
      ["9–14", "Two oracles: the rejected King, then the reigning King"]
    ]
  },

  MAL: {
    genre: "Prophecy — disputation",
    author: "Malachi",
    date: "c. 435–420 BC",
    dateNote: "A generation or two after the temple’s completion — likely alongside or after Nehemiah’s reforms, which target the same sins.",
    setting: "Post-exilic drift: worship kept up but hollowed out — blemished sacrifices, faithless divorces, withheld tithes, and a shrug: “it is futile to serve God” (3:14).",
    purpose: "To confront the remnant’s cynical half-heartedness in a series of disputes (“But you say…”), and to close the OT pointing forward: the messenger, the Lord suddenly coming to His temple, the sunrise of righteousness.",
    theme: "“I have loved you,” answered with “How?” Six times the people talk back, and God answers each excuse. Yet even here grace distinguishes: “those who feared the LORD spoke with one another… and a book of remembrance was written” (3:16). The last page of the OT promises the next voice: “Behold, I am sending My messenger, and he will prepare the way before Me” (3:1) — fulfilled in John the Baptist (Mark 1:2) — and “the sun of righteousness will rise with healing in its wings” (4:2).",
    key: "MAL 3:1",
    outline: [
      ["1–2", "Loved — yet dishonoring God in worship and marriage"],
      ["3", "The coming messenger; robbing God; the remembrance book"],
      ["4", "The Day: sunrise for those who fear His name"]
    ]
  },

  // ════ GOSPELS & ACTS ═════════════════════════════════════════════════
  MAT: {
    genre: "Gospel",
    author: "Matthew (Levi), the tax collector",
    authorNote: "The unanimous early testimony (Papias, c. AD 110, onward) names Matthew; the Gospel’s hand shows in its money and tax details (9:9-13; 17:24-27).",
    date: "c. AD 50s–60s",
    dateNote: "Before Jerusalem’s fall (the temple assumed standing, 24:1-2 as future); critical scholars date it after 70, largely because it records that prediction.",
    setting: "Written for readers steeped in the OT — tracing fulfillment after fulfillment to show Jesus is Israel’s promised King.",
    purpose: "To demonstrate from the Scriptures that Jesus is the Messiah, the son of David and son of Abraham (1:1), and to disciple the nations in His teaching.",
    theme: "The King and His kingdom. Matthew’s drumbeat is “this took place to fulfill what was spoken through the prophet” (over a dozen times), and his architecture is five great discourses (5–7; 10; 13; 18; 24–25) echoing the five books of Moses. The Gospel opens with “God with us” (1:23) and closes with the risen King’s claim and promise: “All authority in heaven and on earth has been given to Me… and behold, I am with you always” (28:18-20).",
    key: "MAT 28:18",
    outline: [
      ["1–4", "The King arrives: genealogy, birth, baptism, testing"],
      ["5–7", "The Sermon on the Mount"],
      ["8–18", "The King’s power, parables, and church"],
      ["19–25", "To Jerusalem: confrontation and Olivet"],
      ["26–28", "Cross, resurrection, commission"]
    ]
  },

  MAR: {
    genre: "Gospel",
    author: "John Mark",
    authorNote: "Early testimony (Papias) says Mark wrote down Peter’s preaching accurately; Peter calls him “my son” (1 Pet 5:13).",
    date: "c. AD 55–65",
    dateNote: "Traditionally from Rome, preserving Peter’s account for the church there.",
    setting: "Roman readers (Latin loanwords, Jewish customs explained, 7:3-4) — likely under the shadow of persecution.",
    purpose: "To present Jesus in action — the Son of God who serves and gives His life — bracing suffering believers to follow a suffering Lord.",
    theme: "The Servant who came to give His life. Mark is the Gospel of immediacy (“immediately,” some forty times), structured around the hinge at 8:29 (“You are the Christ”) — from there every step is toward the cross. Its thesis verse doubles as its outline: “even the Son of Man did not come to be served, but to serve, and to give His life as a ransom for many” (10:45) — chapters 1–10 serving, 11–16 the ransom.",
    key: "MAR 10:45",
    outline: [
      ["1–8", "The Servant’s power: who is this?"],
      ["8–10", "The hinge: Messiah must suffer; discipleship defined"],
      ["11–16", "Passion week: the ransom given, the tomb empty"]
    ],
    debates: [
      { q: "What about Mark 16:9-20 (the longer ending)?",
        s: "A textual question: the earliest Alexandrian copies end at 16:8; the vast majority of manuscripts include vv. 9-20.",
        more: "Two early manuscripts (Vaticanus, Sinaiticus, 4th century) end Mark at 16:8, and some scholars judge the style of 9-20 different — so critical editions bracket the passage. On the other side, the longer ending appears in the overwhelming majority of Greek manuscripts, is quoted by Irenaeus around AD 180 (two centuries before those two copies were made), and an ending at “they were afraid” (16:8) — with no appearance of the risen Lord — would be abrupt for a Gospel that three times predicted resurrection. The Majority Text (which the MSB translates) includes it as Scripture. Nothing in vv. 9-20 is doctrinally unique — every event has parallels in the other Gospels — so the debate is about textual history, not the resurrection itself." }
    ]
  },

  LUK: {
    genre: "Gospel — historical account",
    author: "Luke, the beloved physician",
    authorNote: "The “we” passages of Acts place the author beside Paul; early testimony is unanimous for Luke (Col 4:14), the only Gentile biblical author.",
    date: "c. AD 60–62",
    dateNote: "Volume one of Luke–Acts; since Acts ends with Paul alive under house arrest (c. 62), the Gospel precedes that.",
    setting: "Addressed to “most excellent Theophilus,” a Gentile of standing, and through him to any thoughtful reader wanting the facts investigated and in order (1:1-4).",
    purpose: "“So that you may know the certainty of the things you have been taught” (1:4) — a carefully researched account presenting Jesus as the Savior of all kinds of people.",
    theme: "The Son of Man came to seek and to save the lost (19:10). Luke’s spotlight falls on the unexpected recipients of grace: shepherds, Samaritans, tax collectors, women, the poor, a crucified thief. Its parable trilogy — lost sheep, lost coin, lost sons (15) — answers the Pharisees’ complaint that “this man receives sinners,” and heaven’s joy over one repenting sinner is the book’s pulse.",
    key: "LUK 19:10",
    outline: [
      ["1–4", "Certainty: births, baptism, Nazareth manifesto"],
      ["4–9", "Galilee: the Savior’s power and pardon"],
      ["9–19", "The travel narrative: parables on the road to Jerusalem"],
      ["19–24", "Jerusalem: cross, empty tomb, Emmaus, ascension"]
    ]
  },

  JOH: {
    genre: "Gospel — evangelistic witness",
    author: "John, the disciple whom Jesus loved",
    authorNote: "The beloved disciple’s own testimony (21:20-24), confirmed by early tradition as the apostle John, son of Zebedee.",
    date: "c. AD 85–95",
    dateNote: "The traditional date, from Ephesus; some argue for a pre-70 date since 5:2 speaks of Jerusalem’s pool in the present tense.",
    setting: "Written after decades of reflection, supplementing the earlier Gospels with Jerusalem ministry, extended discourses, and seven selected signs.",
    purpose: "The only Bible book with an explicit evangelistic purpose statement: “these are written that you may believe that Jesus is the Christ, the Son of God, and that by believing you may have life in His name” (20:31).",
    theme: "Believe and have life. Seven signs and seven “I am” sayings build one case: Jesus is the Son of God, and everlasting life is received by believing in Him — over 90 times John uses the verb “believe,” and the promise could not be plainer: “whoever hears My word and believes Him who sent Me has eternal life and will not come into judgment, but has crossed over from death to life” (5:24). Free Grace interpreters especially treasure John as the Gospel written to tell an unbeliever exactly how to have life — and note that its condition is always believing, never probation.",
    key: "JOH 20:31",
    outline: [
      ["1", "Prologue: the Word became flesh"],
      ["2–12", "The Book of Signs: seven signs, rising belief and unbelief"],
      ["13–17", "The Upper Room: love, the Spirit, the vine, the prayer"],
      ["18–21", "Glorified: cross, resurrection, restoration"]
    ]
  },

  ACT: {
    genre: "History — the church’s beginnings",
    author: "Luke",
    authorNote: "Volume two to Theophilus (1:1); the “we” sections (16:10ff) are Luke’s own travel diary.",
    date: "c. AD 62",
    dateNote: "The book stops abruptly with Paul two years under house arrest — the strongest clue it was finished right there, before his release or Nero’s persecution.",
    setting: "From a Jerusalem upper room to the capital of the empire in one generation.",
    purpose: "To record how the risen Lord, by the Spirit, carried the witness “in Jerusalem, and in all Judea and Samaria, and to the ends of the earth” (1:8) — and how Gentiles came in by faith apart from the law (15).",
    theme: "The unstoppable word. Acts is structured by its own summary statements (“and the word of God continued to spread,” 6:7; 9:31; 12:24…): persecution scatters the church and spreads the message; prison doors open; the gospel crosses every barrier — Samaritan, eunuch, centurion — and the Jerusalem council settles that “we are saved through the grace of the Lord Jesus, in the same way as they” (15:11). The last word of the book is literally “unhindered.”",
    key: "ACT 1:8",
    outline: [
      ["1–7", "Jerusalem: Pentecost and the first church"],
      ["8–12", "Judea and Samaria: the gospel crosses lines"],
      ["13–28", "To the ends of the earth: Paul’s journeys to Rome"]
    ]
  },

  // ════ PAUL'S LETTERS ═════════════════════════════════════════════════
  ROM: {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 57",
    dateNote: "From Corinth on the third journey, carried by Phoebe of Cenchrea (16:1-2).",
    setting: "A church Paul had never visited — mixed Jewish and Gentile house churches in the capital — as he planned to make Rome his base for Spain (15:23-24).",
    purpose: "To set out his gospel in full: how God declares the ungodly righteous through faith in Christ, what that means for sin’s power, Israel’s future, and everyday life.",
    theme: "The righteousness of God, received by faith. The thesis is 1:16-17: the gospel “is the power of God for salvation to everyone who believes… in it the righteousness of God is revealed from faith to faith.” All are under sin (1–3); God justifies “the one who does not work, but believes on Him who justifies the ungodly” (4:5); therefore peace, no condemnation, and unbreakable love (5–8: “nothing… will be able to separate us,” 8:38-39); Israel’s story vindicates God’s word (9–11); and mercy reshapes life (12–16).",
    key: "ROM 1:16",
    outline: [
      ["1–3", "All unrighteous: the whole world accountable"],
      ["3–5", "Justified freely: faith counted as righteousness"],
      ["6–8", "Alive to God: from sin’s slavery to the Spirit, no condemnation"],
      ["9–11", "Israel: God’s word has not failed"],
      ["12–16", "Living sacrifice: the gospel in relationships"]
    ]
  },

  "1CO": {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 55",
    dateNote: "From Ephesus (16:8), answering reports from Chloe’s people and a letter from the church.",
    setting: "A gifted, factious young church in Corinth — a wealthy port city famous for immorality — importing the city’s values into the assembly.",
    purpose: "To confront divisions and disorders (factions, immorality, lawsuits, idol food, worship chaos) and to answer their questions — reordering everything around the cross, love, and resurrection.",
    theme: "The cross-shaped church. Corinth prized eloquence, status, and “knowledge”; Paul answers with “the word of the cross” that shames worldly wisdom (1:18-31) and insists “you are not your own; you were bought at a price” (6:19-20). Gifts without love are noise (13); and everything hangs on the historical resurrection — “if Christ has not been raised, your faith is futile” (15:17) — the chapter where Paul defines his gospel: Christ died for our sins, was buried, was raised (15:3-4).",
    key: "1CO 15:3",
    outline: [
      ["1–6", "Reported problems: factions, immorality, lawsuits"],
      ["7–14", "Their questions: marriage, idol food, worship, gifts, love"],
      ["15–16", "The resurrection — and the collection"]
    ]
  },

  "2CO": {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 56",
    dateNote: "From Macedonia, after Titus brought news that the painful letter had produced repentance (7:5-9).",
    setting: "The aftermath of a wounded relationship: “super-apostles” had charmed Corinth and mocked Paul as weak, unimpressive, and unpaid.",
    purpose: "To restore the relationship, explain his changed plans and his ministry’s nature, stir up the Jerusalem collection, and defend his apostleship against the intruders.",
    theme: "Power perfected in weakness. This most personal letter turns every accusation inside out: ministers are clay jars holding treasure “to show that this surpassingly great power is from God and not from us” (4:7); the ministry is reconciliation — “God made Him who knew no sin to be sin on our behalf, so that in Him we might become the righteousness of God” (5:21); and Paul’s thorn teaches the answer he passes to every sufferer: “My grace is sufficient for you, for My power is perfected in weakness” (12:9).",
    key: "2CO 12:9",
    outline: [
      ["1–7", "The ministry explained: clay jars, new covenant, reconciliation"],
      ["8–9", "The grace of giving"],
      ["10–13", "The reluctant boast: weakness as credentials"]
    ]
  },

  GAL: {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 48–49 (or early 50s)",
    dateNote: "See the destination/date discussion below; on the early view it is Paul’s first letter, written just before the Jerusalem council.",
    setting: "Churches Paul had planted, now infiltrated by teachers insisting Gentile believers must be circumcised and keep the law to be right with God.",
    purpose: "To defend the one true gospel — justification by faith apart from works of law — with astonishment, argument, and pastoral fire: “I am amazed how quickly you are deserting the One who called you” (1:6).",
    theme: "No other gospel: grace alone, faith alone, freedom. Paul stakes everything on one line: “a man is not justified by works of the law, but by faith in Jesus Christ” (2:16), and its corollary: “if righteousness comes through the law, Christ died for nothing” (2:21). The law was the tutor until Christ (3:24-25); now “it is for freedom that Christ has set us free” (5:1) — a freedom that serves through love and walks by the Spirit, not a return to any yoke.",
    key: "GAL 2:16",
    outline: [
      ["1–2", "The gospel’s origin: revealed, not man-made"],
      ["3–4", "The gospel argued: Abraham, the law, sons and heirs"],
      ["5–6", "The gospel lived: freedom, Spirit, new creation"]
    ],
    debates: [
      { q: "Which Galatia — and when?",
        s: "The South Galatian early date vs. the North Galatian later date.",
        more: "“Galatia” could mean the Roman province’s south (Antioch, Iconium, Lystra, Derbe — churches Paul planted in Acts 13–14) or the ethnic Galatian north. The South view dates the letter c. 48–49, before the Acts 15 council — explaining why Paul never cites the council’s decision, which would have settled the circumcision question instantly; his Jerusalem visits in Gal 1–2 then match Acts 9 and 11. The North view dates it mid-50s after Paul passed through north Galatia (Acts 16:6), grouping it with Romans by theme. Most evangelical scholarship now favors the South/early view; on it, Galatians is the earliest NT letter — meaning justification by faith apart from works was the gospel from the very first document." }
    ]
  },

  EPH: {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 60–62",
    dateNote: "One of the prison letters (3:1; 6:20), carried by Tychicus — likely a circular letter for the churches around Ephesus.",
    setting: "Believers in the shadow of Artemis’s temple and a magic-saturated culture (Acts 19), needing to know how rich and secure they already are in Christ.",
    purpose: "To unfold the church’s wealth (every spiritual blessing in Christ) and walk (a life worthy of the calling) — doctrine first, duty flowing from it.",
    theme: "In Christ: wealth, walk, warfare. One long doxology opens the letter — chosen, redeemed, sealed “in Christ” (1:3-14) — and its center is the gospel in miniature: “by grace you have been saved through faith, and this not from yourselves; it is the gift of God, not by works” (2:8-9), with good works as the result, never the cause (2:10). The mystery revealed is one new man, Jew and Gentile together (2–3); the response is to “walk worthy” (4–6) and stand armored against real spiritual enemies (6:10-18).",
    key: "EPH 2:8",
    outline: [
      ["1–3", "Wealth: every spiritual blessing in Christ"],
      ["4–6", "Walk: worthy of the calling — church, home, work"],
      ["6", "Warfare: stand in the armor of God"]
    ]
  },

  PHP: {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 61–62",
    dateNote: "From Roman imprisonment, thanking the church for their gift sent with Epaphroditus.",
    setting: "Paul’s first European church (Acts 16) — his dearest partnership — with friction between coworkers (4:2) and pressure from outside.",
    purpose: "To thank them for partnership in the gospel, report that his chains have advanced it, and call them to joyful, humble unity with the mind of Christ.",
    theme: "Joy in Christ, regardless. “Rejoice” rings sixteen times — from a prison. The letter’s crown jewel is the Christ-hymn: He “emptied Himself, taking the form of a servant… He humbled Himself and became obedient to death — even death on a cross. Therefore God highly exalted Him” (2:5-11) — the pattern for the church’s humility. Paul counts his own credentials “loss… that I may gain Christ and be found in Him, not having a righteousness of my own from the law, but that which is through faith in Christ” (3:8-9), and presses on for the prize (3:14).",
    key: "PHP 2:5",
    outline: [
      ["1", "Chains that advance the gospel; to live is Christ"],
      ["2", "The mind of Christ: humility that unifies"],
      ["3", "Righteousness from God by faith; pressing on for the prize"],
      ["4", "Rejoice always; peace and contentment"]
    ]
  },

  COL: {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 60–62",
    dateNote: "A prison letter, written with Philemon, to a church founded by Epaphras that Paul had never met (2:1).",
    setting: "A syncretistic “philosophy” was creeping in — mixing angelic mediators, ascetic rules, visionary experiences, and Jewish calendar-keeping — as if Christ were not enough.",
    purpose: "To answer the Colossian error by unveiling Christ’s absolute supremacy and the believer’s completeness in Him: “in Him you have been made complete” (2:10).",
    theme: "Christ is all — and you are complete in Him. The great hymn (1:15-20) crowns Him: “image of the invisible God… all things were created through Him and for Him… so that in everything He might have preeminence.” Therefore every add-on is a demotion: regulations “have an appearance of wisdom” but no value (2:23). Having received Christ, walk in Him (2:6), set your mind above (3:1-2), and let His word dwell richly (3:16).",
    key: "COL 2:10",
    outline: [
      ["1", "The supremacy of Christ; the mystery revealed"],
      ["2", "Complete in Him: the error answered"],
      ["3–4", "Raised with Christ: the new self at home and work"]
    ]
  },

  "1TH": {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 50–51",
    dateNote: "From Corinth, months after the riot forced Paul out of Thessalonica (Acts 17) — among the earliest NT documents.",
    setting: "Brand-new believers, weeks old in the faith, persecuted from the start, and grieving members who had died before the Lord’s return.",
    purpose: "To celebrate their genuine faith after Timothy’s good report, encourage holy living under pressure, and settle their grief and questions about the Lord’s coming.",
    theme: "Hope in the coming Lord. Every chapter ends on the return of Christ. The model conversion is theirs: “you turned to God from idols to serve the living and true God, and to await His Son from heaven” (1:9-10). The pastoral heart of the letter answers grief: the dead in Christ will rise first, the living will be caught up together with them, “and so we shall always be with the Lord — therefore comfort one another with these words” (4:16-18).",
    key: "1TH 4:16",
    outline: [
      ["1–3", "A model church; Paul’s ministry and longing"],
      ["4–5", "Walk to please God; the coming of the Lord; final charges"]
    ]
  },

  "2TH": {
    genre: "Epistle",
    author: "Paul",
    date: "c. AD 51–52",
    dateNote: "Written shortly after 1 Thessalonians, answering fresh confusion.",
    setting: "Persecution had intensified, and a forged report “as if from us” claimed the Day of the Lord had already come (2:2). Some had quit working altogether.",
    purpose: "To steady the shaken: God will repay the persecutors, the Day of the Lord has identifiable precursors still future, and idleness is not spirituality.",
    theme: "Stand firm until He comes. Present suffering is “evidence of God’s righteous judgment” working the other way — relief for the afflicted, justice for afflicters, “when the Lord Jesus is revealed from heaven” (1:5-10). The Day cannot have arrived: the apostasy and the man of lawlessness come first, whom “the Lord will slay with the breath of His mouth” (2:3-8). So: “stand firm and hold to the traditions” (2:15) — and get back to work (3:10-12).",
    key: "2TH 2:15",
    outline: [
      ["1", "Encouragement: righteous judgment is coming"],
      ["2", "Correction: the Day of the Lord and the man of lawlessness"],
      ["3", "Command: steadfastness and honest work"]
    ]
  },

  "1TI": {
    genre: "Epistle — pastoral",
    author: "Paul",
    date: "c. AD 62–64",
    dateNote: "After the Acts 28 imprisonment, with Timothy left leading the Ephesian church.",
    setting: "Ephesus again — this time the threat is inside: teachers of “different doctrine” with myths, genealogies, and law-misuse (1:3-7).",
    purpose: "“So that you will know how one must conduct himself in the household of God” (3:15) — ordering sound teaching, worship, qualified leaders, and care within the church.",
    theme: "Guard the deposit; order the household. Paul frames it with his own testimony — “Christ Jesus came into the world to save sinners, of whom I am foremost” (1:15) — and the church’s great confession (3:16). Elders and deacons must be tested and trustworthy (3); godliness with contentment is great gain against money-love, “a root of all kinds of evil” (6:6-10); and the charge lands twice: “guard what has been entrusted to you” (6:20).",
    key: "1TI 3:15",
    outline: [
      ["1", "Stop the false teachers; the trustworthy saying"],
      ["2–3", "Worship and qualified leadership"],
      ["4–6", "The good servant: godliness, widows, elders, riches, the charge"]
    ],
    debates: [
      { q: "Did Paul write the Pastoral Letters?",
        s: "Pauline authorship vs. the pseudonymity theory.",
        more: "Critical scholarship often assigns 1–2 Timothy and Titus to a later Paulinist, citing vocabulary differences, a more “developed” church order, and difficulty fitting the travels into Acts. The traditional case: the letters claim Paul’s name in their opening lines and carry intensely personal details (the cloak and parchments, 2 Tim 4:13) that pseudonymity poorly explains; vocabulary naturally shifts with topic (church order) and audience (private letters to coworkers, not congregations); the travel problem dissolves if Paul was released after Acts 28 and ministered further — exactly what early tradition says (1 Clement, c. AD 96, has Paul reaching “the limits of the west”); and the early church, which knowingly rejected pseudonymous works, received these as Paul’s without hesitation. Elders and deacons already exist in Philippians 1:1, so the “developed order” argument overreaches." }
    ]
  },

  "2TI": {
    genre: "Epistle — pastoral (Paul’s last)",
    author: "Paul",
    date: "c. AD 66–67",
    dateNote: "From a Roman dungeon in Nero’s persecution, awaiting execution: “the time of my departure has come” (4:6).",
    setting: "Paul’s final letter — friends have deserted, winter is coming, and Timothy is timid while error spreads.",
    purpose: "To pass the torch: guard the gospel, endure suffering, preach the word — and come before winter.",
    theme: "Unashamed to the end. The keynote sounds early: “God has not given us a spirit of fear… do not be ashamed of the testimony of our Lord” (1:7-8). The strategy is succession — “what you have heard from me… entrust to faithful men who will be able to teach others also” (2:2) — anchored in Scripture itself, “God-breathed and profitable” (3:16). The dying apostle’s hope is a Free-Grace-treasured distinction: not whether he is accepted, but the crown — “I have fought the good fight… in the future there is laid up for me the crown of righteousness” (4:7-8), awarded for faithful finishing, held out “to all who have longed for His appearing.”",
    key: "2TI 4:7",
    outline: [
      ["1", "Fan the flame; do not be ashamed"],
      ["2", "Entrust it: soldier, athlete, farmer, workman"],
      ["3", "Last days; the God-breathed Scriptures"],
      ["4", "Preach the word; the crown; come before winter"]
    ]
  },

  TIT: {
    genre: "Epistle — pastoral",
    author: "Paul",
    date: "c. AD 62–66",
    dateNote: "Between the imprisonments, with Titus left to organize the young churches of Crete.",
    setting: "Crete — whose own poet said Cretans are “liars, evil beasts, lazy gluttons” (1:12) — needing elders in every town and a gospel that visibly changes conduct.",
    purpose: "To “set in order what remains” (1:5): appoint qualified elders, silence deceivers, and teach the grace that trains God’s people to live well in a crooked culture.",
    theme: "Grace that saves is grace that trains. Titus holds salvation and works in exact order: “He saved us, not by works of righteousness that we had done, but according to His mercy” (3:5) — and precisely therefore, “the grace of God has appeared… training us to renounce ungodliness… zealous for good works” (2:11-14). Works are the adornment of the doctrine (2:10), never its basis; the letter says both without blurring either.",
    key: "TIT 3:5",
    outline: [
      ["1", "Elders in every town; deceivers muzzled"],
      ["2", "Sound teaching for every age; grace that trains"],
      ["3", "Saved by mercy; devoted to good works"]
    ]
  },

  PHM: {
    genre: "Epistle — personal",
    author: "Paul",
    date: "c. AD 60–62",
    dateNote: "Sent with Colossians; Onesimus travels home alongside Tychicus (Col 4:7-9).",
    setting: "Onesimus, Philemon’s runaway slave, met Paul in prison and believed. Now Paul sends him back — to a Christian master, as “a beloved brother” (v. 16).",
    purpose: "To win Philemon’s free, unforced welcome of Onesimus — “no longer as a slave, but better than a slave, a beloved brother.”",
    theme: "The gospel of imputation in miniature. Paul’s appeal enacts what Christ did for us: “if he has wronged you or owes you anything, charge it to my account” (v. 18) — substitution — and “receive him as you would receive me” (v. 17) — acceptance in another’s standing. Grace works by appeal, not compulsion (“without your consent I did not want to do anything,” v. 14), and quietly plants the seed that outgrew slavery itself.",
    key: "PHM 1:17",
    outline: [
      ["1", "Thanksgiving, the appeal for Onesimus, and confidence"]
    ]
  },

  // ════ GENERAL LETTERS & REVELATION ════════════════════════════════════
  HEB: {
    genre: "Epistle — sermonic exhortation",
    author: "Unknown",
    authorNote: "Anonymous by design; see the discussion below. Whoever wrote it knew Timothy (13:23) and wrote polished Greek steeped in the Greek OT.",
    date: "Before AD 70",
    dateNote: "The sacrifices are spoken of as still being offered (10:1-2, 11) with no mention of the temple’s destruction — the strongest argument the letter would surely have made had it already happened.",
    setting: "Jewish believers under mounting pressure — property seized, some imprisoned (10:32-34) — tempted to drift back into the safety of the synagogue and its sacrifices.",
    purpose: "A “word of exhortation” (13:22): Christ is better than angels, Moses, Aaron, and the whole sacrificial system — so do not drift, do not shrink back; draw near and press on to maturity.",
    theme: "Better — once for all. The argument mounts through one word: a better name, hope, covenant, sacrifice, country, resurrection. The center is His priesthood: “He is able to save to the uttermost those who draw near to God through Him, since He always lives to intercede for them” (7:25), by “one sacrifice for sins for all time” (10:12-14). Five warning passages punctuate the argument (see below), and the hall of faith (11) marches straight into the race set before us, “fixing our eyes on Jesus” (12:1-2).",
    key: "HEB 7:25",
    outline: [
      ["1–4", "Better than angels and Moses; enter the rest"],
      ["5–10", "The better Priest, covenant, and once-for-all sacrifice"],
      ["11–12", "By faith: the witnesses and the race"],
      ["13", "Outside the camp: closing charges"]
    ],
    debates: [
      { q: "Who wrote Hebrews?",
        s: "Anonymous — the honest ancient answer. Candidates: Paul, Apollos, Barnabas, Luke.",
        more: "The letter never names its author, and the earliest verdict remains the best — Origen (3rd century): “who wrote the epistle, God truly knows.” The East long favored Paul (hence its position after his letters), but Hebrews 2:3 places the author among those who received the message secondhand from eyewitnesses — hard to square with Paul, who insisted his gospel came by direct revelation (Gal 1:12) — and the polished Greek style differs from Paul’s. Luther proposed Apollos: an Alexandrian Jew, “an eloquent man, mighty in the Scriptures” (Acts 18:24), which fits the letter’s rhetoric and Septuagint saturation. Tertullian named Barnabas, a Levite “son of encouragement” fitting a “word of exhortation.” The anonymity changes nothing about authority: the early church received it as apostolic teaching, and its argument is self-authenticating Scripture." },
      { q: "What do the warning passages threaten?",
        s: "Loss of salvation, proof of false profession, or divine discipline and forfeited reward?",
        more: "Hebrews warns five times (2:1-4; 3:7–4:13; 5:11–6:12; 10:26-39; 12:14-29), most sharply at 6:4-6 and 10:26-31. Arminian interpreters read them as real believers who can finally lose salvation. Reformed interpreters read the warned as professors who were never genuine (“they went out from us…”). The Free Grace reading takes the descriptions at face value — “enlightened, tasted the heavenly gift, partakers of the Holy Spirit” (6:4) describes real believers — and takes the threats as what the letter actually names: divine judgment in time and forfeited reward and inheritance, not hell. The audience are “holy brothers, partakers of a heavenly calling” (3:1) in danger of drifting like the Kadesh generation — who were redeemed from Egypt yet died in the wilderness, losing the land, not their redemption (3:16-19). On this reading “no longer remains a sacrifice for sins” (10:26) means no other refuge exists to which one can retreat — a believer who abandons Christ’s once-for-all sacrifice for the temple’s repeat sacrifices finds nothing there but fearful discipline (10:30 quotes “the LORD will judge His people”). Each view takes the warnings seriously; they differ over who is warned and what is at stake." }
    ]
  },

  JAM: {
    genre: "Epistle — wisdom exhortation",
    author: "James, the Lord’s brother",
    authorNote: "The leader of the Jerusalem church (Acts 15), unbelieving during Jesus’ ministry (John 7:5), convinced by the resurrection (1 Cor 15:7).",
    date: "c. AD 45–49",
    dateNote: "Likely the earliest NT book: purely Jewish-Christian setting (“synagogue,” 2:2), no mention of the Gentile question settled in AD 49.",
    setting: "Jewish believers “scattered abroad” (1:1) — poor, oppressed by rich landowners, tempted to a faith of words without works.",
    purpose: "To press scattered believers into practical, working faith: trials met with joy, the word done and not just heard, the tongue tamed, the poor honored, prayer prayed.",
    theme: "Faith that works. James is the Proverbs of the NT — over fifty imperatives. “Be doers of the word, and not hearers only, deceiving yourselves” (1:22). His famous “faith without works is dead” (2:17) has been misread as contradicting Paul; see the discussion below. His targets are favoritism, an untamed tongue, quarrels from within, presumptuous planning, and hoarded wealth — and his remedies are wisdom from above (3:17), humility (“He gives greater grace,” 4:6), and the prayer of a righteous person, which “has great power” (5:16).",
    key: "JAM 1:22",
    outline: [
      ["1", "Trials, temptation, and doing the word"],
      ["2", "Favoritism; faith shown by works"],
      ["3–4", "The tongue, two wisdoms, quarrels, humility"],
      ["5", "Riches, patience, and prayer"]
    ],
    debates: [
      { q: "Does James 2 contradict Paul on faith and works?",
        s: "“Justified by works” (Jas 2:24) vs. “justified by faith apart from works” (Rom 4:5) — how do they fit?",
        more: "Paul and James use the same words for different questions. Paul asks how the ungodly are declared righteous before God — by believing, apart from works (Rom 4:5), with Genesis 15:6 as his proof. James asks what good a faith is that never shows — his test case is Abraham offering Isaac (Genesis 22, decades after Genesis 15), where works “perfected” and publicly vindicated a faith God had already credited. Note James’s own framing: “if someone says he has faith” and “show me” (2:14, 18) — the court is human observation, not God’s tribunal. The Reformed reading concludes that works are the necessary evidence of saving faith, so a workless professor was never saved. The Free Grace reading notes James writes to “my brothers” (2:14) — believers — and that “dead” faith is unproductive and useless for the tests of life he’s discussing (and for deliverance from sin’s temporal consequences, “save” as in 5:15, 20), not proof the person never believed; on this reading James threatens a believer’s vitality and usefulness, not their possession of life, which John says turns on believing alone (John 5:24). Both readings agree on the target: a faith content to say “be warmed and filled” while doing nothing is worthless in every sense that matters to James." }
    ]
  },

  "1PE": {
    genre: "Epistle",
    author: "Peter",
    date: "c. AD 62–64",
    dateNote: "From “Babylon” (5:13, almost certainly Rome), with Silvanus, as Nero’s hostility gathered.",
    setting: "“Elect exiles” scattered across Asia Minor (1:1) — believers slandered, maligned, and beginning to suffer simply for the Name.",
    purpose: "To steady suffering believers with their living hope, teach them to live honorably among hostile neighbors, and dignify unjust suffering by Christ’s own pattern.",
    theme: "Hope that suffers well. The letter opens on new birth “to a living hope through the resurrection” and an inheritance “kept in heaven for you” (1:3-4), then trains exiles: be holy, love deeply, submit where you can, and when you suffer unjustly, you are walking in His steps — “Christ also suffered for you, leaving you an example… He Himself bore our sins in His body on the tree” (2:21-24). Always be ready “to give a defense… for the hope that is in you” (3:15); the God of all grace will Himself restore and establish you (5:10).",
    key: "1PE 2:21",
    outline: [
      ["1–2", "Born again to a living hope; a holy priesthood"],
      ["2–4", "Exile ethics: authorities, households, suffering like Christ"],
      ["4–5", "The fiery trial; shepherds and the God of all grace"]
    ]
  },

  "2PE": {
    genre: "Epistle",
    author: "Peter",
    authorNote: "“Simeon Peter, servant and apostle” (1:1), eyewitness of the transfiguration (1:16-18), writing his second letter (3:1) — see the discussion below.",
    date: "c. AD 64–68",
    dateNote: "Facing death: “the laying aside of my earthly tent is imminent, as our Lord Jesus Christ has made clear to me” (1:14).",
    setting: "False teachers are coming — and already arriving — mocking the promise of Christ’s return and turning grace into license.",
    purpose: "Peter’s testament: grow in the knowledge of Christ, remember that prophecy is God-breathed and certain, and stand ready against scoffers — the Lord’s patience is salvation.",
    theme: "Remember: His promises hold. Everything needed “for life and godliness” is already given through knowing Him (1:3-4) — so add virtue diligently. Scripture is no myth: “no prophecy was ever brought by the will of man, but men spoke from God as they were carried along by the Holy Spirit” (1:21). Scoffers forget the flood; the Lord “is not slow… but is patient with you, not wanting anyone to perish” (3:9); the Day will come like a thief — so live holy lives, and “grow in the grace and knowledge of our Lord” (3:18).",
    key: "2PE 3:9",
    outline: [
      ["1", "Precious faith; make your calling sure; the prophetic word"],
      ["2", "False teachers described and doomed"],
      ["3", "Scoffers, the patient Lord, and the Day"]
    ],
    debates: [
      { q: "Did Peter really write 2 Peter?",
        s: "The most-questioned NT book — Petrine authorship vs. pseudonymity.",
        more: "Even in the early church 2 Peter was “disputed” (Eusebius) — its Greek style differs sharply from 1 Peter, it overlaps heavily with Jude, and it circulated more slowly. Critical scholarship therefore often calls it 2nd-century pseudonymity. The case for Peter: the letter explicitly claims him — not just the name (1:1) but the deathbed setting (1:14), the transfiguration eyewitness memory (1:16-18: “we heard this voice… on the holy mountain”), and “this is my second letter to you” (3:1); a forger claiming all that is not honoring Peter but lying, and the early church consciously rejected known pseudonymous works (e.g., the Gospel of Peter). The style difference has an ancient explanation: 1 Peter was written “through Silvanus” (1 Pet 5:12); a different amanuensis — or none — yields different Greek. Origen cites 2 Peter as Scripture, and the church weighed the doubts and received it. Its overlap with Jude shows shared material, not fraud — prophets and apostles reused inspired warnings freely." }
    ]
  },

  "1JO": {
    genre: "Epistle",
    author: "John the apostle",
    authorNote: "Anonymous but unmistakable: the eyewitness opening (“what we have seen with our eyes… touched with our hands,” 1:1) and the Gospel’s own vocabulary and style.",
    date: "c. AD 85–95",
    dateNote: "From Ephesus, to churches John shepherded, after proto-gnostic teachers had seceded (2:19) denying the Son had come in flesh.",
    setting: "Congregations shaken by departed false teachers who denied the incarnation and boasted of sinless enlightenment while loving neither the truth nor the brothers.",
    purpose: "Stated in its own words: “these things we write so that our joy may be complete” (1:4) — fellowship with the Father and the Son (1:3) — and reassurance about eternal life (5:13) against the seceders’ unsettling claims. How those purposes govern the whole letter is debated; see below.",
    theme: "God is light, God is love — walk in fellowship with Him. The letter circles three tests in ever-deeper spirals — truth (confessing Jesus come in flesh), obedience, and love for the brothers. Walking in the light means honest confession met by faithful cleansing: “if we confess our sins, He is faithful and just to forgive us our sins” (1:9), with an Advocate when we fail (2:1). “We love because He first loved us” (4:19), and the certainty stands: “God has given us eternal life, and this life is in His Son” (5:11).",
    key: "1JO 5:13",
    outline: [
      ["1–2", "Light: fellowship, confession, the Advocate, the world"],
      ["3–4", "Love: children of God; test the spirits; God is love"],
      ["5", "Life: faith’s victory and written assurance"]
    ],
    debates: [
      { q: "Is 1 John a set of tests of salvation, or a manual for fellowship?",
        s: "The “tests of life” reading vs. the fellowship reading.",
        more: "The dominant modern reading (Stott and many others) takes 5:13 as the purpose of the whole letter and its moral statements as diagnostics of genuine conversion: examine your doctrine, obedience, and love to know whether you are really saved. Free Grace interpreters counter that the letter states its purpose up front — “that you may have fellowship with us, and our fellowship is with the Father and His Son… that our joy may be complete” (1:3-4) — and is written to those John already addresses as forgiven children who know the Father (2:12-14); 5:13’s “these things” then most naturally refers to the immediately preceding witness passage (5:9-12), reaffirming that life is in the Son, not turning the letter into a self-examination checklist. On this reading the tests distinguish walking in light from walking in darkness — fellowship, not relationship — and the seceders (2:19) are shown to be antichrists by their denial of Christ, not the standard by which anxious believers must grade themselves. Practical difference: the tests-of-life reading sends the doubter to inspect their works; the fellowship reading sends them to the promise (5:11-12) — assurance rests on believing God’s testimony about His Son, while the walk determines joy and fellowship." }
    ]
  },

  "2JO": {
    genre: "Epistle — personal",
    author: "John the apostle (“the elder”)",
    date: "c. AD 85–95",
    dateNote: "A single papyrus sheet to “the chosen lady and her children” — a church and its members, or a Christian household.",
    setting: "Traveling teachers were the internet of the early church — and deceivers who denied Christ come in flesh were on the circuit.",
    purpose: "To urge continued love within the truth, and to forbid extending hospitality-as-endorsement to those who bring another doctrine of Christ.",
    theme: "Truth and love are inseparable. “I rejoiced greatly to find some of your children walking in truth” (v. 4); love is walking by His commandments (v. 6) — but love does not underwrite deceit: whoever “does not abide in the teaching of Christ does not have God” (v. 9), and sponsoring such a teacher “shares in his evil deeds” (v. 11). Verse 8 adds the Free-Grace-noted caution: watch yourselves “so that you do not lose what we have worked for, but that you may receive a full reward” — reward is losable; life is not.",
    key: "2JO 1:8",
    outline: [
      ["1", "Walk in truth and love; do not host deceivers"]
    ]
  },

  "3JO": {
    genre: "Epistle — personal",
    author: "John the apostle (“the elder”)",
    date: "c. AD 85–95",
    dateNote: "Companion note to 2 John — the other side of the hospitality coin.",
    setting: "Gaius has been supporting faithful traveling workers; Diotrephes, “who loves to be first,” refuses them and expels those who don’t.",
    purpose: "To commend Gaius’s costly hospitality to gospel workers, expose Diotrephes’s domineering, and commend Demetrius.",
    theme: "Fellow workers for the truth. Supporting faithful workers “in a manner worthy of God” makes the sender a partner: “that we may be fellow workers for the truth” (v. 8). John’s benediction became the famous prayer for whole-person prosperity “just as your soul prospers” (v. 2), and his verdict is a proverb: “the one who does good is of God” (v. 11).",
    key: "3JO 1:8",
    outline: [
      ["1", "Gaius commended; Diotrephes exposed; Demetrius endorsed"]
    ]
  },

  JUD: {
    genre: "Epistle",
    author: "Jude, brother of James (and of the Lord)",
    authorNote: "“Servant of Jesus Christ, brother of James” (v. 1) — like James, a half-brother of Jesus who believed after the resurrection.",
    date: "c. AD 65–80",
    dateNote: "Closely related to 2 Peter 2; Jude writes as the predicted infiltration is actually happening (v. 4, 17-18).",
    setting: "Jude wanted to write about “our common salvation” — but ungodly infiltrators turning grace into license forced an emergency letter instead (v. 3-4).",
    purpose: "“Contend earnestly for the faith once for all delivered to the saints” (v. 3) — expose the infiltrators, remember the apostles’ warnings, and rescue the wavering.",
    theme: "Contend — and be kept. Jude stacks OT triplets (Egypt’s unbelievers, fallen angels, Sodom; Cain, Balaam, Korah) against the creepers, then turns to the church: build yourselves up, pray, keep yourselves in God’s love, show mercy to doubters, “save others, snatching them out of the fire” (v. 20-23). The doxology answers the anxiety the letter might create: He “is able to keep you from stumbling and to present you blameless before His glorious presence with great joy” (v. 24).",
    key: "JUD 1:3",
    outline: [
      ["1", "Contend for the faith; the infiltrators; keep yourselves; the doxology"]
    ]
  },

  REV: {
    genre: "Prophecy — apocalyptic letter",
    author: "John",
    authorNote: "Four times the book names John (1:1, 4, 9; 22:8), exiled on Patmos “because of the word of God”; earliest testimony (Justin, Irenaeus) identifies the apostle.",
    date: "c. AD 95 (some argue pre-70)",
    dateNote: "See the date discussion below.",
    setting: "Seven real churches in Asia under pressure — imperial cult, persecution, compromise — given heaven’s view of history’s end.",
    purpose: "“The revelation of Jesus Christ… to show His servants what must soon take place” (1:1): unveiling the risen Lord, addressing the churches, and disclosing the judgments, the King’s return, and the new creation — “blessed is the one who reads… and keeps what is written” (1:3).",
    theme: "The Lamb wins — endure and overcome. The first vision corrects every low view of Jesus (1:12-18: “I was dead, and behold, I am alive forever”). Each church letter ends with a promise “to the one who overcomes” — promises Free Grace interpreters read as rewards motivating faithful endurance (2:26; 3:21), with a crown that can be forfeited (3:11), not conditions of having life. The scroll’s judgments run their course, Babylon falls, and the King of kings returns (19); the book ends where Eden began — tree of life, no curse, God dwelling with His people (21–22) — and with the Bible’s last invitation: “let the one who is thirsty come; let the one who desires take the water of life freely” (22:17).",
    key: "REV 22:17",
    outline: [
      ["1–3", "The risen Lord and the seven churches"],
      ["4–5", "The throne and the Lamb with the scroll"],
      ["6–18", "Seals, trumpets, bowls; the beast and Babylon"],
      ["19–20", "The King returns; the millennium; the great white throne"],
      ["21–22", "New heavens, new earth, new Jerusalem"]
    ],
    debates: [
      { q: "When was Revelation written — under Nero or Domitian?",
        s: "The late date (c. AD 95) vs. the early date (c. AD 65–68).",
        more: "The late date rests on Irenaeus (c. AD 180), who says the vision was seen “toward the end of Domitian’s reign” (d. 96), on the developed condition of the churches (Laodicea rich again after its AD 60 earthquake; Ephesus having left its first love a generation after Paul), and on the imperial-cult pressure that fits Domitian. The early date argues the temple appears still standing in 11:1-2, that “Babylon” fits pre-70 Jerusalem or Nero’s Rome, and that 666 computes from Nero Caesar — a view especially important to preterist interpreters, who read most of the book as fulfilled in AD 70. Late-date advocates respond that 11:1-2 is a visionary measuring, not a news report, and that the earliest external witness is unambiguous. The majority position, ancient and modern, remains c. 95 — and on either date the book’s commands to the churches and its ending are untouched: the Lamb reigns, and He is coming." }
      ]
  }
  }
};
