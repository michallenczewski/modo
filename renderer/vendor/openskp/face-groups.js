import { triangulateFace3D } from './triangulator.js';
import { reconstructLoopVertices } from './geometry.js';
import { SkpParseError } from './errors.js';
import { faceUvBasis, computeFaceUv } from './model.js';
/** Edge display-flag bit SketchUp sets on an edge whose faces render as one
 * smooth surface (Soften/Smooth Edges' "Smooth normals"). */
const SMOOTH_EDGE = 0x10;
/**
 * Per-corner normals across smooth edges.
 *
 * SketchUp renders the faces either side of an edge flagged smooth as one
 * continuous surface: their shared vertices get the average of the faces'
 * normals, while a hard edge keeps a crease. Corners (vertex, face) joined
 * through a smooth edge between two faces that face the same way are merged
 * into one surface, and each surface's normal at a vertex is the normalised
 * sum of its faces' normals. Returns null when the definition has no smooth
 * edge, so a faceted model pays nothing.
 */
function smoothCornerNormals(builder, ctx) {
    const edgeFaces = new Map();
    for (const [fId, face] of builder.faces.entries()) {
        if (ctx.respectVisibility && face.hidden)
            continue;
        for (const loop of face.loops) {
            for (const { edgeId } of loop) {
                if (((builder.edgeFlags.get(edgeId) ?? 0) & SMOOTH_EDGE) === 0)
                    continue;
                let faces = edgeFaces.get(edgeId);
                if (!faces)
                    edgeFaces.set(edgeId, (faces = []));
                if (!faces.includes(fId))
                    faces.push(fId);
            }
        }
    }
    if (edgeFaces.size === 0)
        return null;
    const parent = new Map();
    const touch = (key) => {
        if (!parent.has(key))
            parent.set(key, key);
        return key;
    };
    const find = (key) => {
        let root = key;
        while (parent.get(root) !== root)
            root = parent.get(root);
        while (parent.get(key) !== root) {
            const next = parent.get(key);
            parent.set(key, root);
            key = next;
        }
        return root;
    };
    for (const [edgeId, faces] of edgeFaces) {
        if (faces.length !== 2)
            continue;
        const ends = builder.edges.get(edgeId);
        if (!ends)
            continue;
        const a = builder.faces.get(faces[0]).normal;
        const b = builder.faces.get(faces[1]).normal;
        // Faces that face opposite ways across the edge (a fold or a reversed
        // face) would cancel each other's normal out.
        if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] <= 0)
            continue;
        for (const vId of ends) {
            if (vId === null)
                continue;
            const left = find(touch(`${vId}:${faces[0]}`));
            const right = find(touch(`${vId}:${faces[1]}`));
            if (left !== right)
                parent.set(left, right);
        }
    }
    const sums = new Map();
    for (const key of parent.keys()) {
        const normal = builder.faces.get(Number(key.slice(key.indexOf(':') + 1))).normal;
        const root = find(key);
        const sum = sums.get(root);
        if (sum) {
            sum[0] += normal[0];
            sum[1] += normal[1];
            sum[2] += normal[2];
        }
        else {
            sums.set(root, [normal[0], normal[1], normal[2]]);
        }
    }
    return (vId, fId) => {
        const key = `${vId}:${fId}`;
        if (!parent.has(key))
            return null;
        const root = find(key);
        const sum = sums.get(root);
        const length = Math.hypot(sum[0], sum[1], sum[2]) || 1;
        return { root, n: [sum[0] / length, sum[1] / length, sum[2] / length] };
    };
}
/**
 * Group a definition's faces by resolved material identity, in local space.
 *
 * A face whose front/back resolve to the SAME colour is emitted once with
 * `doubleSided` set; a face whose sides genuinely differ is emitted as two
 * single-sided triangle sets (one normal-wound front, one reverse-wound
 * back) so each side keeps its own colour - unless `ctx.frontSideOnly`,
 * which always takes the first branch with the front material.
 *
 * Vertices on a surface SketchUp smooths take that surface's normal, so
 * curved geometry shades smoothly instead of faceted.
 */
