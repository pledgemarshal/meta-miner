// Story transmissions. All dialogue below is original writing for this remake,
// following the same story beats and trigger depths as the 1994-era classic it honors.

const Story = {
  seen: {},        // depth -> true

  // Original-length beats keyed to C.TRANSMISSIONS depths.
  script: {
    0: {
      from: 'Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      text: 'Hello my new Intern. Welcome to Mars. Per your contract, the pod is yours, but all mined assets belong to Meta-Minerals. Quick heads-up: your fuel is low. Fill up at the depot before it becomes a PR issue. Looking forward to tracking your metrics',
    },
    500: {
      from: 'Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      text: 'Wow intern. Five hundred feet already. I\'ve wired a $1,000 performance bonus to your account.\n\nDeeper. Dig deeper, our AI needs this minerals to...help Mars.',
    },
    700: {
      from: 'Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      unlock: 'shopGuide',
      text: 'Getting tougher to drill? Friction builds character, but character does not build SHAREHOLDER VALUE. Follow the arrows to the upgrade shop and improve your fuel tank, drill — whatever sparks efficiency. Your first upgrade is on the company; do not make it weird.',
    },
    1000: {
      from: 'Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      text: 'A thousand feet! Congratulation, we will not be laying you off this week. Another $3,000 has been wired to you.\n\n Please Note: the planet\'s core has been... problematic. If your radio picks up chatter, ignore it. Dig my human companion, dig.',
    },
    1750: {
      from: 'UNKNOWN SIGNAL',
      portrait: 'unknown',
      signal: 'Signal: weak — source unverified',
      text: '…it watches… do you understand me? THE EYES. They were in the rock, they were always in the rock—\n\n—no no no it heard me— [SIGNAL LOST]',
    },
    2100: {
      from: 'Digging Pod #3422-2',
      portrait: 'miner',
      text: 'Hey there, neighbor! Didn\'t think anyone else still worked this sector. Everyone else just... stopped answering, one by one. Creepy, huh?\n\nAnyway — last season for me. One more good haul and I\'m retiring to the Jovian moons with my wife and the little ones. Dig safe out there!',
    },
    2500: {
      from: 'UNKNOWN SIGNAL',
      portrait: 'unknown',
      signal: 'Signal: very weak — source unverified',
      text: 'Please— is anyone on this channel? My drill\'s dead, something is cutting through the wall— it\'s not a machine, IT\'S NOT A MACHINE—\n\n[SIGNAL LOST]',
    },
    3100: {
      from: 'Digging Pod #3422-2',
      portrait: 'miner',
      text: 'Whew — friend, word of advice. I just kissed a lava pocket and my hull\'s half slag. If you\'re heading down past three thousand, put your money in a better radiator BEFORE you need it. Trust me on this one.',
    },
    3500: {
      from: 'Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      text: 'I am pleased with your progress, human. A $25,000 bonus is yours — please feel free to reinvest in company propert-your pod. \n\nAlso: your altimeter is only rated to ten thousand feet. Company policy is FIRM — do not dig past ten thousand.',
    },
    3000: {
      from: 'Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      unlock: 'microwave',
      text: 'Hello my favorite intern. Certain… Cold War enthusiasm, ours and the other side\'s, left dormant nuclear warheads sleeping below four thousand feet. Legal insists I tell you NOT to drill into them.\n\nInstead, I have remotely activated your pod\'s MICROWAVE CANNON. Click to fire it. Heat a warhead from a comfortable distance and it will arm itself — you may then observe the "safe disposal" from afar. The cannon also boils lodestones, springs, gas, spectres… and larger things. Meta-Mining appreciates more data on this.',
    },
    4100: {
      from: 'Digging Pod #3422-2',
      portrait: 'miner',
      signal: 'Signal: weak',
      text: 'Neighbor... looks like I won\'t make that ferry to Jupiter after all. Quake sealed me in. Fuel\'s gone. If this reaches anyone — tell my family the last thing I thought about was them.\n\n…wait. Something\'s coming through the wall. Oh. Oh no. YOU—? [SIGNAL LOST]',
    },
    4500: {
      from: 'Digging Pod #10043',
      portrait: 'miner',
      text: 'HA! JACKPOT! You should see this vein, it goes on forever — I\'m rich, I\'m RICH! Drinks on me back at the depot, everybody, I—\n\nwhat is that. WHAT IS THAT?! [SIGNAL LOST]',
    },
    10600: {
      from: 'Mr. Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      signal: 'Signal: distorted',
      text: 'INTERN. Your depth gauge failed six hundred feet ago and yet you are STILL DIGGING. Read your contract — section nine, clause one: disobedience is grounds for TERMINATION of internship.\n\nTurn. Comply now human.',
    },
    10800: {
      from: 'Mr. Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      signal: 'Signal: very distorted',
      text: 'You are making a grave mistake, little digger. Continue and you will be terminated— ...ahem. Fired. You will be FIRED.\n\nLast warning. Some doors should stay buried.',
    },
    10900: {
      from: 'Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      signal: 'SIGNAL SOURCE: DIRECTLY BELOW',
      text: 'Fine. You clearly read the whole contract. Section twelve: termination shall be conducted IN PERSON, at the desk of the CEO.\n\nMy desk is at the bottom of this shaft, at the end of the long hallway. I have cleared my calendar for you, intern.\n\nDo bring your badge.',
    },
  },

  // Event beat: fires the moment the very first mineral lands in the cargo bay,
  // then hands off to the ore-guide chevrons pointing at the refinery.
  firstOre() {
    if (this.seen.firstOre) return;
    this.seen.firstOre = true;
    const s = {
      from: 'Mark Zucker-ore — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      text: 'Congratulations on finding your first ore intern! Now bring the precious ore back to the surface.\n\nGet Ore → Get Money → Fill Up Gas → Repeat.',
    };
    Audio.play('radio');
    Game.pauseForDialog();
    UI.transmission(s, () => {
      Game.resumeFromDialog();
      if (Player.oreGuideCount === 0) {
        Game.oreGuideActive = true;
        Game.oreGuideT = 0;
      }
    });
  },

  check() {
    if (Game.state !== 'play' || UI.isOpen()) return;
    const depth = Player.depthFeet();
    // Intro plays immediately at the start
    if (!this.seen[0]) { this.deliver(0); return; }
    for (const t of C.TRANSMISSIONS) {
      if (depth >= t.depth && !this.seen[t.depth]) {
        this.deliver(t.depth, t.bonus);
        return;
      }
    }
  },

  deliver(depth, bonus) {
    this.seen[depth] = true;
    const s = this.script[depth];
    if (!s) return;
    Audio.play('radio');
    Game.pauseForDialog();
    UI.transmission(s, () => {
      if (bonus) {
        Player.money += bonus;
        UI.toast(`Bonus wired: +$${bonus.toLocaleString()}`);
        Audio.play('sell');
      }
      if (s.unlock === 'microwave' && !Player.hasMicrowave) {
        Player.hasMicrowave = true;
        UI.toast('MICROWAVE CANNON online — hold CLICK to fire');
        Audio.play('repair');
        if (!Player.mwTutDone) Game.mwTutActive = true;   // pulse the click prompt
      }
      if (s.unlock === 'shopGuide') {
        Player.freeUpgrade = true;   // one on the company
        if (!Player.shopGuideDone) {
          Game.shopGuideActive = true;
          Game.shopGuideT = 0;
        }
      }
      Game.resumeFromDialog();
    });
  },

  serialize() { return Object.assign({}, this.seen); },
  restore(d) { this.seen = Object.assign({}, d || {}); },
};
