// Bounded parallel map. Git and filesystem work in this app fans out
// over file lists that can run to thousands of entries (an un-ignored
// node_modules, a large agent changeset); an unbounded Promise.all
// there forks thousands of processes or saturates libuv's filesystem
// threadpool, stalling every other operation in the main process.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
