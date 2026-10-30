package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"

	tea "charm.land/bubbletea/v2"
	clikit "github.com/dittofleet/go-cli-kit"
	"github.com/dittofleet/go-cli-kit/postinstall"
	"github.com/dittofleet/go-cli-kit/selfupdate"
	"github.com/dittofleet/go-cli-kit/uninstall"
	"github.com/dittofleet/go-cli-kit/updatecheck"

	"github.com/sylophi/PReviewer/internal/git"
	"github.com/sylophi/PReviewer/internal/review"
	"github.com/sylophi/PReviewer/internal/ui"
)

var version = "dev"

const usage = `prv: review this worktree's changes in Zed with the whole project around them

Usage:
  prv                    pick a ref to compare this worktree against
  prv <ref>              compare against ref, e.g. prv origin/main
  prv update             install the latest version
  prv uninstall [--yes]  remove prv
  prv version            print the installed version
`

var errNoZed = errors.New(`the zed command isn't installed; in Zed, run "cli: install" from the command palette`)

func main() {
	args := os.Args[1:]
	app := clikit.App{Owner: "sylophi", Name: "prv", RepoName: "PReviewer", Version: version}
	if err := run(app, args); err != nil {
		fmt.Fprintln(os.Stderr, "prv:", err)
		os.Exit(1)
	}
	command := "review"
	if len(args) > 0 {
		command = args[0]
	}
	updatecheck.MaybeCheck(app, command)
}

func run(app clikit.App, args []string) error {
	if len(args) > 0 {
		switch args[0] {
		case "help", "-h", "--help":
			fmt.Print(usage)
			return nil
		case "version", "-v", "--version":
			fmt.Println(version)
			return nil
		case "update":
			_, err := selfupdate.Run(app)
			return err
		case "uninstall":
			yes := len(args) == 2 && args[1] == "--yes"
			if len(args) > 1 && !yes {
				return errors.New("usage: prv uninstall [--yes]")
			}
			return uninstall.Run(app, yes, uninstall.Plan{
				Notice: "Review progress in each repository's .git/prv is left alone.",
			})
		case "postinstall":
			return postinstall.Run(app, func() error {
				// Not fatal: Zed can be set up after prv.
				if _, err := exec.LookPath("zed"); err != nil {
					fmt.Fprintln(os.Stderr, "Note:", errNoZed)
				}
				return nil
			})
		}
	}
	if len(args) > 1 {
		fmt.Print(usage)
		return nil
	}
	return reviewWorktree(args)
}

func reviewWorktree(args []string) error {
	if _, err := exec.LookPath("zed"); err != nil {
		return errNoZed
	}
	repo, err := git.Open(".")
	if err != nil {
		return err
	}
	if !repo.IsCommit("HEAD") {
		return errors.New("this repository has no commits yet")
	}
	if err := review.Prune(repo); err != nil {
		return err
	}

	var base string
	if len(args) == 1 {
		base = args[0]
		if !repo.IsCommit(base) {
			return fmt.Errorf("%q isn't a branch, tag or commit", base)
		}
	}
	_, err = tea.NewProgram(ui.New(repo, base)).Run()
	return err
}
