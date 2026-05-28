import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { RecentCommit, RefExpr, Repo } from "@shared/schemas";
import { useCreateDiff } from "@/hooks/diffs/useDiffs";
import { useRepoBranches } from "@/hooks/repos/useRepoBranches";
import { useRecentCommits } from "@/hooks/repos/useRecentCommits";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/form-controls";
import { diffTitle } from "@/lib/refExpr";
import { notify } from "@/lib/toast";

interface NewDiffDialogProps {
  repos: Repo[];
  initialRepoId?: string;
  onClose: () => void;
}

// Form-side mirror of RefExpr. Empty strings stand in for unfilled fields
// so the SidePicker is uncontrolled-friendly.
type LeafKind = "branch" | "commit" | "head" | "workingTree";
type FormLeaf =
  | { kind: "branch"; name: string }
  | { kind: "commit"; hash: string }
  | { kind: "head" }
  | { kind: "workingTree" };
type FormRef = FormLeaf | { kind: "mergeBase"; a: FormLeaf; b: FormLeaf };

const emptyLeaf: FormLeaf = { kind: "branch", name: "" };

function formLeafToRef(leaf: FormLeaf): RefExpr | null {
  switch (leaf.kind) {
    case "branch":
      return leaf.name.trim() ? { kind: "branch", name: leaf.name.trim() } : null;
    case "commit":
      return leaf.hash.trim() ? { kind: "commit", hash: leaf.hash.trim() } : null;
    case "head":
      return { kind: "head" };
    case "workingTree":
      return { kind: "workingTree" };
  }
}

function formToRef(form: FormRef): RefExpr | null {
  if (form.kind === "mergeBase") {
    const a = formLeafToRef(form.a);
    const b = formLeafToRef(form.b);
    if (!a || !b) return null;
    return { kind: "mergeBase", a, b };
  }
  return formLeafToRef(form);
}

