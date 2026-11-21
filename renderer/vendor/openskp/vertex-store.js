/**
 * Vertex coordinate storage.
 *
 * A `Map<number, [x, y, z]>` costs ~92 MB per million vertices: every
 * `[x, y, z]` is a separate JS array with its own object header, and every
 * Map entry adds hash-bucket overhead on top. The coordinates themselves
 * are 24 bytes. That overhead is the dominant term in this package's
 * memory use on large files.
 *
 * Coordinates move into one flat `Float64Array` (f64, not f32: the file
 * stores doubles and narrowing would silently change parsed geometry).
 * Ids are NOT dense in real files - measured across this repository's
 * fixtures, vertex ids are ~33% dense on aggregate and as low as 7.6%
 * within a single definition - so indexing the array by raw id would waste
 * more than it saves. An id -> index mapping is therefore mandatory, and
 * this module provides two implementations of it behind one interface so
 * they can be benchmarked against real files rather than chosen blind:
 *
 * - {@link MapVertexStore}: `Map<id, index>`. O(1) lookup, but the Map is
 *   then the dominant remaining cost (~57 MB/1M measured).
 * - {@link SortedVertexStore}: a sorted `Uint32Array` of ids plus binary
 *   search. O(log n) lookup, denser (~42 MB/1M measured).
 *
 * Both preserve insertion order for iteration, which the parsers and
 * `buildDefinition()` rely on.
 */
/** Initial capacity in vertices; grown geometrically. */
const INITIAL_CAPACITY = 256;
/**
 * Shared coordinate storage: a flat `Float64Array` holding
 * `[x, y, z, x, y, z, ...]` in insertion order, plus the insertion-ordered
 * id list. Subclasses differ only in how they map an id to its slot.
 */
class BaseVertexStore {
    constructor() {
        this.coords = new Float64Array(INITIAL_CAPACITY * 3);
        /** Ids in insertion order; `idList[i]` owns slot `i`. */
        this.idList = new Uint32Array(INITIAL_CAPACITY);
        this.count = 0;
    }
    get size() {
        return this.count;
    }
    grow() {
        if (this.count < this.idList.length)
            return;
        const nextCapacity = this.idList.length * 2;
        const nextCoords = new Float64Array(nextCapacity * 3);
        nextCoords.set(this.coords);
        this.coords = nextCoords;
        const nextIds = new Uint32Array(nextCapacity);
        nextIds.set(this.idList);
        this.idList = nextIds;
    }
    set(id, xyz) {
        const existing = this.slotOf(id);
        const slot = existing >= 0 ? existing : this.count;
        if (existing < 0) {
            this.grow();
            this.idList[slot] = id;
            this.count++;
            this.remember(id, slot);
        }
        this.coords[slot * 3] = xyz[0];
        this.coords[slot * 3 + 1] = xyz[1];
        this.coords[slot * 3 + 2] = xyz[2];
    }
    get(id) {
        const slot = this.slotOf(id);
        if (slot < 0)
            return undefined;
        return [this.coords[slot * 3], this.coords[slot * 3 + 1], this.coords[slot * 3 + 2]];
    }
    has(id) {
        return this.slotOf(id) >= 0;
    }
    *entries() {
        for (let i = 0; i < this.count; i++) {
            yield [
                this.idList[i],
                [this.coords[i * 3], this.coords[i * 3 + 1], this.coords[i * 3 + 2]],
            ];
        }
    }
    *ids() {
        for (let i = 0; i < this.count; i++)
            yield this.idList[i];
    }
}
/** id -> slot via a `Map`. O(1) lookup; the Map dominates memory. */
export class MapVertexStore extends BaseVertexStore {
    constructor() {
        super(...arguments);
        this.index = new Map();
    }
    slotOf(id) {
        const slot = this.index.get(id);
        return slot === undefined ? -1 : slot;
    }
    remember(id, slot) {
        this.index.set(id, slot);
    }
}
/**
 * id -> slot via binary search over a sorted id array.
 *
 * Ids arrive in essentially ascending order in real files, so the sorted
 * array is usually built by appending; the out-of-order case is handled by
 * inserting in place, which keeps lookups correct at the cost of a memmove
 * on the rare unsorted write.
 */
export class SortedVertexStore extends BaseVertexStore {
    constructor() {
        super(...arguments);
        /** Ids in ASCENDING order (unlike `idList`, which is insertion order). */
        this.sortedIds = new Uint32Array(INITIAL_CAPACITY);
        /** `slots[i]` is the storage slot for `sortedIds[i]`. */
        this.slots = new Uint32Array(INITIAL_CAPACITY);
        this.sortedCount = 0;
    }
    /** Index into `sortedIds` where `id` is, or `-(insertionPoint) - 1`. */
    search(id) {
        let lo = 0;
        let hi = this.sortedCount - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const v = this.sortedIds[mid];
            if (v === id)
                return mid;
            if (v < id)
                lo = mid + 1;
            else
                hi = mid - 1;
        }
        return -lo - 1;
    }
    slotOf(id) {
        const at = this.search(id);
        return at >= 0 ? this.slots[at] : -1;
    }
    remember(id, slot) {
        if (this.sortedCount >= this.sortedIds.length) {
            const nextCapacity = this.sortedIds.length * 2;
            const nextIds = new Uint32Array(nextCapacity);
            nextIds.set(this.sortedIds);
            this.sortedIds = nextIds;
            const nextSlots = new Uint32Array(nextCapacity);
            nextSlots.set(this.slots);
            this.slots = nextSlots;
        }
        const at = this.search(id);
        // `remember` is only called for ids not already present, so `at` is
        // always negative here; the insertion point is its complement.
        const pos = -at - 1;
        if (pos < this.sortedCount) {
            // Out-of-order id: shift to keep the array sorted. Rare in practice.
            this.sortedIds.copyWithin(pos + 1, pos, this.sortedCount);
            this.slots.copyWithin(pos + 1, pos, this.sortedCount);
        }
        this.sortedIds[pos] = id;
        this.slots[pos] = slot;
        this.sortedCount++;
    }
}
/**
 * The implementation the parsers use.
 *
 * Chosen by measurement, not preference - see
 * `tests/bench/vertex-store-bench.ts`. At 1M vertices and the ~33% id
 * density real files show:
 *
 * | storage                      | memory | vs today | lookup    |
 * |------------------------------|--------|----------|-----------|
 * | today: `Map<id,[x,y,z]>`     | 92 MB  | 1.0x     | 1068 ns   |
 * | `Map<id,index>`              | 57 MB  | **1.6x** | 1088 ns   |
 * | sorted `Uint32Array`         | 42 MB  | 2.2x     | 1445 ns   |
 *
 * The sorted array saves more memory but costs ~35% on lookup, and lookup
 * is the hot path: `face-groups.ts` calls `get()` once per triangle corner,
 * so gets vastly outnumber writes. `MapVertexStore` takes the larger share
 * of the memory win at parity on speed, which is the better trade for a
 * library whose scene building is already the expensive half.
 *
 * {@link SortedVertexStore} is kept, tested and benchmarked rather than
 * deleted: it is the right choice if lookups ever stop dominating, and
 * keeping it makes the decision re-checkable instead of folklore.
 */
export const DefaultVertexStore = MapVertexStore;
