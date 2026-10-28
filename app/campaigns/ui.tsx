// Small pieces the campaign pages share.

export function ErrorNote({ error }: { error?: string | string[] }) {
  if (typeof error !== "string" || !error) return null;
  return (
    <p role="alert" className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
      {error}
    </p>
  );
}

export function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

export const field = "border-input bg-background h-9 rounded-md border px-2 text-sm";
export const smallField = "border-input bg-background h-8 w-16 rounded-md border px-2 text-sm tabular-nums";
