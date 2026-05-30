export function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
      <div className="text-sm font-medium text-destructive">Couldn't load this diff.</div>
      <div className="mt-1.5 select-text text-xs text-destructive/80">{message}</div>
    </div>
  );
}
