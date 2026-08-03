// Surface buildings: interaction detection + shop menus.

const Shops = {
  // Which building is the pod in front of? (must be on the surface, grounded)
  current() {
    if (Player.y > 0.6 || !Player.onGround) return null;
    for (const key of Object.keys(C.BUILDINGS)) {
      const b = C.BUILDINGS[key];
      if (Player.x >= b.x - 0.4 && Player.x <= b.x + b.w + 0.4) return key;
    }
    return null;
  },

  open(key) {
    Audio.resume();
    switch (key) {
      case 'fuel': return this.fuelMenu();
      case 'processor': return this.processorMenu();
      case 'save': return this.saveMenu();
      case 'upgrades': return this.upgradesMenu();
      case 'items': return this.itemsMenu();
    }
  },

  fuelMenu() {
    const P = Player;
    const missing = () => P.fuelCap() - P.fuel;
    const buy = amount => {
      const liters = Math.min(amount / C.FUEL_PRICE, missing());
      const cost = Math.ceil(liters * C.FUEL_PRICE);
      if (liters <= 0.01) { UI.toast('Tank is full'); Audio.play('denied'); return; }
      if (P.money < cost) { UI.toast('Not enough money'); Audio.play('denied'); return; }
      P.money -= cost;
      P.fuel += liters;
      P.hasRefueled = true;
      Game.onRefueled();
      Audio.play('refuel');
      this.fuelMenu();   // refresh
    };
    const fillCost = Math.ceil(missing() * C.FUEL_PRICE);
    UI.panel({
      noTune: true,
      title: C.BUILDINGS.fuel.name,
      sub: `Fuel: $${C.FUEL_PRICE.toFixed(2)} per liter — tank ${P.fuel.toFixed(1)} / ${P.fuelCap()} L`,
      rows: [
        ...[5, 10, 25, 50].map(a => ({
          name: `Buy $${a} of fuel`,
          detail: `${(a / C.FUEL_PRICE).toFixed(0)} liters`,
          button: { label: `$${a}`, disabled: P.money < 1, onClick: () => buy(a) },
        })),
        {
          name: 'Fill the tank',
          detail: `${missing().toFixed(1)} liters`,
          button: { label: `$${fillCost}`, disabled: fillCost <= 0 || P.money < fillCost, onClick: () => buy(fillCost) },
        },
      ],
    });
  },

  processorMenu() {
    const P = Player;
    const counts = {};
    for (const k of P.cargo) counts[k] = (counts[k] || 0) + 1;
    const rows = Object.keys(counts).map(k => {
      const m = C.MINERALS[k];
      return {
        name: `${m.name} × ${counts[k]}`,
        detail: `$${m.value.toLocaleString()} each`,
        right: '$' + (m.value * counts[k]).toLocaleString(),
      };
    });
    const total = P.cargoValue();
    rows.push({
      name: 'Sell all minerals',
      button: {
        label: `Sell — $${total.toLocaleString()}`,
        disabled: total === 0,
        onClick: () => {
          P.money += total;
          Game.score += total * 5;
          P.cargo = [];
          Game.onCargoSold();
          Audio.play('sell');
          UI.toast(`Sold for $${total.toLocaleString()}`);
          this.processorMenu();
        },
      },
    });
    UI.panel({
      noTune: true,
      title: C.BUILDINGS.processor.name,
      sub: total === 0 ? 'Your cargo bay is empty.' : 'Ore is weighed, refined, and paid on the spot.',
      rows,
    });
  },

  saveMenu() {
    UI.panel({
      noTune: true,
      title: C.BUILDINGS.save.name,
      sub: 'Stores your equipment, supplies, and cash. Digging progress and score are not preserved.',
      rows: [
        {
          name: 'Save game',
          detail: 'Overwrites your previous save. Score resets to zero.',
          button: { label: 'Save', onClick: () => { Game.save(); UI.toast('Progress saved'); Audio.play('save'); UI.close(); } },
        },
      ],
    });
  },

  upgradesMenu() {
    const P = Player;
    Game.onShopOpened();   // retires the -700 ft chevron guide
    const rows = [];
    const free = P.freeUpgrade;   // one on the company — any category
    for (const cat of Object.keys(C.UPGRADES)) {
      const u = C.UPGRADES[cat];
      const cur = P.tiers[cat];
      const next = u.tiers[cur + 1];
      const tint = Sprites.UPGRADE_TINTS[cat] || Sprites.UPGRADE_TINTS.hull;
      if (!next) {
        rows.push({
          name: `${u.label}: ${u.tiers[cur].name}`, detail: u.desc, right: 'MAX', rightCls: 'owned',
          icon: (ic, S, t, hov) => Sprites.drawUpgradeIcon(ic, cat, cur, S, t, hov),
          pips: { filled: u.tiers.length, total: u.tiers.length, color: tint[Math.min(cur, tint.length - 1)] },
        });
        continue;
      }
      const statStr = next.disp || (u.unit === '%' ? Math.round(next.stat * 100) : next.stat);
      rows.push({
        name: `${u.label}: ${next.name}`,
        detail: `${u.desc}  Now: ${u.tiers[cur].disp || (u.unit === '%' ? Math.round(u.tiers[cur].stat * 100) : u.tiers[cur].stat)} → ${statStr} ${u.unit}`,
        // The portrait shows the part you'd be BUYING, not the one installed
        icon: (ic, S, t, hov) => Sprites.drawUpgradeIcon(ic, cat, cur + 1, S, t, hov),
        pips: { filled: cur + 1, total: u.tiers.length, color: tint[Math.min(cur + 1, tint.length - 1)] },
        pulse: free && cat === 'fuelTank',   // the CEO's suggestion, gently throbbing
        button: {
          label: free ? 'FREE' : '$' + next.price.toLocaleString(),
          disabled: !free && P.money < next.price,
          onClick: () => {
            if (P.freeUpgrade) P.freeUpgrade = false;
            else P.money -= next.price;
            P.tiers[cat]++;
            if (cat === 'fuelTank') { P.fuel = P.fuelCap(); P.hasRefueled = true; Game.onRefueled(); }  // new tank comes full
            if (cat === 'hull') P.hull = P.hullCap();           // new hull is pristine
            Audio.play('buy');
            UI.toast(free ? `${next.name} installed — on the company!` : `${next.name} installed`);
            this.upgradesMenu();
          },
        },
      });
    }
    UI.panel({
      noTune: true,
      title: C.BUILDINGS.upgrades.name,
      sub: `Automated outfitter — funds available: $${P.money.toLocaleString()}`,
      rows,
    });
  },

  itemsMenu() {
    const P = Player;
    const rows = Object.keys(C.ITEMS).map(key => {
      const it = C.ITEMS[key];
      return {
        name: `${it.name}  (own ${P.items[key]})`,
        detail: `${it.desc} — hotkey ${it.key}`,
        icon: (ic, S, t, hov) => Sprites.drawItemIcon(ic, key, S, t, hov),
        button: {
          label: '$' + it.price.toLocaleString(),
          disabled: P.money < it.price,
          onClick: () => {
            P.money -= it.price;
            P.items[key]++;
            Audio.play('buy');
            this.itemsMenu();
          },
        },
      };
    });
    // Hull repair service
    const missing = Math.ceil(P.hullCap() - P.hull);
    const repair = amount => {
      const hp = Math.min(Math.floor(amount / C.REPAIR_COST_PER_HP), missing);
      const cost = hp * C.REPAIR_COST_PER_HP;
      if (hp <= 0) { UI.toast('Hull already full'); Audio.play('denied'); return; }
      if (P.money < cost) { UI.toast('Not enough money'); Audio.play('denied'); return; }
      P.money -= cost;
      P.hull += hp;
      Audio.play('repair');
      this.itemsMenu();
    };
    const fullCost = missing * C.REPAIR_COST_PER_HP;
    rows.push({
      name: 'Hull repair service',
      detail: `$${C.REPAIR_COST_PER_HP} per hull point — damage: ${missing} HP`,
      icon: (ic, S, t, hov) => Sprites.drawItemIcon(ic, 'repair', S, t, hov),
      button: { label: `Repair all — $${fullCost.toLocaleString()}`, disabled: missing <= 0 || P.money < fullCost, onClick: () => repair(fullCost) },
    });
    UI.panel({
      noTune: true,
      title: C.BUILDINGS.items.name,
      sub: `Supplies & field repairs — funds available: $${P.money.toLocaleString()}`,
      rows,
    });
  },
};