export function buildLocalFaceGroups(builder, ctx) {
    const faceGroups = new Map();
    const smoothCorner = smoothCornerNormals(builder, ctx);
    const addSide = (triangles, fn, color, doubleSided, reverse, mat, uvTransform, xr, yr, fId) => {
        // faces are batched per emitted material, so the texture has to be
        // part of the key too - otherwise two differently-textured faces with
        // the same average colour end up in one primitive with one image
        const texIndex = ctx.textureIndexFor(mat?.texture);
        // Two independent SketchUp mechanisms can reduce a material's opacity:
        // the plain RGBA colour record's alpha byte (older/simple materials,
        // and what the writer's addMaterial(rgba) sets), and the newer XML
        // material definition's own `trans`/`useTrans` attribute (surfaced as
        // Material.transparency, already resolved - see parser.test.ts's
        // "useTrans gating" tests). A real file only ever populates one of the
        // two for a given material, but multiplying both is safe either way:
        // the untouched one defaults to fully-opaque (255 / 1.0), so it never
        // silently darkens a material that only used the other mechanism.
        const colorAlpha = color.a !== undefined ? color.a / 255 : 1.0;
        const transparency = colorAlpha * (mat?.transparency ?? 1.0);
        const colorKey = `${color.r},${color.g},${color.b},${doubleSided},${texIndex ?? -1},${transparency}`;
        let group = faceGroups.get(colorKey);
        if (!group) {
            group = {
                color,
                transparency,
                doubleSided,
                textureIndex: texIndex,
                localVerts: [],
                localUvs: [],
                normalsAccum: [],
                localFaces: [],
                localVMap: new Map(),
            };
            faceGroups.set(colorKey, group);
        }
        const tex = mat?.texture;
        const tileW = tex && tex.width > 1e-9 ? tex.width : 1;
        const tileH = tex && tex.height > 1e-9 ? tex.height : 1;
        const sideNormal = reverse
            ? [-fn[0], -fn[1], -fn[2]]
            : fn;
        // Vertices are deduped per (vId, uv) rather than just vId: UVs are
        // inherently per-face, so a vertex position shared by two faces
        // that disagree on texture mapping must become two distinct
        // output vertices (glTF requires position/normal/uv aligned per
        // index).
        const faceLocalMap = new Map();
        for (const tri of triangles) {
            const triIds = reverse ? [tri[0], tri[2], tri[1]] : tri;
            const faceIndices = [];
            for (const vId of triIds) {
                if (!builder.vertices.has(vId))
                    continue;
                let idx = faceLocalMap.get(vId);
                if (idx === undefined) {
                    const p = builder.vertices.get(vId);
                    const [u, v] = computeFaceUv(p, xr, yr, uvTransform, tileW, tileH);
                    // A smoothed corner shares its vertex only with corners of the
                    // same surface: a hard edge between two smoothed surfaces still
                    // splits the vertex so each side keeps its own normal.
                    const smooth = smoothCorner?.(vId, fId) ?? null;
                    const normal = smooth
                        ? reverse
                            ? [-smooth.n[0], -smooth.n[1], -smooth.n[2]]
                            : smooth.n
                        : sideNormal;
                    const key = smooth ? `${vId},${u},${v},${smooth.root}` : `${vId},${u},${v}`;
                    idx = group.localVMap.get(key);
                    if (idx === undefined) {
                        group.localVerts.push(p);
                        group.localUvs.push([u, v]);
                        group.normalsAccum.push([normal[0], normal[1], normal[2]]);
                        idx = group.localVerts.length - 1;
                        group.localVMap.set(key, idx);
                    }
                    else {
                        const accum = group.normalsAccum[idx];
                        accum[0] += normal[0];
                        accum[1] += normal[1];
                        accum[2] += normal[2];
                    }
                    faceLocalMap.set(vId, idx);
                }
                faceIndices.push(idx);
            }
            if (faceIndices.length === 3) {
                group.localFaces.push(faceIndices);
            }
        }
    };
    for (const [fId, fData] of builder.faces.entries()) {
        // A face explicitly hidden in SketchUp. Skipped only on request: the
        // baked output every existing consumer reads includes these, so
        // filtering by default would silently change what they render.
        if (ctx.respectVisibility && fData.hidden)
            continue;
        const fallbackColor = ctx.inheritedMaterial?.color ?? ctx.fallbackLayerColor;
        // A face with no material of its own is painted by the instance
        // (SketchUp's "paint the component"). Inheriting the whole material -
        // not just its colour - is what gives computeFaceUv the texture's tile
        // size: without it tileW/tileH fall back to 1 and the UVs come out in
        // raw inches, so a 1.9 m decor sheet tiles ~150 times across a 600 mm
        // panel instead of covering a third of it.
        const frontMat = ctx.resolveMaterial(fData.materialId) ?? ctx.inheritedMaterial;
        const backMat = ctx.resolveMaterial(fData.backMaterialId) ?? ctx.inheritedMaterial;
        const frontColor = frontMat?.color ?? fallbackColor;
        const backColor = backMat?.color ?? fallbackColor;
        const loops = [];
        for (const loop of fData.loops) {
            const loopVerts = reconstructLoopVertices(loop, builder.edges);
            if (loopVerts.length > 0) {
                loops.push(loopVerts);
            }
        }
        if (loops.length === 0)
            continue;
        let triangles;
        try {
            triangles = triangulateFace3D(builder.vertices, loops, fData.normal);
        }
        catch (e) {
            throw new SkpParseError(`Failed to triangulate face: ${e.message}`, {
                stage: 'build_scene',
                definitionId: ctx.definitionId,
                cause: e,
            });
        }
        const fn = fData.normal;
        const { xr, yr } = faceUvBasis(fn);
        const uvTransform = fData.uvTransform;
        const uvTransformBack = fData.uvTransformBack;
        const sameColor = frontColor.r === backColor.r && frontColor.g === backColor.g && frontColor.b === backColor.b;
        if (sameColor || ctx.frontSideOnly) {
            addSide(triangles, fn, frontColor, true, false, frontMat, uvTransform, xr, yr, fId);
        }
        else {
            addSide(triangles, fn, frontColor, false, false, frontMat, uvTransform, xr, yr, fId);
            addSide(triangles, fn, backColor, false, true, backMat, uvTransformBack, xr, yr, fId);
        }
    }
    return faceGroups;
}
