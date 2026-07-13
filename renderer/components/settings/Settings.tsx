import { ArrowLeft, Minus, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { EditorFontWeight, EditorWhitespace, Theme } from "@shared/schemas";
import {
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  EDITOR_LINE_HEIGHT_MAX,
  EDITOR_LINE_HEIGHT_MIN,
} from "@shared/schemas";
import { useGlobalConfig, useGlobalConfigPatch } from "@/hooks/config/useGlobalConfig";
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_FONT_WEIGHT,
  DEFAULT_EDITOR_LINE_HEIGHT,
  editorLineHeightPx,
  resolveFontStack,
} from "@/lib/editorFonts";
import { cn, dragRegion, focusRing } from "@/lib/utils";
import { AppToolbar } from "../AppToolbar";
import { buttonVariants } from "../ui/button";
import { Input } from "../ui/form-controls";
import { SectionHeading } from "../ui/section-heading";
import { Segmented } from "../ui/segmented";

export function Settings() {
  const { data: config } = useGlobalConfig();
  const patch = useGlobalConfigPatch();

  const theme: Theme = config?.theme ?? "system";
  const fontSize = config?.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE;
  const fontWeight: EditorFontWeight = config?.editorFontWeight ?? DEFAULT_EDITOR_FONT_WEIGHT;
  const lineHeight = config?.editorLineHeight ?? DEFAULT_EDITOR_LINE_HEIGHT;
  const ligatures = config?.editorLigatures ?? false;

  const wordWrap = config?.editorWordWrap ?? false;
  const lineNumbers = config?.editorLineNumbers ?? true;
  const minimap = config?.editorMinimap ?? false;
  const indentGuides = config?.editorIndentGuides ?? false;
  const whitespace: EditorWhitespace = config?.editorWhitespace ?? "none";
  const stickyScroll = config?.editorStickyScroll ?? false;
  const tabSize = config?.editorTabSize ?? 4;

  const ignoreTrimWhitespace = config?.diffIgnoreTrimWhitespace ?? true;
  const collapseUnchanged = config?.diffCollapseUnchanged ?? false;
  const showMoves = config?.diffShowMoves ?? false;

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

          <Section title="Font">
            <Row
              label="Font family"
              hint="Any font installed on your system, or a comma-separated stack. Empty uses the platform monospace."
            >
              <Input
                key={config?.editorFontFamily ?? ""}
                type="text"
                defaultValue={config?.editorFontFamily ?? ""}
                placeholder="e.g. JetBrains Mono, Fira Code"
                className="w-64 font-mono"
                onBlur={(e) => patch.mutate({ editorFontFamily: e.target.value.trim() })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    patch.mutate({ editorFontFamily: e.currentTarget.value.trim() });
                    e.currentTarget.blur();
                  }
                }}
              />
            </Row>
            <Row label="Font size">
              <Stepper
                value={fontSize}
                min={EDITOR_FONT_SIZE_MIN}
                max={EDITOR_FONT_SIZE_MAX}
                format={(v) => `${v}px`}
                onChange={(next) => patch.mutate({ editorFontSize: next })}
              />
            </Row>
            <Row label="Font weight" hint="Variable fonts render the exact weight.">
              <Segmented
                label="Font weight"
                value={fontWeight}
                onChange={(next) => patch.mutate({ editorFontWeight: next })}
                options={(["300", "400", "450", "500", "600"] as const).map((w) => ({
                  value: w,
                  label: w,
                }))}
              />
            </Row>
            <Row label="Line height">
              <Stepper
                value={lineHeight}
                min={EDITOR_LINE_HEIGHT_MIN}
                max={EDITOR_LINE_HEIGHT_MAX}
                step={0.1}
                format={(v) => `${v.toFixed(1)}×`}
                onChange={(next) => patch.mutate({ editorLineHeight: Math.round(next * 10) / 10 })}
              />
            </Row>
            <Row label="Ligatures" hint="Combine ->, =>, !== into single glyphs.">
              <Toggle
                label="Ligatures"
                value={ligatures}
                onChange={(next) => patch.mutate({ editorLigatures: next })}
              />
            </Row>
            <EditorPreview
              stack={resolveFontStack(config)}
              fontSize={fontSize}
              fontWeight={fontWeight}
              lineHeight={lineHeight}
              ligatures={ligatures}
            />
          </Section>

          <Section title="Editor">
            <Row label="Word wrap">
              <Toggle
                label="Word wrap"
                value={wordWrap}
                onChange={(next) => patch.mutate({ editorWordWrap: next })}
              />
            </Row>
            <Row label="Line numbers">
              <Toggle
                label="Line numbers"
                value={lineNumbers}
                onChange={(next) => patch.mutate({ editorLineNumbers: next })}
              />
            </Row>
            <Row label="Minimap">
              <Toggle
                label="Minimap"
                value={minimap}
                onChange={(next) => patch.mutate({ editorMinimap: next })}
              />
            </Row>
            <Row label="Indent guides">
              <Toggle
                label="Indent guides"
                value={indentGuides}
                onChange={(next) => patch.mutate({ editorIndentGuides: next })}
              />
            </Row>
            <Row label="Sticky scroll" hint="Pin the enclosing scope while scrolling.">
              <Toggle
                label="Sticky scroll"
                value={stickyScroll}
                onChange={(next) => patch.mutate({ editorStickyScroll: next })}
              />
            </Row>
            <Row label="Whitespace" hint="Render spaces and tabs as visible dots.">
              <Segmented
                label="Whitespace"
                value={whitespace}
                onChange={(next) => patch.mutate({ editorWhitespace: next })}
                options={[
                  { value: "none", label: "None" },
                  { value: "boundary", label: "Boundary" },
                  { value: "trailing", label: "Trailing" },
                  { value: "all", label: "All" },
                ]}
              />
            </Row>
            <Row label="Tab size" hint="Display width of a tab character.">
              <Segmented
                label="Tab size"
                value={String(tabSize)}
                onChange={(next) => patch.mutate({ editorTabSize: Number(next) as 2 | 4 | 8 })}
                options={[
                  { value: "2", label: "2" },
                  { value: "4", label: "4" },
                  { value: "8", label: "8" },
                ]}
              />
            </Row>
          </Section>

          <Section title="Diff">
            <Row
              label="Ignore whitespace-only changes"
              hint="Lines differing only in leading/trailing whitespace don't count as changed."
            >
              <Toggle
                label="Ignore whitespace-only changes"
                value={ignoreTrimWhitespace}
                onChange={(next) => patch.mutate({ diffIgnoreTrimWhitespace: next })}
              />
            </Row>
            <Row
              label="Collapse unchanged regions"
              hint="Fold long unchanged stretches; click to expand."
            >
              <Toggle
                label="Collapse unchanged regions"
                value={collapseUnchanged}
                onChange={(next) => patch.mutate({ diffCollapseUnchanged: next })}
              />
            </Row>
            <Row label="Show moved code" hint="Detect blocks that moved and link both sides.">
              <Toggle
                label="Show moved code"
                value={showMoves}
                onChange={(next) => patch.mutate({ diffShowMoves: next })}
              />
            </Row>
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

