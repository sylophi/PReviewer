package review

import (
	"fmt"
	"strings"

	"github.com/sylophi/PReviewer/internal/gh"
	"github.com/sylophi/PReviewer/internal/git"
)

// Target is what's being reviewed: the working tree prv was opened in,
// against the point where it diverged from Base.
type Target struct {
	Key   string // identifies the review in state
	Title string
	Dir   string
	Base  string
}

func New(repo git.Repo, base string) Target {
	t := Target{Dir: repo.Root, Base: base, Key: "branch:" + repo.Branch, Title: repo.Branch}
	if repo.Branch == "" {
		t.Key = "worktree:" + repo.Root
		head, _ := git.Run(repo.Root, "rev-parse", "--short", "HEAD")
		t.Title = "detached at " + strings.TrimSpace(head)
	}
	return t
}

// PRBase finds the ref for the base branch of the current branch's pull
// request, as fetched from the remote that points at the PR's repository.
func PRBase(repo git.Repo) (string, gh.PR, error) {
	pr, err := gh.Current(repo.Root)
	if err != nil {
		return "", pr, err
	}
	remote := remoteFor(repo, pr.Repo())
	if remote == "" {
		return "", pr, fmt.Errorf("no remote for %s", pr.Repo())
	}
	return remote + "/" + pr.BaseRefName, pr, nil
}

func remoteFor(repo git.Repo, ghRepo string) string {
	out, _ := git.Run(repo.Root, "remote", "-v")
	want := strings.ToLower(ghRepo)
	for _, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		url := strings.TrimSuffix(strings.ToLower(fields[1]), ".git")
		if strings.HasSuffix(url, "github.com/"+want) || strings.HasSuffix(url, "github.com:"+want) {
			return fields[0]
		}
	}
	return ""
}
