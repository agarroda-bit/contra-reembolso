// Qué se guarda de cada módulo. Se registra al arrancar la partida.
import type { Game } from '../core/game';
import type { SaveSystem } from './save';
import type { WeaponId } from '../combat/weapons';
import type { OwnedVehicle } from './shops';
import type { Profile } from '../ui/menus';

export function registerSaveSections(game: Game, getProfile: () => Profile, setProfile: (p: Profile) => void) {
  const save = game.mod.save as SaveSystem;
  if (!save) return;
  const m = game.mod;

  save.register({ key: 'profile', save: () => getProfile(), load: (d) => d && setProfile(d) });

  save.register({
    key: 'economy',
    save: () => ({ cash: m.economy.cash, bank: m.economy.bank, fame: m.economy.fame, stats: m.economy.stats }),
    load: (d) => {
      m.economy.cash = d.cash ?? 0;
      m.economy.bank = d.bank ?? 0;
      m.economy.fame = d.fame ?? 0;
      Object.assign(m.economy.stats, d.stats ?? {});
    },
  });

  save.register({
    key: 'player',
    save: () => ({ health: m.player.health, armor: m.player.armor }),
    load: (d) => {
      m.player.health = Math.max(40, d.health ?? 100);
      m.player.armor = d.armor ?? 0;
    },
  });

  if (m.combat)
    save.register({
      key: 'weapons',
      save: () => ({ owned: [...m.combat.owned], ammo: m.combat.ammo, current: m.combat.current }),
      load: (d) => {
        for (const w of (d.owned ?? []) as WeaponId[]) m.combat.owned.add(w);
        Object.assign(m.combat.ammo, d.ammo ?? {});
        if (d.current) m.combat.select(d.current);
      },
    });

  if (m.shops)
    save.register({
      key: 'garage',
      save: () => ({
        owned: (m.shops.owned as OwnedVehicle[]).map((o) => ({ kind: o.kind, color: o.color, upgrades: o.upgrades, first: o === m.shops.owned[0] })),
        clothes: [...m.shops.clothesOwned],
        equipped: m.shops.equipped,
      }),
      load: (d) => {
        // la furgoneta inicial ya existe: se actualiza; el resto se añade al garaje
        const list = (d.owned ?? []) as any[];
        list.forEach((o, i) => {
          if (i === 0 && m.shops.owned[0]) {
            const first = m.shops.owned[0] as OwnedVehicle;
            first.color = o.color;
            Object.assign(first.upgrades, o.upgrades ?? {});
            if (first.live) {
              first.live.upgrades = first.upgrades;
              if (first.live.color !== o.color) m.police && import('../ai/police').then((p) => p.repaint(first.live!, o.color));
            }
          } else m.shops.addOwned(o.kind, o.color, null, o.upgrades);
        });
        for (const c of d.clothes ?? []) m.shops.clothesOwned.add(c);
        Object.assign(m.shops.equipped, d.equipped ?? {});
        m.shops.applyClothes();
      },
    });

  if (m.company)
    save.register({
      key: 'company',
      save: () => ({ level: m.company.level, staff: m.company.staff, fleet: m.company.fleet, luxuries: [...m.company.luxuries] }),
      load: (d) => {
        m.company.level = d.level ?? 0;
        m.company.staff = d.staff ?? [];
        m.company.fleet = d.fleet ?? 0;
        for (const l of d.luxuries ?? []) m.company.luxuries.add(l);
        m.company.refresh?.();
      },
    });

  if (m.story) save.register({ key: 'story', save: () => [...m.story.completed], load: (d) => (d ?? []).forEach((x: string) => m.story.completed.add(x)) });
  if (m.pickups) save.register({ key: 'collectibles', save: () => [...m.pickups.collected], load: (d) => m.pickups.placeCollectibles(d ?? []) });
  if (m.tutorial) save.register({ key: 'tutorial', save: () => m.tutorial.done, load: (d) => d && m.tutorial.skip() });
  if (m.attic?.getState) save.register({ key: 'attic', save: () => m.attic.getState(), load: (d) => d && m.attic.setState(d) });
  if (m.loot) save.register({ key: 'loot', save: () => ({ cash: m.loot.cash, packages: m.loot.packages, left: m.loot.deadline - game.time.elapsed }), load: (d) => {
    m.loot.cash = d.cash ?? 0;
    m.loot.packages = d.packages ?? 0;
    m.loot.deadline = game.time.elapsed + (d.left ?? 0);
  } });
}
