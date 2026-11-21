/**
 * Structured parse errors.
 *
 * {@link SkpParseError} carries *where* a parse failed - which stage, which
 * top-level record (and how many total), which TLV tag, which definition -
 * so a stuck or failed model in a production pipeline can be traced back to
 * an exact location instead of a bare stack trace.
 *
 * The original error is always preserved as `.cause`, so inspecting the
 * failure never loses information, it only adds context.
 */
export class SkpParseError extends Error {
    constructor(message, context = {}) {
        const parts = [message];
        if (context.stage !== undefined)
            parts.push(`stage=${context.stage}`);
        if (context.recordIndex !== undefined && context.totalRecords !== undefined) {
            parts.push(`record=${context.recordIndex}/${context.totalRecords}`);
        }
        if (context.tag !== undefined)
            parts.push(`tag=${context.tag}`);
        if (context.offset !== undefined)
            parts.push(`offset=0x${context.offset.toString(16).toUpperCase()}`);
        if (context.definitionId !== undefined)
            parts.push(`definitionId=${context.definitionId}`);
        super(parts.join(' | '));
        this.name = 'SkpParseError';
        this.stage = context.stage;
        this.recordIndex = context.recordIndex;
        this.totalRecords = context.totalRecords;
        this.tag = context.tag;
        this.offset = context.offset;
        this.definitionId = context.definitionId;
        this.cause = context.cause;
        // Restore the prototype chain (needed when targeting down-level JS).
        Object.setPrototypeOf(this, SkpParseError.prototype);
    }
}
