package gh

import (
	"encoding/json"
	"os/exec"
	"strconv"
	"strings"
)

type PR struct {
	Number      int    `json:"number"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	BaseRefName string `json:"baseRefName"`
}

// Current returns the pull request for the branch checked out in dir.
func Current(dir string) (PR, error) {
	var p PR
	cmd := exec.Command("gh", "pr", "view", "--json", "number,title,url,baseRefName")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return p, err
	}
	return p, json.Unmarshal(out, &p)
}

// Repo returns the owner/name of the PR's base repository.
func (p PR) Repo() string {
	path := strings.TrimPrefix(p.URL, "https://github.com/")
	return strings.TrimSuffix(path, "/pull/"+strconv.Itoa(p.Number))
}
