package git

import (
	"bytes"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// Run runs git in dir and returns stdout.
func Run(dir string, args ...string) (string, error) {
	out, err := RunBytes(dir, nil, args...)
	return string(out), err
}

// RunBytes runs git in dir, feeding stdin when given, and returns raw stdout.
// It never takes optional locks, so the 2s refresh can't make an agent's
// git commands in the same worktree fail on index.lock.
func RunBytes(dir string, stdin []byte, args ...string) ([]byte, error) {
	cmd := exec.Command("git", append([]string{"--no-optional-locks", "-C", dir}, args...)...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf("git %s: %s", args[0], msg)
	}
	return stdout.Bytes(), nil
}

type Repo struct {
	// Root is the top level of the worktree prv was opened in. Its working
	// tree is always the "after" side of the diff.
	Root string
	// CommonDir is the .git directory shared by all worktrees.
	CommonDir string
	// Branch is empty when HEAD is detached.
	Branch string
}

func Open(dir string) (Repo, error) {
	out, err := Run(dir, "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel")
	if err != nil {
		return Repo{}, errors.New("not inside a git worktree")
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	r := Repo{CommonDir: lines[0], Root: lines[1]}
	branch, _ := Run(r.Root, "symbolic-ref", "--short", "-q", "HEAD")
	r.Branch = strings.TrimSpace(branch)
	return r, nil
}

// DataDir is where prv keeps its state and base snapshots.
func (r Repo) DataDir() string {
	return filepath.Join(r.CommonDir, "prv")
}

type Ref struct {
	Name    string
	Kind    string // branch, remote or tag
	When    string // relative commit or tag date
	Subject string
}

// Refs lists branches, remote branches and tags, most recently committed first.
func (r Repo) Refs() ([]Ref, error) {
	out, err := Run(r.Root, "for-each-ref", "--sort=-creatordate",
		"--format=%(refname)%00%(refname:short)%00%(creatordate:relative)%00%(subject)%00%(symref)",
		"refs/heads", "refs/remotes", "refs/tags")
	if err != nil {
		return nil, err
	}
	var refs []Ref
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		f := strings.Split(line, "\x00")
		if len(f) < 5 || f[4] != "" {
			continue // symbolic refs like origin/HEAD
		}
		ref := Ref{Name: f[1], When: f[2], Subject: f[3]}
		switch {
		case strings.HasPrefix(f[0], "refs/heads/"):
			ref.Kind = "branch"
		case strings.HasPrefix(f[0], "refs/remotes/"):
			ref.Kind = "remote"
		default:
			ref.Kind = "tag"
		}
		refs = append(refs, ref)
	}
	return refs, nil
}

// IsCommit reports whether rev names a commit, e.g. a sha or HEAD~3.
func (r Repo) IsCommit(rev string) bool {
	_, err := Run(r.Root, "rev-parse", "--verify", "--quiet", rev+"^{commit}")
	return err == nil
}

// Upstream returns the branch's upstream, like origin/feature.
func (r Repo) Upstream() (string, error) {
	out, err := Run(r.Root, "rev-parse", "--abbrev-ref", "@{upstream}")
	return strings.TrimSpace(out), err
}

// DefaultBase picks the ref this branch should be compared against: the
// remote default branch, or its local counterpart when that is further along
// (an agent branched off unpushed work, or this is the default branch itself).
func (r Repo) DefaultBase() (string, error) {
	var candidates []string
	if out, err := Run(r.Root, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"); err == nil {
		remote := strings.TrimSpace(out)
		candidates = append(candidates, remote, strings.TrimPrefix(remote, "origin/"))
	} else {
		candidates = append(candidates, "main", "master")
	}

	var best, bestBase string
	for _, ref := range candidates {
		mb, err := Run(r.Root, "merge-base", ref, "HEAD")
		if err != nil {
			continue
		}
		mb = strings.TrimSpace(mb)
		if best == "" || r.isAncestor(bestBase, mb) {
			best, bestBase = ref, mb
		}
	}
	if best == "" {
		return "", errors.New("no default branch found to compare against")
	}
	return best, nil
}

func (r Repo) isAncestor(a, b string) bool {
	_, err := Run(r.Root, "merge-base", "--is-ancestor", a, b)
	return err == nil
}
