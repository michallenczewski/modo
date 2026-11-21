/**
 * Optional progress/log hooks for long-running parses.
 *
 * openskp never logs or prints on its own - callers that want visibility
 * into a parse (progress through a large file, which stage is running, when
 * it completes) pass an {@link ParseOptions} with `onProgress`/`onLog`
 * callbacks that plug into whatever logging/monitoring the host application
 * already uses. Silent by default, matching {@link SkpParseError}'s "always
 * add context, never hide it" philosophy from the other side: this is how a
 * caller finds out *how far* a parse got before it got stuck, not just
 * *where*.
 */
/** How often (in records/definitions/instances) to call `onProgress` during
 * a long walk - coarse enough that it costs nothing on a 300k-definition
 * file. Mirrors the Python port's `_PROGRESS_INTERVAL`. */
export const PROGRESS_INTERVAL = 500;
export function emitLog(options, level, message) {
    options?.onLog?.(level, message);
}
export function emitProgress(options, stage, current, total) {
    options?.onProgress?.({ stage, current, total });
}
