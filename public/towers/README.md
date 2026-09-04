# Tower artwork drop-in directory

No game or third-party artwork is included. The current product uses original,
code-rendered tactical emblems from `components/TowerVisual.tsx` for every tower.
These are stylized fallback marks, not depictions of the game's actual models.

To integrate approved artwork:

1. Establish redistribution permission and record the source, author, and license.
2. Add an optimized local image here using the slug in `docs/tower-asset-inventory.md`.
3. Add the canonical tower name to `TOWER_ARTWORK` in `lib/tower-visuals.ts`, with
   `imageSrc`, `source`, and `license`. Image paths must begin with `/towers/`.
4. Prefer square transparent WebP or PNG, approximately 320–640 px. The UI reserves
   a square frame and uses Next Image. Never add an image path before its file exists.
5. Run the asset completeness test. Check the lineup, picker, hero, and path.

Failed image loads automatically render the same fallback emblem. No hotlinks or
guessed image URLs are used. Strategic data and API responses contain no asset paths.
