package review

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sylophi/PReviewer/internal/git"
)

// Mark records the exact diff a file was reviewed at, so any later change to
// either side shows up as needing another look.
type Mark struct {
	Old string `json:"old"`
	New string `json:"new"`
}

// Review holds the marks for one branch. Marks survive switching bases: a
// file whose diff is identical under the new base stays reviewed.
type Review struct {
	Base    string          `json:"base"` // last base compared against
	Updated time.Time       `json:"updated"`
	Files   map[string]Mark `json:"files"`
}

// Reviews nobody has opened for this long are dropped.
const staleAfter = 14 * 24 * time.Hour

type FileState int

const (
	Unreviewed FileState = iota
	Reviewed
	Changed // reviewed, but the diff has moved since
)

func (r *Review) StateOf(f File) FileState {
	m, ok := r.Files[f.Path]
	switch {
	case !ok:
		return Unreviewed
	case m.Old == f.OldBlob && m.New == f.NewBlob:
		return Reviewed
	default:
		return Changed
	}
}

func (r *Review) Mark(f File) {
	r.Files[f.Path] = Mark{Old: f.OldBlob, New: f.NewBlob}
}

func (r *Review) Unmark(f File) {
	delete(r.Files, f.Path)
}

// Progress counts reviewed files, and reviewed files that changed since.
func (r *Review) Progress(files []File) (done, changed int) {
	for _, f := range files {
		switch r.StateOf(f) {
		case Reviewed:
			done++
		case Changed:
			changed++
		}
	}
	return done, changed
}

func statePath(repo git.Repo) string {
	return filepath.Join(repo.DataDir(), "state.json")
}

func loadAll(repo git.Repo) (map[string]*Review, error) {
	reviews := map[string]*Review{}
	data, err := os.ReadFile(statePath(repo))
	if errors.Is(err, os.ErrNotExist) {
		return reviews, nil
	}
	if err != nil {
		return nil, err
	}
	err = json.Unmarshal(data, &reviews)
	return reviews, err
}

func Load(repo git.Repo, key string) (*Review, error) {
	reviews, err := loadAll(repo)
	if err != nil {
		return nil, err
	}
	if r := reviews[key]; r != nil {
		return r, nil
	}
	return &Review{Files: map[string]Mark{}}, nil
}

// Open loads the review for key and records base as the one last used.
// Saving on open also keeps the review from going stale.
func Open(repo git.Repo, key, base string) (*Review, error) {
	r, err := Load(repo, key)
	if err != nil {
		return nil, err
	}
	r.Base = base
	return r, Save(repo, key, r)
}

// Save rewrites only this review, so prv sessions on other branches or
// worktrees of the repo don't undo each other's marks.
func Save(repo git.Repo, key string, r *Review) error {
	reviews, err := loadAll(repo)
	if err != nil {
		return err
	}
	r.Updated = time.Now()
	reviews[key] = r
	return saveAll(repo, reviews)
}

// Prune drops reviews that have gone stale: their branch or worktree is gone,
// or nobody has opened them in a while. Their snapshots go with them.
func Prune(repo git.Repo) error {
	reviews, err := loadAll(repo)
	if err != nil || len(reviews) == 0 {
		return err
	}
	refs, err := repo.Refs()
	if err != nil {
		return err
	}
	branches := map[string]bool{}
	for _, ref := range refs {
		if ref.Kind == "branch" {
			branches[ref.Name] = true
		}
	}
	pruned := false
	for key, r := range reviews {
		gone := time.Since(r.Updated) > staleAfter
		if branch, ok := strings.CutPrefix(key, "branch:"); ok && !branches[branch] {
			gone = true
		}
		if dir, ok := strings.CutPrefix(key, "worktree:"); ok {
			if _, err := os.Stat(dir); err != nil {
				gone = true
			}
		}
		if gone {
			delete(reviews, key)
			os.RemoveAll(snapshotDir(repo, key))
			pruned = true
		}
	}
	if !pruned {
		return nil
	}
	return saveAll(repo, reviews)
}

func snapshotDir(repo git.Repo, key string) string {
	return filepath.Join(repo.DataDir(), "snapshots", strings.NewReplacer("/", "-", ":", "-").Replace(key))
}

func saveAll(repo git.Repo, reviews map[string]*Review) error {
	data, err := json.MarshalIndent(reviews, "", "  ")
	if err != nil {
		return err
	}
	path := statePath(repo)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
