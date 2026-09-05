import { BoxGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { extrudeAlongNormals } from '../../src/render/outlineGeometry.ts';

/**
 * The candy outline is a back-faced hull of the same cube. It has to be a
 * *geometry* offset, not an object scale: the hull shares the block field's
 * `instanceMatrix`, and scaling the object would scale every per-instance
 * translation with it — the whole field would spread apart.
 */
describe('extrudeAlongNormals', () => {
  it('pushes every vertex exactly `distance` along its normal', () => {
    const source = new BoxGeometry(1, 1, 1);
    const hull = extrudeAlongNormals(source, 0.045);

    const from = source.getAttribute('position');
    const to = hull.getAttribute('position');
    const normals = source.getAttribute('normal');
    expect(to.count).toBe(from.count);

    for (let i = 0; i < from.count; i++) {
      expect(to.getX(i)).toBeCloseTo(from.getX(i) + normals.getX(i) * 0.045, 6);
      expect(to.getY(i)).toBeCloseTo(from.getY(i) + normals.getY(i) * 0.045, 6);
      expect(to.getZ(i)).toBeCloseTo(from.getZ(i) + normals.getZ(i) * 0.045, 6);
    }
  });

  it('grows a unit cube by twice the distance on every axis', () => {
    const hull = extrudeAlongNormals(new BoxGeometry(1, 1, 1), 0.05);
    hull.computeBoundingBox();
    const box = hull.boundingBox;
    expect(box).not.toBeNull();
    expect(box!.max.x - box!.min.x).toBeCloseTo(1.1, 6);
    expect(box!.max.y - box!.min.y).toBeCloseTo(1.1, 6);
    expect(box!.max.z - box!.min.z).toBeCloseTo(1.1, 6);
  });

  it('leaves the source geometry untouched', () => {
    const source = new BoxGeometry(1, 1, 1);
    const before = source.getAttribute('position').getX(0);
    extrudeAlongNormals(source, 0.2);
    expect(source.getAttribute('position').getX(0)).toBe(before);
  });
});
