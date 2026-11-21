import { transformPoint, multiplyMatrices } from './transforms.js';
import { extractDynamicProperties, extractAttributeDictionaries, isGenericDefinitionName, findNameOverride, stringifyVffAttrValue } from './geometry.js';
import { buildLocalFaceGroups } from './face-groups.js';
import { SkpParseError } from './errors.js';
import { PROGRESS_INTERVAL, emitLog, emitProgress } from './observability.js';
/**
 * Whether SketchUp itself would DRAW this edge.
 *
 * SketchUp hides three kinds of edge: `hidden` (explicitly hidden), and
 * `soft`/`smooth` (the smoothing flags that make a faceted surface read as
 * curved). The last two are why a rounded model carries far more edges
 * than it appears to: every curve is triangles stitched together by edges
 * that exist to define the shape and are never shown.
 *
 * The flags are parsed and exposed on {@link Edge}, but nothing in this
 * library acts on them - an edge-consuming consumer (a wireframe or
 * hidden-line renderer built on {@link parseSkp} output) has to make the
 * call itself, and `edge.soft || edge.smooth || edge.hidden` is not
 * obvious as "SketchUp does not draw this" unless you already know the
 * format. Hence this helper.
 *
 * Measured across this repository's fixtures, 27.3% of edges are
 * non-drawable on aggregate - but that ranges from 0.2% on a mostly-flat
 * model to 66.1% on a curved-surface one, so the saving is concentrated
 * exactly where geometry is heaviest.
 *
 * ```ts
 * const model = parseSkp(buffer);
 * const visible = model.root.edges.filter(isDrawableEdge);
 * ```
 */
export function isDrawableEdge(edge) {
    return !edge.soft && !edge.smooth && !edge.hidden;
}
/**
 * Image type from the file's magic bytes. glTF only carries PNG and JPEG, so
 * anything else (TIFF from older SketchUp, say) reports null and the material
 * keeps its flat colour instead of embedding an image no viewer would read.
 */
