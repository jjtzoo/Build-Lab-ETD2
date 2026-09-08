# Latest-live balance reconciliation

This repository targets the live Element TD 2 balance state available on
September 8, 2026. The runtime data is reconciled through the official Steam
announcements listed below.

## Official sources applied

- Version 1.9.4, June 28, 2024:
  <https://store.steampowered.com/news/app/1018830/view/5842939267313888970>
- Version 1.9.4.1, August 10, 2024:
  <https://store.steampowered.com/news/app/1018830/view/5963414363397662155>
- Version 1.9.5, September 5, 2025:
  <https://store.steampowered.com/news/app/1018830/view/1809869180064222>
- Version 1.9.6, December 13, 2025:
  <https://store.steampowered.com/news/app/1018830/view/1818752592130559>
- Small Update, August 7, 2026:
  <https://store.steampowered.com/news/app/1018830/view/1840310314343953>
- Another Small Update, August 19, 2026:
  <https://store.steampowered.com/news/app/1018830/view/1841579228661614>

The August 19 update contains no tower balance changes. Therefore the August 7
Plague damage increase is the latest official tower balance change found.

## Phase 0-4 fact corrections

- Life Altar buff duration: 15 seconds to 12 seconds. With the unchanged
  60-second cooldown, factual duty cycle is now 0.2.
- Nova and Windstorm slow duration: 3 seconds to 5 seconds.
- Rage damage amplification: 20% to the live 28% value after the 1.9.4 and
  1.9.4.1 changes.
- Global range bands: legacy 750 became live 875; legacy 900 became live 1000;
  legacy 1150 became live 1125. Howitzer is the documented 1750-range exception.
- Basic attack damage corrected for Ice, Howitzer, Astral, Runic, Jinx,
  Incantation, Corrosion, Root, Phantom Zone, Nuclear, Life Altar and Shredder.
- Poison retains 130 / 520 / 2080 after Version 1.9.6 reversed its Version 1.9.5
  basic-damage buff. Plague remains 800 after the August 7, 2026 update.

Only explicitly documented facts were changed. Ability facts not established by
these sources remain absent or unknown rather than inferred.
