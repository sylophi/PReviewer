package review

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sylophi/PReviewer/internal/git"
)

func sh(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %s", args, out)
	}
}

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	path := filepath.Join(dir, name)
	os.MkdirAll(filepath.Dir(path), 0o755)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestComputeAndMarks(t *testing.T) {
	dir := t.TempDir()
	sh(t, dir, "init", "-q", "-b", "main")
	write(t, dir, "keep.txt", "a\nb\nc\n")
	write(t, dir, "gone.txt", "bye\n")
	write(t, dir, "old/name.txt", strings.Repeat("same line\n", 20))
	sh(t, dir, "add", ".")
	sh(t, dir, "commit", "-qm", "base")

	sh(t, dir, "switch", "-qc", "feature")
	write(t, dir, "committed.txt", "one\n")
	sh(t, dir, "add", ".")
	sh(t, dir, "commit", "-qm", "work")
	sh(t, dir, "rm", "-q", "gone.txt")
	os.Mkdir(filepath.Join(dir, "new"), 0o755)
	sh(t, dir, "mv", "old/name.txt", "new/name.txt")
	write(t, dir, "keep.txt", "a\nB\nc\n")
	write(t, dir, "untracked.txt", "x\ny")

	repo, err := git.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	base, err := repo.DefaultBase()
	if err != nil || base != "main" {
		t.Fatalf("base = %q, %v", base, err)
	}
	tgt := New(repo, base)
	files, err := Compute(tgt)
	if err != nil {
		t.Fatal(err)
	}

	got := map[string]File{}
	for _, f := range files {
		got[f.Path] = f
	}
	want := map[string]struct {
		status       byte
		added, deled int
	}{
		"committed.txt": {'A', 1, 0},
		"gone.txt":      {'D', 0, 1},
		"keep.txt":      {'M', 1, 1},
		"new/name.txt":  {'R', 0, 0},
		"untracked.txt": {'A', 2, 0},
	}
	if len(got) != len(want) {
		t.Fatalf("files = %v", files)
	}
	for path, w := range want {
		f, ok := got[path]
		if !ok || f.Status != w.status || f.Added != w.added || f.Deleted != w.deled {
			t.Errorf("%s = %+v, want %+v", path, f, w)
		}
		if (f.Status == 'A') != (f.OldBlob == "") || (f.Status == 'D') != (f.NewBlob == "") {
			t.Errorf("%s blobs = %q %q", path, f.OldBlob, f.NewBlob)
		}
	}
	if got["new/name.txt"].OldPath != "old/name.txt" {
		t.Errorf("rename old path = %q", got["new/name.txt"].OldPath)
	}

	rev, _ := Load(repo, tgt.Key)
	rev.Mark(got["keep.txt"])
	if err := Save(repo, tgt.Key, rev); err != nil {
		t.Fatal(err)
	}

	write(t, dir, "keep.txt", "a\nB\nC\n")
	files, _ = Compute(tgt)
	rev, _ = Load(repo, tgt.Key)
	for _, f := range files {
		if f.Path == "keep.txt" && rev.StateOf(f) != Changed {
			t.Errorf("keep.txt should be flagged as changed since review")
		}
	}
}

// hash-object follows symlinks, so a dangling one used to fail the whole list.
func TestComputeWithSymlinks(t *testing.T) {
	dir := t.TempDir()
	sh(t, dir, "init", "-q", "-b", "main")
	write(t, dir, "a.txt", "a\n")
	os.Symlink("a.txt", filepath.Join(dir, "link"))
	sh(t, dir, "add", ".")
	sh(t, dir, "commit", "-qm", "base")
	os.Remove(filepath.Join(dir, "link"))
	os.Symlink("missing.txt", filepath.Join(dir, "link"))
	os.Symlink(dir, filepath.Join(dir, "dirlink"))

	repo, err := git.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	files, err := Compute(New(repo, "HEAD"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 || files[1].NewBlob != "symlink:missing.txt" {
		t.Errorf("files = %+v", files)
	}
}

func TestPrune(t *testing.T) {
	dir := t.TempDir()
	sh(t, dir, "init", "-q", "-b", "main")
	write(t, dir, "a.txt", "a\n")
	sh(t, dir, "add", ".")
	sh(t, dir, "commit", "-qm", "base")
	repo, err := git.Open(dir)
	if err != nil {
		t.Fatal(err)
	}

	for _, key := range []string{"branch:main", "branch:deleted", "worktree:" + filepath.Join(dir, "gone"), "branch:old"} {
		if err := Save(repo, key, &Review{Files: map[string]Mark{}}); err != nil {
			t.Fatal(err)
		}
		os.MkdirAll(snapshotDir(repo, key), 0o755)
	}
	sh(t, dir, "branch", "old")
	reviews, _ := loadAll(repo)
	reviews["branch:old"].Updated = time.Now().Add(-15 * 24 * time.Hour)
	saveAll(repo, reviews)

	if err := Prune(repo); err != nil {
		t.Fatal(err)
	}
	reviews, _ = loadAll(repo)
	if len(reviews) != 1 || reviews["branch:main"] == nil {
		t.Errorf("kept %v, want only branch:main", reviews)
	}
	for _, key := range []string{"branch:deleted", "branch:old"} {
		if _, err := os.Stat(snapshotDir(repo, key)); err == nil {
			t.Errorf("snapshots for %s were kept", key)
		}
	}
}