// Boolean rows all render as the same Off/On segmented control so the
// page reads consistently.
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Segmented
      label={label}
      value={value ? "on" : "off"}
      onChange={(next) => onChange(next === "on")}
      options={[
        { value: "off", label: "Off" },
        { value: "on", label: "On" },
      ]}
    />
  );
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (next: number) => void;
}) {
  const stepBy = (delta: number) => {
    // Round to the step's precision so float steps (0.1) don't drift.
    const raw = value + delta * step;
    const precision = step < 1 ? 10 : 1;
    const next = Math.min(max, Math.max(min, Math.round(raw * precision) / precision));
    if (next !== value) onChange(next);
  };
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
      <StepButton label="Decrease" disabled={value <= min} onClick={() => stepBy(-1)}>
        <Minus className="size-3.5" />
      </StepButton>
      <span className="tabular w-12 text-center text-sm text-foreground">{format(value)}</span>
      <StepButton label="Increase" disabled={value >= max} onClick={() => stepBy(1)}>
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

// Live sample so font / size / weight / line-height / ligature changes
// are visible without opening a diff. Tagged data-code-surface so it
// renders with the same font smoothing as the real editor.
function EditorPreview({
  stack,
  fontSize,
  fontWeight,
  lineHeight,
  ligatures,
}: {
  stack: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
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
          fontFamily: stack,
          fontSize: `${fontSize}px`,
          fontWeight,
          lineHeight: `${editorLineHeightPx(fontSize, lineHeight)}px`,
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
