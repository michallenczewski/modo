import { extractSkpContents, readMetaUnits } from './vff.js';
import { iterTopLevelLazy, readU32, parseVarInt } from './parser.js';
import { SkpParseError } from './errors.js';
import { PROGRESS_INTERVAL, emitLog, emitProgress } from './observability.js';
import { GeometryBuilder, collectLayers, collectDefs, extractGeometryFromNodes, parseMaterialXml, parseStyleXml, resolveTextureBytes, findChildTag } from './geometry.js';
import { buildModelFromParsed, buildSceneFromParsed } from './model.js';
import { isLegacy, parseLegacyToRaw } from './legacy.js';
import { scanVertexPositions, scanInstanceTransforms, findPageNode, parsePages, parseDimensions } from './pages-dimensions.js';
export { SkpParseError } from './errors.js';
function parseToRaw(buffer, options) {
    const t0 = Date.now();
    const data = new Uint8Array(buffer);
    emitLog(options, 'info', `Parsing buffer (${data.length} bytes)`);
    // Both the legacy (pre-2021 MFC) and modern (VFF/ZIP) containers share
    // this 4-byte magic - checked upfront, matching every other port, so a
    // file that isn't a SketchUp file at all fails here with stage: 'header'
    // instead of falling through to the ZIP extractor and getting mislabeled
    // stage: 'zip_extract' for a problem that has nothing to do with ZIP.
    if (!(data.length >= 4 && data[0] === 0xff && data[1] === 0xfe && data[2] === 0xff && data[3] === 0x0e)) {
        throw new SkpParseError('Not a valid SketchUp file (bad header magic)', { stage: 'header' });
    }
    if (isLegacy(data)) {
        emitLog(options, 'debug', 'Detected legacy MFC container; routing to legacy walker');
        return parseLegacyToRaw(data, options);
    }
    // 1. Extract SKP contents from VFF/ZIP container
    let contents;
    try {
        contents = extractSkpContents(data, options);
    }
    catch (e) {
        throw new SkpParseError(`Failed to extract SKP contents: ${e.message}`, {
            stage: 'zip_extract',
            cause: e,
        });
    }
    const version = contents.version;
    const modelData = contents.modelData;
    const materialFiles = contents.materialFiles;
    emitLog(options, 'debug', `Detected version ${version} (VFF/ZIP container)`);
    // meta/meta.dat carries the model's unit-system string (e.g.
    // "Millimeter") - legacy (pre-2021 MFC) files carry no equivalent
    // container, so units stays null there.
    const units = contents.metaData ? readMetaUnits(contents.metaData) : null;
    // 2. Parse XML materials to populate layer colors and materials
    const layerColors = new Map();
    // Modern (VFF) files derive layers from Layer_<name>-prefixed materials,
    // which carry no visibility flag of their own - unlike legacy MFC files,
    // there is currently no known tag exposing a VFF layer's hidden state,
    // so every VFF layer defaults to visible here.
    const layerHidden = new Map();
    const materialsMap = new Map();
    const materialsByFolder = new Map();
    for (const [name, xmlBytes] of Object.entries(materialFiles)) {
        const lowerName = name.toLowerCase();
        if (lowerName.endsWith('material.xml') && lowerName.startsWith('materials/')) {
            try {
                const decoder = new TextDecoder('utf-8');
                const xmlText = decoder.decode(xmlBytes);
                const parsedMat = parseMaterialXml(xmlText);
                if (parsedMat) {
                    const folderName = name.split('/')[1] || '';
                    let texture = null;
                    if (parsedMat.hasTexture) {
                        const resolved = resolveTextureBytes(materialFiles, name, parsedMat.textureFilename, parsedMat.imagePath);
                        texture = {
                            filename: resolved.filename,
                            width: parsedMat.xScale,
                            height: parsedMat.yScale,
                            data: resolved.data,
                        };
                    }
                    const matObj = {
                        name: parsedMat.name,
                        // The VFF material XML record has no alpha attribute - only a
                        // separate transparency value (parsedMat.trans, above). Always
                        // opaque here; real per-channel alpha only exists in the legacy
                        // MFC record (see legacy.ts's own material color assignment).
                        color: { r: parsedMat.r, g: parsedMat.g, b: parsedMat.b, a: 255 },
                        transparency: parsedMat.trans,
                        id: null,
                        texture,
                        colorized: parsedMat.colorized,
                        colorizeType: parsedMat.colorizeType,
                    };
                    materialsMap.set(parsedMat.name, matObj);
                    if (folderName) {
                        materialsByFolder.set(folderName, matObj);
                    }
                    if (parsedMat.name.startsWith('Layer_')) {
                        layerColors.set(parsedMat.name.slice(6), [parsedMat.r, parsedMat.g, parsedMat.b]);
                        layerHidden.set(parsedMat.name.slice(6), false);
                    }
                }
            }
            catch (e) {
                emitLog(options, 'debug', `Failed to parse material.xml ${name}: ${e.message}`);
            }
        }
    }
    // 2b. Parse styles/*/style.xml: face colors for unpainted faces, stored as
    // signed-int32 ABGR variants under item id 2002 (front) / 2003 (back).
    const styles = [];
    for (const [name, xmlBytes] of Object.entries(materialFiles)) {
        const lowerName = name.toLowerCase();
        if (lowerName.startsWith('styles/') && lowerName.endsWith('style.xml')) {
            try {
                const decoder = new TextDecoder('utf-8');
                const xmlText = decoder.decode(xmlBytes);
                const parsedStyle = parseStyleXml(xmlText);
                if (parsedStyle) {
                    styles.push({
                        name: parsedStyle.name,
                        frontColor: parsedStyle.frontColor,
                        backColor: parsedStyle.backColor,
                    });
                }
            }
            catch (e) {
                emitLog(options, 'debug', `Failed to parse style.xml ${name}: ${e.message}`);
            }
        }
    }
    // 3. Walk the TLV tree one top-level record at a time (instead of
    // building the whole file's tree at once) so peak memory is bounded by
    // the single largest definition/layer-manager/material-manager/root
    // block, not by the file's total node count. Real production files can
    // have 100k+ separate component definitions; materializing all of them
    // simultaneously is what actually exhausts memory on large files - not
    // the (comparatively modest, ~1x) cost of decompressing model.dat itself.
    const layerIdToName = new Map();
    const materialIdToName = new Map();
    function collectMaterialIds(nodes) {
        for (const el of nodes) {
            if (el.tag === 'C832') {
                const dc05 = findChildTag(el.children, 'DC05');
                const nameNode = findChildTag(el.children, 'CC32');
                if (dc05 && nameNode) {
                    const payload = dc05.payload;
                    let mId;
                    if (payload.length >= 6 && payload[0] === 0xDE && payload[1] === 0x05) {
                        const de05Len = readU32(payload, 2);
                        mId = parseVarInt(payload, 6, de05Len);
                    }
                    else {
                        mId = parseVarInt(payload, 0, payload.length);
                    }
                    let mName = '';
                    try {
                        const decoder = new TextDecoder('utf-8');
                        mName = decoder.decode(nameNode.payload);
                    }
                    catch (e) {
                        emitLog(options, 'debug', `Failed to decode material name for id ${mId}: ${e.message}`);
                    }
                    materialIdToName.set(mId, mName);
                }
            }
            if (el.children && el.children.length > 0) {
                collectMaterialIds(el.children);
            }
        }
    }
    emitLog(options, 'debug', `Parsed ${materialsMap.size} materials, ${styles.length} styles`);
    const defsDict = new Map();
    const rootBuilder = new GeometryBuilder();
    const vertexPositions = new Map();
    const instanceWorld = new Map();
    let pageNode = null;
    for (const { index, total, node: el } of iterTopLevelLazy(modelData, 0, modelData.length)) {
        try {
            collectLayers([el], layerIdToName, options, layerHidden);
            collectMaterialIds([el]);
            collectDefs([el], defsDict, options);
            scanVertexPositions(el, vertexPositions);
            scanInstanceTransforms(el, instanceWorld);
            if (pageNode === null) {
                pageNode = findPageNode(el);
            }
            if (el.tag === 'F601') {
                extractGeometryFromNodes(el.children, rootBuilder, options);
            }
        }
        catch (e) {
            throw new SkpParseError(`Failed while processing top-level record: ${e.message}`, {
                stage: 'tlv_walk',
                recordIndex: index,
                totalRecords: total,
                tag: el.tag,
                cause: e,
            });
        }
        // `el` (and its whole subtree) is now unreferenced and eligible for
        // garbage collection before the next top-level record is built.
        if (index % PROGRESS_INTERVAL === 0 || index === total - 1) {
            emitProgress(options, 'tlv_walk', index + 1, total);
            emitLog(options, 'debug', `Processed ${index + 1}/${total} top-level records`);
        }
    }
    emitLog(options, 'info', `Parse complete: ${defsDict.size} defs (${((Date.now() - t0) / 1000).toFixed(2)}s)`);
    if (!layerIdToName.has(1)) {
        layerIdToName.set(1, 'Layer0');
    }
    if (!layerColors.has('Layer0')) {
        layerColors.set('Layer0', [136, 136, 136]);
    }
    if (!layerHidden.has('Layer0')) {
        layerHidden.set('Layer0', false);
    }
    defsDict.set('ROOT', {
        guid: 'ROOT',
        name: 'ROOT_MODEL',
        isImage: false,
        isGroup: false,
        alwaysFacesCamera: false,
        shadowsFaceSun: false,
        builder: rootBuilder,
    });
    return {
        version,
        units,
        layerColors,
        layerHidden,
        layerIdToName,
        pages: parsePages(pageNode),
        dimensions: parseDimensions(modelData, vertexPositions, instanceWorld),
        materialIdToName,
        materialsMap,
        materialsByFolder,
        styles,
        defsDict,
    };
}
export function parseSkp(buffer, options) {
    return buildModelFromParsed(parseToRaw(buffer, options));
}

// zaplatana scena w układzie świata (do testów zgodności importu)
export function buildScene(buffer, options) {
    return buildSceneFromParsed(parseToRaw(buffer, options), options);
}
