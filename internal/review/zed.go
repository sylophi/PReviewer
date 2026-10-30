package review

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/sylophi/PReviewer/internal/git"
)

// OpenInZed shows each file as a full-file diff inside the target's project,
// so the new side is the real file and language servers work across it.
func OpenInZed(repo git.Repo, t Target, files []File) error {
	snapshots := snapshotDir(repo, t.Key)
	var args []string
	for _, f := range files {
		old := filepath.Join(snapshots, "base", f.OldPath)
		if err := writeSnapshot(t.Dir, old, f.OldBlob); err != nil {
			return err
		}
		cur := filepath.Join(t.Dir, f.Path)
		if f.Status == 'D' {
			cur = filepath.Join(snapshots, "deleted", f.Path)
			if err := writeSnapshot(t.Dir, cur, ""); err != nil {
				return err
			}
		}
		args = append(args, "--diff", old, cur)
	}
	// -e reuses the project's window instead of opening one per diff. The
	// project path has to come last, or zed reads the flags as paths.
	out, err := exec.Command("zed", append(append([]string{"-e"}, args...), t.Dir)...).CombinedOutput()
	if msg := strings.TrimSpace(string(out)); err != nil && msg != "" {
		return errors.New(msg)
	}
	return err
}

// writeSnapshot writes a blob read-only, so edits land in the real file.
func writeSnapshot(dir, path, blob string) error {
	var data []byte
	if blob != "" {
		var err error
		if data, err = git.RunBytes(dir, nil, "cat-file", "blob", blob); err != nil {
			return err
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	os.Remove(path)
	return os.WriteFile(path, data, 0o444)
}
