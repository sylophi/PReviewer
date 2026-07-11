import { ArrowLeft, Minus, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { EditorFontId, Theme } from "@shared/schemas";
import { EDITOR_FONT_SIZE_MAX, EDITOR_FONT_SIZE_MIN } from "@shared/schemas";
import { useGlobalConfig, useGlobalConfigPatch } from "@/hooks/config/useGlobalConfig";
import {
  DEFAULT_EDITOR_FONT,
  DEFAULT_EDITOR_FONT_SIZE,
  EDITOR_FONTS,
  editorLineHeight,
} from "@/lib/editorFonts";
import { cn, dragRegion, focusRing } from "@/lib/utils";
import { AppToolbar } from "../AppToolbar";
import { buttonVariants } from "../ui/button";
import { SectionHeading } from "../ui/section-heading";
import { Segmented } from "../ui/segmented";

export function Settings() {
  const { data: config } = useGlobalConfig();
  const patch = useGlobalConfigPatch();

  const theme: Theme = config?.theme ?? "system";
  const fontId: EditorFontId = config?.editorFont ?? DEFAULT_EDITOR_FONT;
  const fontSize = config?.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE;
  const ligatures = config?.editorLigatures ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppToolbar>
        <Link
          to="/"
          style={dragRegion("no-drag")}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "shrink-0 text-muted-foreground hover:text-foreground",
          )}
          title="Back to diffs"
          aria-label="Back to diffs"
        >
          <ArrowLeft />
        </Link>
        <h1 className="min-w-0 shrink truncate text-sm font-semibold text-foreground">Settings</h1>
      </AppToolbar>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-10 px-8 pt-8 pb-16">
          <Section title="Appearance">
            <Row label="Theme" hint="System follows your OS setting.">
              <Segmented
                label="Theme"
                value={theme}
                onChange={(next) => patch.mutate({ theme: next })}
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </Row>
          </Section>

          <Section title="Editor">
            <Row label="Font">
              <Segmented
                label="Editor font"
                value={fontId}
                onChange={(next) => patch.mutate({ editorFont: next })}
                options={(Object.keys(EDITOR_FONTS) as EditorFontId[]).map((id) => ({
                  value: id,
                  label: EDITOR_FONTS[id].label,
                }))}
              />
            </Row>
            <Row label="Font size">
              <Stepper
                value={fontSize}
                min={EDITOR_FONT_SIZE_MIN}
                max={EDITOR_FONT_SIZE_MAX}
                onChange={(next) => patch.mutate({ editorFontSize: next })}
              />
            </Row>
            <Row label="Ligatures" hint="Combine ->, =>, !== into single glyphs.">
              <Segmented
                label="Ligatures"
                value={ligatures ? "on" : "off"}
                onChange={(next) => patch.mutate({ editorLigatures: next === "on" })}
                options={[
                  { value: "off", label: "Off" },
                  { value: "on", label: "On" },
                ]}
              />
            </Row>
            <EditorPreview fontId={fontId} fontSize={fontSize} ligatures={ligatures} />
          </Section>

          <VersionSection />
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>{title}</SectionHeading>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

// Label on the left, control on the right, with a thin divider between
// rows. Optional hint sits under the label.
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border/60 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-foreground">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground/80">{hint}</span> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
      <StepButton label="Decrease font size" disabled={value <= min} onClick={() => step(-1)}>
        <Minus className="size-3.5" />
      </StepButton>
      <span className="tabular w-9 text-center text-sm text-foreground">{value}px</span>
      <StepButton label="Increase font size" disabled={value >= max} onClick={() => step(1)}>
        <Plus className="size-3.5" />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

// Live sample so font / size / ligature changes are visible without
// opening a diff. The ligature toggle flips the OpenType feature flags
// JetBrains Mono uses for ->, =>, !==, >=, etc.
function EditorPreview({
  fontId,
  fontSize,
  ligatures,
}: {
  fontId: EditorFontId;
  fontSize: number;
  ligatures: boolean;
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card/40">
      <div className="border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">
        Preview
      </div>
      <pre
        data-code-surface=""
        className="overflow-x-auto px-3 py-2.5 text-foreground"
        style={{
          fontFamily: EDITOR_FONTS[fontId].stack,
          fontSize: `${fontSize}px`,
          lineHeight: `${editorLineHeight(fontSize)}px`,
          fontFeatureSettings: ligatures ? '"calt" 1, "liga" 1' : '"calt" 0, "liga" 0',
        }}
      >
        {"const diff = (a, b) => a !== b && a >= 0; // |> 0x1F\n"}
        {"type Result<T> = { ok: true; value: T } | { ok: false };"}
      </pre>
    </div>
  );
}

function VersionSection() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Version</SectionHeading>
      <div className="font-mono text-sm text-foreground select-text">
        {__APP_VERSION__} <span className="text-muted-foreground">({__APP_COMMIT__})</span>
      </div>
    </section>
  );
}