export function sniffImageMime(data) {
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        return 'image/jpeg';
    }
    if (data.length >= 8 &&
        data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
        data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) {
        return 'image/png';
    }
    return null;
}
export function buildModelFromParsed(parsed) {
    const { version, units, layerColors, layerHidden, layerIdToName, pages, dimensions, materialIdToName, materialsMap, materialsByFolder, styles, defsDict, } = parsed;
    // Join the TLV material IDs (what Face.materialId references) onto the
    // parsed materials, so callers can resolve face -> material.
    // materialsMap/materialsByFolder may share the same Material object
    // reference for an alias, so setting `.id` here is visible through both.
    const materialsById = new Map();
    for (const [mId, mName] of materialIdToName.entries()) {
        const mat = materialsMap.get(mName) || materialsByFolder.get(mName);
        if (!mat)
            continue;
        if (mat.id === null) {
            mat.id = mId;
        }
        materialsById.set(mId, mat);
    }
    const finalLayersList = Array.from(layerColors.entries()).map(([name, c]) => ({
        name,
        color: { r: c[0], g: c[1], b: c[2] },
        hidden: layerHidden.get(name) ?? false,
    }));
    const finalMaterialsList = Array.from(materialsMap.values());
    // Convert pages (saved scenes) - hidden layer ids resolve to names;
    // unknown ids (stale refs) are dropped.
    const finalPagesList = pages.map((pg) => ({
        name: pg.name,
        eye: pg.eye,
        target: pg.target,
        up: pg.up,
        fov: pg.fov,
        parallel: pg.parallel,
        orthoHeight: pg.orthoHeight,
        hiddenLayers: pg.hiddenLayerIds
            .map((id) => layerIdToName.get(id))
            .filter((name) => name !== undefined),
    }));
    // Convert model-level linear dimensions (VFF; world space).
    const finalDimensionsList = dimensions.map((dm) => ({
        a: dm.a,
        b: dm.b,
        offset: dm.offset,
        planeX: dm.planeX,
        normal: dm.normal,
        text: dm.text,
        hidden: false,
    }));
    const finalDefinitions = new Map();
    let rootDefinition = null;
    for (const [id, d] of defsDict.entries()) {
        const defn = buildDefinition(typeof id === 'number' ? id : 0, d, layerIdToName);
        if (typeof id === 'number') {
            finalDefinitions.set(id, defn);
        }
        else {
            rootDefinition = defn;
        }
    }
    return {
        version,
        definitions: finalDefinitions,
        // The implicit top-level model definition: its instances are the
        // entities placed directly in the model (not inside any component/
        // group). Kept out of `definitions` (which is numeric-ID-only, one
        // entry per real component/group definition) and exposed here instead,
        // matching the .NET and Dart ports' `Root`/`root` field.
        root: rootDefinition ?? { id: 0, guid: 'ROOT', name: 'ROOT_MODEL', vertices: [], edges: [], faces: [], instances: [], sectionPlanes: [], texts: [], dimensions: [], constructionLines: [], constructionPoints: [], arcs: new Map(), isImage: false, isGroup: false, alwaysFacesCamera: false, shadowsFaceSun: false },
        layers: finalLayersList,
        pages: finalPagesList,
        dimensions: finalDimensionsList,
        materials: finalMaterialsList,
        materialsById,
        styles,
        units,
    };
}
function buildDefinition(id, d, layerIdToName) {
    const vertices = Array.from(d.builder.vertices.entries()).map(([vId, [x, y, z]]) => ({
        id: vId,
        x,
        y,
        z,
    }));
    const edges = Array.from(d.builder.edges.entries()).map(([eId, [v1, v2]]) => {
        const flags = d.builder.edgeFlags.get(eId) ?? 0;
        return {
            id: eId,
            v1Id: v1 ?? 0,
            v2Id: v2 ?? 0,
            soft: (flags & 0x08) !== 0,
            smooth: (flags & 0x10) !== 0,
            hidden: (flags & 0x01) !== 0,
            curveId: d.builder.edgeCurves?.get(eId) ?? null,
        };
    });
    const arcs = new Map();
    for (const [curveId, f] of d.builder.arcCurves ?? []) {
        const radius = Math.hypot(f.xAxis[0], f.xAxis[1], f.xAxis[2]);
        const sweep = (((f.endAngle - f.startAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        arcs.set(curveId, {
            center: [...f.center],
            normal: [...f.normal],
            xAxis: [...f.xAxis],
            yAxis: [...f.yAxis],
            startAngle: f.startAngle,
            endAngle: f.endAngle,
            radius,
            isFullCircle: Math.min(sweep, 2 * Math.PI - sweep) < 1e-9,
        });
    }
    const faces = Array.from(d.builder.faces.entries()).map(([fId, fData]) => ({
        id: fId,
        loops: fData.loops,
        normal: fData.normal,
        materialId: fData.materialId ?? null,
        backMaterialId: fData.backMaterialId ?? null,
        uvTransform: fData.uvTransform ?? null,
        uvTransformBack: fData.uvTransformBack ?? null,
        uvProjected: fData.uvProjected ?? false,
        uvProjectedBack: fData.uvProjectedBack ?? false,
        hidden: fData.hidden ?? false,
    }));
    const instances = d.builder.instances.map((inst) => ({
        name: inst.name,
        refIdx: inst.refIdx,
        guid: inst.refGuid,
        matrix: inst.matrix,
        materialId: inst.materialId,
        hidden: inst.hidden ?? false,
        layer: (inst.layerId != null ? layerIdToName?.get(inst.layerId) : undefined) ?? '',
        properties: inst.properties ?? {},
    }));
    const sectionPlanes = (d.builder.sectionPlanes || []).map((sp) => ({
        plane: sp.plane || [0, 0, 1, 0],
        name: sp.name || '',
        label: sp.label || '',
        hidden: sp.hidden || false,
    }));
    const texts = (d.builder.texts || []).map((txt) => ({
        text: txt.text || '',
        hidden: txt.hidden || false,
    }));
    const dimensions = (d.builder.dimensions || []).map((dim) => ({
        text: dim.text || '',
        hidden: dim.hidden || false,
        a: null,
        b: null,
        offset: 0,
        planeX: null,
        normal: null,
    }));
    const constructionLines = (d.builder.constructionLines || []).map((cl) => ({
        point: cl.point,
        direction: cl.direction,
        start: cl.start,
        end: cl.end,
    }));
    const constructionPoints = (d.builder.constructionPoints || []).map((cp) => ({
        position: cp.position,
    }));
    return {
        id,
        guid: d.guid,
        name: d.name,
        vertices,
        edges,
        faces,
        instances,
        sectionPlanes,
        texts,
        dimensions,
        constructionLines,
        constructionPoints,
        arcs,
        isImage: d.isImage,
        isGroup: d.isGroup || false,
        alwaysFacesCamera: d.alwaysFacesCamera,
        shadowsFaceSun: d.shadowsFaceSun || false,
    };
}
/** Inverse of a row-major 3x3 matrix, via the cofactor/adjugate method. */
function invertMatrix3x3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) {
        return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    const invDet = 1 / det;
    return [
        (e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet,
        (f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet,
        (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet,
    ];
}
/** Face-plane basis vectors (xr, yr) for UV projection, from a face
 * normal. See `Face.uvTransform`'s docs for the recipe this implements.
 * Exported for edit.ts's own UV replay, which needs the identical basis
 * a source face's uvTransform was computed against. */
export function faceUvBasis(n) {
    const [nx, ny, nz] = n;
    const cx = -ny;
    const cy = nx;
    const clen = Math.sqrt(cx * cx + cy * cy);
    let xr;
    let yr;
    if (clen < 1e-9) {
        xr = [1, 0, 0];
        yr = [0, nz >= 0 ? 1 : -1, 0];
    }
    else {
        xr = [cx / clen, cy / clen, 0];
        yr = [ny * xr[2] - nz * xr[1], nz * xr[0] - nx * xr[2], nx * xr[1] - ny * xr[0]];
    }
    return { xr, yr };
}
/** UV of point p (inches, local/object space) on a face with the given
 * plane basis, per-face uvTransform (or null for the default projection),
 * and material tile size (inches). Exported for edit.ts's own UV replay. */
export function computeFaceUv(p, xr, yr, uvTransform, tileW, tileH) {
    const px = p[0] * xr[0] + p[1] * xr[1] + p[2] * xr[2];
    const py = p[0] * yr[0] + p[1] * yr[1] + p[2] * yr[2];
    if (!uvTransform) {
        return [px / tileW, py / tileH];
    }
    const inv = invertMatrix3x3(uvTransform);
    const u = px * inv[0] + py * inv[3] + inv[6];
    const v = px * inv[1] + py * inv[4] + inv[7];
    let q = px * inv[2] + py * inv[5] + inv[8];
    if (Math.abs(q) < 1e-12)
        q = 1;
    return [u / q / tileW, v / q / tileH];
}
/**
 * Bake every instance actually placed in the model into world-space,
 * triangulated mesh data - SketchUp's component/group nesting fully
 * resolved and flattened, ready for a GLB export or any other renderer.
 *
 * This walks the *entire* placed scene graph, so for a file that reuses a
 * handful of definitions across many thousands of instances, the output
 * here can be far larger than the file's raw (un-instanced) geometry -
 * that's why it's a separate, opt-in step from {@link buildModelFromParsed}
 * rather than something every parse() pays for.
 */
export function buildSceneFromParsed(parsed, options) {
    const t0 = Date.now();
    const { layerColors, layerIdToName, materialIdToName, materialsMap, materialsByFolder, defsDict } = parsed;
    emitLog(options, 'info', `Building scene: ${defsDict.size} definitions available`);
    const instanceCounter = { count: 0 };
    // Instantiate scene hierarchy and gather mesh metadata & GLB primitives
    const meshCounter = { count: 0 };
    const meshIndex = {};
    const glbPrimitives = [];
    // Instance path -> (properties, name) updates, recorded in O(1) per
    // instance and applied once after instantiation completes (see the
    // lookup pass below), instead of scanning the entire meshIndex per
    // placed instance - an O(instances x meshes) substring scan that both
    // dominated build_scene on models with many placed instances and could
    // match the wrong meshes (a shallow instance's path is always a string
    // prefix of every deeper descendant's path too, so `includes()` matched
    // far more than intended - see openskp#240).
    const pathUpdates = new Map();
    const getLayerColor = (name) => {
        const c = layerColors.get(name) || [136, 136, 136];
        return { r: c[0], g: c[1], b: c[2] };
    };
    // Textures are deduplicated by their bytes: the same image routinely backs
    // several materials, and re-embedding it per material would multiply the
    // export size for nothing.
    const textures = [];
    const textureIndexByKey = new Map();
    function textureIndexFor(tex) {
        if (!tex || !tex.data || tex.data.length === 0)
            return null;
        const mimeType = sniffImageMime(tex.data);
        if (mimeType === null)
            return null; // a format glTF cannot carry
        // length plus a short byte prefix is enough to tell real images apart
        // without hashing megabytes on every face
        const head = Array.from(tex.data.subarray(0, 16)).join(',');
        const key = `${tex.data.length}:${head}`;
        const hit = textureIndexByKey.get(key);
        if (hit !== undefined)
            return hit;
        const idx = textures.length;
        textures.push({ data: tex.data, mimeType, filename: tex.filename });
        textureIndexByKey.set(key, idx);
        return idx;
    }
    const colorToMaterialIndex = new Map();
    const gltfMaterials = [];
    // Accumulated while positions are written, so bounds cost no extra pass
    // over the vertex data.
    const boundsMin = [Infinity, Infinity, Infinity];
    const boundsMax = [-Infinity, -Infinity, -Infinity];
    // Definitions currently being instantiated on the active recursion path
    // (not "ever visited" - the same definition legitimately reused by
    // sibling instances is fine). Guards against a component that directly
    // or transitively instances itself, which would otherwise recurse until
    // the stack overflows.
    const activeDefinitions = new Set();
    function getMaterialIndex(color, doubleSided, textureIndex, transparency = 1.0) {
        // The texture is part of the identity, not just the colour: two different
        // images can average to the same RGB (real files do this - two fabrics
        // both resolving to 141,141,141), and keying on colour alone would merge
        // them into one material and lose one of the images.
        const key = `${color.r},${color.g},${color.b},${doubleSided},${textureIndex ?? -1},${transparency}`;
        if (colorToMaterialIndex.has(key)) {
            return colorToMaterialIndex.get(key);
        }
        const idx = gltfMaterials.length;
        const pbr = {
            baseColorFactor: [color.r / 255, color.g / 255, color.b / 255, transparency],
            metallicFactor: 0.0,
            roughnessFactor: 0.8,
        };
        // baseColorFactor stays as the resolved colour even with a texture
        // attached: glTF multiplies the two, and SketchUp's own colorized
        // materials rely on exactly that tint. Overwriting it with white would
        // also drop the colour every existing consumer of this exporter reads.
        if (textureIndex !== null) {
            pbr.baseColorTexture = { index: textureIndex };
        }
        const material = { pbrMetallicRoughness: pbr };
        if (doubleSided)
            material.doubleSided = true;
        // glTF's default alphaMode is OPAQUE, which tells a conformant renderer
        // to ignore alpha entirely - both the material's own opacity and any
        // texture's alpha channel. Genuinely translucent materials (glass,
        // water) need BLEND so baseColorFactor's alpha (and the texture's, if
        // any) actually takes effect. A textured-but-otherwise-opaque material
        // gets MASK instead: many SketchUp Warehouse assets (tree foliage,
        // fences, signage) rely on the image's own alpha channel to cut a
        // shape out of an otherwise flat quad, and without MASK a renderer
        // would show the full rectangle. MASK is a no-op for a texture with no
        // real cutout - a fully-opaque alpha channel (or none, as in JPEG)
        // stays above the cutoff everywhere - so this is safe to set
        // unconditionally rather than trying to detect which textures need it.
        if (transparency < 1.0) {
            material.alphaMode = 'BLEND';
        }
        else if (textureIndex !== null) {
            material.alphaMode = 'MASK';
        }
        gltfMaterials.push(material);
        colorToMaterialIndex.set(key, idx);
        return idx;
    }
    function instantiate(defId, currentMatrix, parentLayer = 'Layer0', pathName = 'ROOT', inheritedMaterial) {
        const d = defsDict.get(defId);
        if (!d)
            return [];
        const builder = d.builder;
        if (builder.faces.size > 0) {
            // Group faces sharing a resolved (color, doubleSided) pair into one
            // mesh each - same grouping the C++ reference uses (the only port
            // that already had this before this port): a face whose front/back
            // resolve to the SAME color is emitted once, with its glTF material
            // marked doubleSided so it's visible from either side without
            // needing duplicate geometry; a face whose front/back genuinely
            // differ is emitted as TWO single-sided triangle sets - one
            // normal-wound using the front material, one reverse-wound using
            // the back material - so each side renders its own correct color
            // instead of the front material leaking onto (or the back
            // vanishing from) the far side.
            //
            // The grouping itself lives in face-groups.ts and is shared verbatim
            // with buildInstancedSceneFromParsed: it is entirely local-space
            // work, and the ONLY difference between the two paths is what
            // happens next - here each group's vertices get `currentMatrix`
            // applied and become a world-space primitive, while the instanced
            // path leaves them local and puts the transform on the node.
            const faceGroups = buildLocalFaceGroups(builder, {
                resolveMaterial: (matId) => resolveMaterialFromMaps(matId, materialIdToName, materialsMap, materialsByFolder),
                textureIndexFor,
                inheritedMaterial,
                fallbackLayerColor: getLayerColor(parentLayer),
                definitionId: defId,
                respectVisibility: options?.respectEdgeVisibility,
                frontSideOnly: options?.frontSideOnly,
            });
            for (const group of faceGroups.values()) {
                if (group.localFaces.length === 0)
                    continue;
                const isRoot = pathName === 'ROOT';
                const tx = isRoot ? 0 : (currentMatrix[9] ?? 0) * 25.4;
                const ty = isRoot ? 0 : (currentMatrix[10] ?? 0) * 25.4;
                const tz = isRoot ? 0 : (currentMatrix[11] ?? 0) * 25.4;
                let safePath = pathName.replace(/ \/ /g, '__').replace(/ /g, '_');
                if (safePath.length > 80)
                    safePath = safePath.slice(0, 80);
                const colorSuffix = faceGroups.size > 1
                    ? `_${group.color.r}_${group.color.g}_${group.color.b}_${group.doubleSided ? 'ds' : 'ss'}`
                    : '';
                const geomName = `mesh_${meshCounter.count}_${safePath}_${parentLayer}${colorSuffix}`;
                meshCounter.count++;
                meshIndex[geomName] = {
                    name: isRoot ? 'ROOT' : pathName.split(' / ').pop() || '',
                    definitionName: d.name || '',
                    layer: parentLayer,
                    positionMm: [Math.round(tx * 100) / 100, Math.round(ty * 100) / 100, Math.round(tz * 100) / 100],
                    properties: {},
                    attributeDictionaries: {},
                    path: pathName,
                };
                const scale = 0.0254;
                const positions = new Float32Array(group.localVerts.length * 3);
                const normals = new Float32Array(group.localVerts.length * 3);
                const uvs = new Float32Array(group.localVerts.length * 2);
                const vertexNormalsAccum = group.normalsAccum;
                for (let i = 0; i < group.localVerts.length; i++) {
                    const v = group.localVerts[i];
                    const pt = transformPoint(currentMatrix, v);
                    positions[i * 3] = pt[0] * scale;
                    positions[i * 3 + 1] = pt[2] * scale;
                    positions[i * 3 + 2] = -pt[1] * scale;
                    // Read back out of the Float32Array rather than using the float64
                    // values above: bounds must describe the vertex data as STORED, so
                    // that a consumer sweeping `positions` itself gets the identical
                    // answer rather than one off by a float32 ulp.
                    const wx = positions[i * 3];
                    const wy = positions[i * 3 + 1];
                    const wz = positions[i * 3 + 2];
                    if (wx < boundsMin[0])
                        boundsMin[0] = wx;
                    if (wy < boundsMin[1])
                        boundsMin[1] = wy;
                    if (wz < boundsMin[2])
                        boundsMin[2] = wz;
                    if (wx > boundsMax[0])
                        boundsMax[0] = wx;
                    if (wy > boundsMax[1])
                        boundsMax[1] = wy;
                    if (wz > boundsMax[2])
                        boundsMax[2] = wz;
                    uvs[i * 2] = group.localUvs[i][0];
                    uvs[i * 2 + 1] = group.localUvs[i][1];
                    const rawNorm = vertexNormalsAccum[i];
                    const normLen = Math.sqrt(rawNorm[0] ** 2 + rawNorm[1] ** 2 + rawNorm[2] ** 2);
                    const n = normLen > 1e-6 ? [rawNorm[0] / normLen, rawNorm[1] / normLen, rawNorm[2] / normLen] : [0, 0, 1];
                    const nx = currentMatrix[0] * n[0] + currentMatrix[1] * n[1] + currentMatrix[2] * n[2];
                    const ny = currentMatrix[3] * n[0] + currentMatrix[4] * n[1] + currentMatrix[5] * n[2];
                    const nz = currentMatrix[6] * n[0] + currentMatrix[7] * n[1] + currentMatrix[8] * n[2];
                    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
                    if (l > 1e-6) {
                        normals[i * 3] = nx / l;
                        normals[i * 3 + 1] = nz / l;
                        normals[i * 3 + 2] = -ny / l;
                    }
                    else {
                        normals[i * 3] = 0;
                        normals[i * 3 + 1] = 1;
                        normals[i * 3 + 2] = 0;
                    }
                }
                const indices = new Uint32Array(group.localFaces.length * 3);
                for (let i = 0; i < group.localFaces.length; i++) {
                    indices[i * 3] = group.localFaces[i][0];
                    indices[i * 3 + 1] = group.localFaces[i][1];
                    indices[i * 3 + 2] = group.localFaces[i][2];
                }
                const materialIndex = getMaterialIndex(group.color, group.doubleSided, group.textureIndex, group.transparency);
                glbPrimitives.push({
                    positions,
                    normals,
                    uvs,
                    indices,
                    materialIndex,
                    geomName,
                });
            }
        }
        const childInstancesInfo = [];
        for (const inst of builder.instances) {
            const refIdx = inst.refIdx;
            const instMatrix = inst.matrix;
            const newMatrix = multiplyMatrices(currentMatrix, instMatrix);
            let lName = parentLayer;
            let instMaterial = inheritedMaterial;
            // Legacy (pre-2021 MFC) instances carry a precomputed `properties`
            // record (see legacy.ts's extractLegacyDynamicProperties) - VFF
            // instances don't set this, so this stays {} for them and gets
            // overwritten below via the D007/DC05 TLV walk instead.
            let properties = { ...(inst.properties || {}) };
            // Layer and instance-material resolution use the fields already
            // extracted onto the builder instance (same source data for VFF -
            // D007/D207/D107 - read once in geometry.ts; legacy files populate
            // the same fields directly since they have no TLV children).
            if (inst.layerId !== null && inst.layerId !== undefined) {
                lName = layerIdToName.get(inst.layerId) || parentLayer;
            }
            if (inst.materialId !== null && inst.materialId !== undefined) {
                const matName = materialIdToName.get(inst.materialId);
                if (matName) {
                    const mat = materialsMap.get(matName) || materialsByFolder.get(matName);
                    if (mat) {
                        instMaterial = mat;
                    }
                }
            }
            // D007/DC05 TLV walk (VFF only); inst.children is always empty for
            // legacy instances, so this is a no-op there and the precomputed
            // `properties` seeded above survives unchanged.
            const d007 = inst.children.find((c) => c.tag === 'D007');
            let attributeDicts = null;
            if (d007) {
                try {
                    properties = extractDynamicProperties(d007, options);
                    attributeDicts = extractAttributeDictionaries(d007, options);
                }
                catch (e) {
                    emitLog(options, 'debug', `Failed to extract dynamic properties for instance ${inst.name ?? ''} (refIdx=${refIdx}): ${e.message}`);
                }
            }
            const instName = inst.name || `Component_${refIdx}`;
            const fullPathName = `${pathName} / ${instName}`;
            instanceCounter.count++;
            if (instanceCounter.count % PROGRESS_INTERVAL === 0) {
                emitProgress(options, 'build_scene', instanceCounter.count, instanceCounter.count);
                emitLog(options, 'debug', `Processed ${instanceCounter.count} placed instances`);
            }
            if (activeDefinitions.has(refIdx)) {
                throw new SkpParseError('Recursive component definition', {
                    stage: 'build_scene',
                    definitionId: refIdx,
                });
            }
            activeDefinitions.add(refIdx);
            const childNodes = instantiate(refIdx, newMatrix, lName, fullPathName, instMaterial);
            activeDefinitions.delete(refIdx);
            const tx = (newMatrix[9] ?? 0) * 25.4;
            const ty = (newMatrix[10] ?? 0) * 25.4;
            const tz = (newMatrix[11] ?? 0) * 25.4;
            // Fallback order: an attribute-dict name/label/code override, then
            // the instance's own explicit name, then the definition's own name
            // IF it's not itself just SketchUp's auto-generated
            // "Group#1"/"Component#12" placeholder, then finally the internal
            // index. Mirrors instanced.ts's identical resolution (and Python's/
            // C++'s own scene.py/instanced_scene.py) - see
            // instanced-fixture-parity.test.ts, which depends on both trees
            // resolving display names identically.
            const childDefName = defsDict.get(refIdx)?.name || '';
            const defNameIsReal = !!childDefName && !isGenericDefinitionName(childDefName);
            const nameOverride = findNameOverride(attributeDicts);
            const instNameNonEmpty = !!inst.name;
            const fallbackName = instNameNonEmpty ? inst.name : (defNameIsReal ? childDefName : `Component_${refIdx}`);
            const displayName = nameOverride ?? fallbackName;
            const nameIsGenerated = nameOverride === null && !instNameNonEmpty && !defNameIsReal;
            // Every OTHER attribute dictionary this instance carries -
            // dynamic_attributes is already surfaced separately as `properties`
            // above, and SU_InstanceSet is SketchUp's own always-present,
            // always-empty Owner/Status boilerplate, not worth surfacing.
            // Mirrors Python's own attribute_dictionaries construction in
            // scene.py exactly (openskp#285).
            const attributeDictionaries = {};
            if (attributeDicts) {
                for (const dictName of Object.keys(attributeDicts)) {
                    if (dictName === 'dynamic_attributes' || dictName === 'SU_InstanceSet')
                        continue;
                    const entries = attributeDicts[dictName];
                    const stringified = {};
                    for (const key of Object.keys(entries))
                        stringified[key] = stringifyVffAttrValue(entries[key]);
                    attributeDictionaries[dictName] = stringified;
                }
            }
            const instInfo = {
                name: displayName,
                nameIsGenerated,
                definitionName: childDefName,
                layer: lName,
                positionMm: [
                    Math.round(tx * 100) / 100,
                    Math.round(ty * 100) / 100,
                    Math.round(tz * 100) / 100,
                ],
                properties: properties,
                attributeDictionaries,
                guid: inst.refGuid || '',
                children: childNodes,
            };
            childInstancesInfo.push(instInfo);
            pathUpdates.set(fullPathName, { properties, name: inst.name || '', attributeDictionaries });
        }
        return childInstancesInfo;
    }
    const identityMat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1.0];
    const rootChildren = instantiate('ROOT', identityMat);
    // Deferred mesh backfill: each mesh's own path was recorded verbatim as
    // a pathUpdates key by the exact instance that placed the definition
    // that mesh's own faces belong to (never an ancestor's), so a direct
    // O(1) lookup per mesh is enough - no cascading from an ancestor down
    // to its descendants' own meshes. Properties/name are per-instance,
    // not inherited by nested sub-parts, matching how sceneHierarchy
    // already builds each InstanceNode from that same instance's own
    // `inst.name`/`properties` directly above.
    for (const geomName of Object.keys(meshIndex)) {
        const existing = meshIndex[geomName];
        const update = existing ? pathUpdates.get(existing.path) : undefined;
        if (existing && update) {
            existing.properties = update.properties;
            existing.name = update.name;
            existing.attributeDictionaries = update.attributeDictionaries;
        }
    }
    // Fill in missing root meshes
    for (const geomName of Object.keys(meshIndex)) {
        const existing = meshIndex[geomName];
        if (existing && existing.path === 'ROOT') {
            existing.name = 'ROOT';
            existing.definitionName = 'ROOT_MODEL';
            existing.layer = 'Layer0';
            existing.positionMm = [0, 0, 0];
            existing.properties = {};
            existing.attributeDictionaries = {};
        }
    }
    const sceneHierarchy = {
        name: 'ROOT',
        nameIsGenerated: false,
        definitionName: 'ROOT_MODEL',
        layer: 'Layer0',
        positionMm: [0, 0, 0],
        properties: {},
        attributeDictionaries: {},
        guid: '',
        children: rootChildren,
    };
    emitLog(options, 'info', `Scene build complete: ${instanceCounter.count} instances, ${Object.keys(meshIndex).length} meshes, ` +
        `${glbPrimitives.length} primitives (${((Date.now() - t0) / 1000).toFixed(2)}s)`);
    const bounds = Number.isFinite(boundsMin[0])
        ? {
            min: [boundsMin[0], boundsMin[1], boundsMin[2]],
            max: [boundsMax[0], boundsMax[1], boundsMax[2]],
            size: [
                boundsMax[0] - boundsMin[0],
                boundsMax[1] - boundsMin[1],
                boundsMax[2] - boundsMin[2],
            ],
            center: [
                (boundsMin[0] + boundsMax[0]) / 2,
                (boundsMin[1] + boundsMax[1]) / 2,
                (boundsMin[2] + boundsMax[2]) / 2,
            ],
        }
        : null;
    return { sceneHierarchy, meshIndex, glbPrimitives, gltfMaterials, textures, bounds };
}
export function resolveMaterialFromMaps(matId, materialIdToName, materialsMap, materialsByFolder) {
    if (matId === undefined || matId === null)
        return undefined;
    const matName = materialIdToName.get(matId);
    if (!matName)
        return undefined;
    return materialsMap.get(matName) || materialsByFolder.get(matName);
}