export function NewDiffDialog({ repos, initialRepoId, onClose }: NewDiffDialogProps) {
  const [repoId, setRepoId] = useState<string>(initialRepoId ?? repos[0]?.id ?? "");

  const branches = useRepoBranches(repoId || null);
  const recentCommits = useRecentCommits(repoId || null);
  const [left, setLeft] = useState<FormRef>(emptyLeaf);
  const [right, setRight] = useState<FormRef>(emptyLeaf);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    setLeft(emptyLeaf);
    setRight(emptyLeaf);
  }, [repoId]);

  // Seed left to current branch, right to working tree (most common PR-ish
  // flow when reviewing local changes; also matches "review my agent's work").
  useEffect(() => {
    const data = branches.data;
    if (!data) return;
    setLeft((prev) => {
      if (prev.kind !== "branch" || prev.name !== "") return prev;
      return data.currentBranch ? { kind: "branch", name: data.currentBranch } : prev;
    });
    setRight((prev) => {
      if (prev.kind !== "branch" || prev.name !== "") return prev;
      return { kind: "workingTree" };
    });
  }, [branches.data]);

  const leftRef = useMemo(() => formToRef(left), [left]);
  const rightRef = useMemo(() => formToRef(right), [right]);

  const create = useCreateDiff();
  const navigate = useNavigate();
  const submit = async () => {
    if (!repoId || !leftRef || !rightRef) return;
    const trimmedName = name.trim();
    const created = await create.mutateAsync({
      repoId,
      left: leftRef,
      right: rightRef,
      ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
    });
    onClose();
    notify("Diff created", created.name);
    void navigate({
      to: "/repos/$repoId/diffs/$diffId",
      params: { repoId: created.repoId, diffId: created.id },
    });
  };

  const canSubmit = repoId !== "" && leftRef !== null && rightRef !== null;
  const previewName = name.trim() || (leftRef && rightRef ? diffTitle(leftRef, rightRef) : "");
  const localBranches = branches.data?.local ?? [];
  const recents = recentCommits.data ?? [];

  return (
    <ModalShell onClose={onClose} popoverClassName="max-w-lg">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">New diff</h2>
        </div>

        {repos.length > 1 ? (
          <Field label="Repo">
            <Select value={repoId} onChange={(e) => setRepoId(e.target.value)}>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <SidePicker
          label="Left"
          value={left}
          onChange={setLeft}
          branches={localBranches}
          recentCommits={recents}
        />
        <SidePicker
          label="Right"
          value={right}
          onChange={setRight}
          branches={localBranches}
          recentCommits={recents}
        />

        <Field label="Name (optional)">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={previewName || "auto"}
          />
        </Field>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={() => void submit()}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create diff"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

interface SidePickerProps {
  label: string;
  value: FormRef;
  onChange: (next: FormRef) => void;
  branches: string[];
  recentCommits: RecentCommit[];
}

function SidePicker({ label, value, onChange, branches, recentCommits }: SidePickerProps) {
  const onKindChange = (next: FormRef["kind"]) => {
    if (next === "mergeBase") {
      onChange({ kind: "mergeBase", a: emptyLeaf, b: emptyLeaf });
    } else {
      onChange(leafFromKind(next));
    }
  };
  return (
    <Field label={label}>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Select
            value={value.kind}
            onChange={(e) => onKindChange(e.target.value as FormRef["kind"])}
            className="w-32 shrink-0"
          >
            <option value="branch">Branch</option>
            <option value="commit">Commit</option>
            <option value="head">HEAD</option>
            <option value="workingTree">Working tree</option>
            <option value="mergeBase">Merge base</option>
          </Select>
          {value.kind === "branch" ? (
            <BranchSelect
              value={value.name}
              onChange={(name) => onChange({ kind: "branch", name })}
              branches={branches}
            />
          ) : value.kind === "commit" ? (
            <CommitPicker
              value={value.hash}
              onChange={(hash) => onChange({ kind: "commit", hash })}
              recentCommits={recentCommits}
            />
          ) : null}
        </div>
        {value.kind === "mergeBase" ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card/30 p-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
              Merge base of
            </div>
            <LeafPicker
              value={value.a}
              onChange={(a) => onChange({ kind: "mergeBase", a, b: value.b })}
              branches={branches}
              recentCommits={recentCommits}
            />
            <LeafPicker
              value={value.b}
              onChange={(b) => onChange({ kind: "mergeBase", a: value.a, b })}
              branches={branches}
              recentCommits={recentCommits}
            />
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function LeafPicker({
  value,
  onChange,
  branches,
  recentCommits,
}: {
  value: FormLeaf;
  onChange: (next: FormLeaf) => void;
  branches: string[];
  recentCommits: RecentCommit[];
}) {
  return (
    <div className="flex gap-2">
      <Select
        value={value.kind}
        onChange={(e) => onChange(leafFromKind(e.target.value as LeafKind))}
        className="w-32 shrink-0"
      >
        <option value="branch">Branch</option>
        <option value="commit">Commit</option>
        <option value="head">HEAD</option>
        <option value="workingTree">Working tree</option>
      </Select>
      {value.kind === "branch" ? (
        <BranchSelect
          value={value.name}
          onChange={(name) => onChange({ kind: "branch", name })}
          branches={branches}
        />
      ) : value.kind === "commit" ? (
        <CommitPicker
          value={value.hash}
          onChange={(hash) => onChange({ kind: "commit", hash })}
          recentCommits={recentCommits}
        />
      ) : null}
    </div>
  );
}

function BranchSelect({
  value,
  onChange,
  branches,
}: {
  value: string;
  onChange: (next: string) => void;
  branches: string[];
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="flex-1">
      <option value="" disabled>
        Pick a branch…
      </option>
      {branches.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
    </Select>
  );
}

function CommitPicker({
  value,
  onChange,
  recentCommits,
}: {
  value: string;
  onChange: (next: string) => void;
  recentCommits: RecentCommit[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Commit hash"
        className="font-mono"
      />
      {recentCommits.length > 0 ? (
        <Select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="h-7 text-xs"
        >
          <option value="">Recent commits…</option>
          {recentCommits.map((c) => (
            <option key={c.hash} value={c.hash}>
              {c.shortHash} · {c.subject}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  );
}

function leafFromKind(kind: LeafKind): FormLeaf {
  switch (kind) {
    case "branch":
      return { kind: "branch", name: "" };
    case "commit":
      return { kind: "commit", hash: "" };
    case "head":
      return { kind: "head" };
    case "workingTree":
      return { kind: "workingTree" };
  }
}
