import { describe, expect, it } from 'vitest';
import { BackSide } from 'three';
import { BlockKind } from '../../src/config/blocks.ts';
import { BlockField } from '../../src/render/blocks.ts';
import { decalRect } from '../../src/render/decals.ts';
import { CANDY_THEME } from '../../src/render/themes/candy.ts';
import { EMBER_THEME } from '../../src/render/themes/ember.ts';
import { gridFrom } from '../helpers/grid.ts';

/**
 * The candy skin draws three instanced meshes over one set of transforms: the
 * blocks, a back-faced outline hull and a decal plane. They share the *same*
 * `InstancedBufferAttribute` object, but three.js does not propagate `count`
 * or `visible`, so the field has to mirror those by hand after every add,
 * removal and reset — exactly like the hit-flash slot bookkeeping.
 *
 * No WebGL context is needed: geometries, materials and instanced meshes are
 * plain CPU objects until something renders them.
 */
const MAP = [
  '@ddd',
  'dsdc',
  'dgBd',
  'ddrd',
];

function candyField(): BlockField {
  return new BlockField(4, CANDY_THEME);
}

describe('BlockField outline hull and decals', () => {
  it('gives ember no hull and no decals', () => {
    const field = new BlockField(4, EMBER_THEME);
    expect(field.hull).toBeNull();
    expect(field.decals).toBeNull();
    field.dispose();
  });

  it('shares one instanceMatrix between the mesh, the hull and the decals', () => {
    const field = candyField();
    expect(field.hull).not.toBeNull();
    expect(field.decals).not.toBeNull();
    expect(field.hull!.instanceMatrix).toBe(field.mesh.instanceMatrix);
    expect(field.decals!.instanceMatrix).toBe(field.mesh.instanceMatrix);
    expect(field.hull!.instanceColor).toBeNull();
    field.dispose();
  });

  it('mirrors count and visibility through sync, hide and reset', () => {
    const field = candyField();
    const grid = gridFrom(MAP, { floor: true });

    field.sync(grid, 1);
    const filled = field.count;
    expect(filled).toBeGreaterThan(0);
    expect(field.hull!.count).toBe(filled);
    expect(field.decals!.count).toBe(filled);
    expect(field.hull!.visible).toBe(field.mesh.visible);
    expect(field.decals!.visible).toBe(field.mesh.visible);

    // A removal swaps the last live slot into the hole and shrinks `count`.
    field.hide(grid.index(1, 1));
    expect(field.count).toBe(filled - 1);
    expect(field.hull!.count).toBe(filled - 1);
    expect(field.decals!.count).toBe(filled - 1);

    field.reset(4);
    expect(field.count).toBe(0);
    expect(field.hull!.count).toBe(0);
    expect(field.decals!.count).toBe(0);
    expect(field.hull!.visible).toBe(field.mesh.visible);
    expect(field.decals!.visible).toBe(field.mesh.visible);
    field.dispose();
  });

  it('pins the hull material params and the candy extrude distance', () => {
    expect(CANDY_THEME.outline.enabled).toBe(true);
    expect(CANDY_THEME.outline.extrude).toBe(0.045);
    const field = candyField();
    const material = field.hull!.material;
    expect(material.side).toBe(BackSide);
    expect(material.fog).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(field.hull!.renderOrder).toBe(1);
    field.dispose();
  });

  it('maps decal tiles to the atlas rows the canvas actually paints (flipY)', () => {
    // CanvasTexture keeps flipY=true, so canvas row 0 (painted at the top)
    // sits at v ∈ [0.75, 1] and each later row a quarter-step lower.
    expect(decalRect(BlockKind.Bomb, 0)).toEqual([0.25, 0.75, 0.25, 0.25]);
    expect(decalRect(BlockKind.Repair, 0)).toEqual([0, 0.5, 0.25, 0.25]);
    expect(decalRect(BlockKind.Exit, 0)).toEqual([0, 0.25, 0.25, 0.25]);
    expect(decalRect(BlockKind.Dirt, 0)).toEqual([0, 0.75, 0.25, 0.25]);
  });

  it('rewrites the decal rect when a slot is recycled', () => {
    const field = candyField();
    const grid = gridFrom(MAP, { floor: true });
    field.sync(grid, 1);

    const bombCell = grid.index(2, 2);
    const bombSlot = field.slotOf(bombCell);
    expect(bombSlot).toBeGreaterThanOrEqual(0);
    const bombRect = field.decalRectAt(bombSlot);
    expect(bombRect).not.toEqual(decalRect(BlockKind.Dirt, 0));
    expect(bombRect).toEqual(decalRect(BlockKind.Bomb, 0));

    // Remove the *last* slot's cell so the bomb keeps its slot, then remove the
    // bomb: the last live instance is moved into the bomb's slot and its decal
    // rect must follow, otherwise the recycled slot keeps wearing bomb eyes.
    field.hide(bombCell);
    const movedCell = field.cellOf(bombSlot);
    expect(movedCell).toBeGreaterThanOrEqual(0);
    const row = (movedCell / 4) | 0;
    const col = movedCell - row * 4;
    const expected = decalRect(grid.kindAt(col, row), grid.variantAt(col, row));
    expect(field.decalRectAt(bombSlot)).toEqual(expected);
    field.dispose();
  });
});
