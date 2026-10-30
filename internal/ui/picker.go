package ui

import (
	"fmt"
	"strings"
	"unicode/utf8"

	tea "charm.land/bubbletea/v2"

	"github.com/sylophi/PReviewer/internal/git"
	"github.com/sylophi/PReviewer/internal/review"
)

type entry struct {
	ref     string
	label   string // why the ref is listed
	detail  string
	section string
}

var sections = []struct{ kind, name string }{
	{"branch", "Branches"}, {"remote", "Remote branches"}, {"tag", "Tags"},
}

// picker chooses the base to compare the current worktree against.
type picker struct {
	repo      git.Repo
	target    review.Target // the review's identity, before a base is picked
	pr        *entry
	suggested []entry
	refs      []git.Ref
	entries   []entry
	filter    string
	moved     bool // the user picked a row, so late suggestions don't steal it
	err       error
	list
}

type refsMsg struct {
	suggested []entry
	refs      []git.Ref
	err       error
}

type prBaseMsg struct{ entry *entry }

func newPicker(repo git.Repo) *picker {
	return &picker{repo: repo, target: review.New(repo, "")}
}

func (p *picker) Init() tea.Cmd {
	repo, key := p.repo, p.target.Key
	return tea.Batch(
		func() tea.Msg {
			var suggested []entry
			if rev, err := review.Load(repo, key); err == nil && rev.Base != "" && repo.IsCommit(rev.Base) {
				suggested = append(suggested, entry{ref: rev.Base, label: "last used"})
			}
			if up, err := repo.Upstream(); err == nil {
				suggested = append(suggested, entry{ref: up, label: "upstream", detail: "unpushed changes only"})
			}
			if base, err := repo.DefaultBase(); err == nil {
				suggested = append(suggested, entry{ref: base, label: "default branch"})
			}
			suggested = append(suggested, entry{ref: "HEAD", label: "uncommitted changes only"})
			refs, err := repo.Refs()
			return refsMsg{suggested, refs, err}
		},
		func() tea.Msg {
			ref, pr, err := review.PRBase(repo)
			if err != nil || !repo.IsCommit(ref) {
				return prBaseMsg{}
			}
			return prBaseMsg{&entry{ref: ref, label: fmt.Sprintf("base of PR #%d", pr.Number), detail: pr.Title}}
		},
	)
}

// rebuild lists the PR base, the other suggestions, then every ref by kind,
// keeping the first row for each ref. Both load in the background, in
// either order.
func (p *picker) rebuild() {
	var selected string
	if v := p.visible(); p.cursor < len(v) {
		selected = v[p.cursor].ref
	}
	p.entries = nil
	seen := map[string]bool{}
	add := func(e entry, section string) {
		if !seen[e.ref] {
			seen[e.ref] = true
			e.section = section
			p.entries = append(p.entries, e)
		}
	}
	if p.pr != nil {
		add(*p.pr, "Suggested")
	}
	for _, e := range p.suggested {
		add(e, "Suggested")
	}
	for _, s := range sections {
		for _, r := range p.refs {
			if r.Kind == s.kind && !(s.kind == "branch" && r.Name == p.repo.Branch) {
				add(entry{ref: r.Name, detail: r.When + "  " + r.Subject}, s.name)
			}
		}
	}
	p.cursor = 0
	for i, e := range p.visible() {
		if p.moved && e.ref == selected {
			p.cursor = i
		}
	}
}

func (p *picker) visible() []entry {
	if p.filter == "" {
		return p.entries
	}
	var out []entry
	needle := strings.ToLower(p.filter)
	for _, e := range p.entries {
		if strings.Contains(strings.ToLower(e.ref), needle) {
			out = append(out, e)
		}
	}
	return out
}

func (p *picker) Update(msg tea.Msg) (screen, tea.Cmd) {
	switch msg := msg.(type) {
	case refsMsg:
		p.err, p.suggested, p.refs = msg.err, msg.suggested, msg.refs
		p.rebuild()
	case prBaseMsg:
		if msg.entry != nil {
			p.pr = msg.entry
			p.rebuild()
		}
	case tea.KeyPressMsg:
		return p, p.key(msg)
	}
	return p, nil
}

func (p *picker) key(msg tea.KeyPressMsg) tea.Cmd {
	n := len(p.visible())
	switch msg.String() {
	case "up", "ctrl+p":
		p.move(-1, n)
		p.moved = true
	case "down", "ctrl+n":
		p.move(1, n)
		p.moved = true
	case "esc":
		if p.filter == "" {
			return tea.Quit
		}
		p.filter, p.cursor = "", 0
	case "backspace":
		if p.filter != "" {
			_, size := utf8.DecodeLastRuneInString(p.filter)
			p.filter = p.filter[:len(p.filter)-size]
			p.cursor = 0
		}
	case "enter":
		ref := p.filter
		if v := p.visible(); len(v) > 0 {
			ref = v[p.cursor].ref
		}
		if ref == "" {
			return nil
		}
		if !p.repo.IsCommit(ref) {
			p.err = fmt.Errorf("%q isn't a branch, tag or commit", ref)
			return nil
		}
		p.err = nil
		return func() tea.Msg { return openReviewMsg{ref} }
	default:
		if msg.Text != "" && (msg.Mod == 0 || msg.Mod == tea.ModShift) {
			p.filter += msg.Text
			p.cursor = 0
		}
	}
	return nil
}

func (p *picker) View(width, height int) string {
	header := header(bold.Render(p.target.Title), dim.Render("compare against…"))
	header += "\n" + accent.Render("› ") + p.filter + accent.Render("▏")
	if p.err != nil {
		header += "\n" + errText.Render(p.err.Error())
	}

	entries := p.visible()
	refWidth := map[string]int{} // per section, so one long name doesn't push every note away
	for _, e := range entries {
		refWidth[e.section] = max(refWidth[e.section], len(e.ref))
	}
	var lines []string
	selected, cur := 0, ""
	for i, e := range entries {
		if e.section != cur {
			if cur != "" {
				lines = append(lines, "")
			}
			cur = e.section
			lines = append(lines, bold.Render(cur))
		}
		if i == p.cursor {
			selected = len(lines)
		}
		name := e.ref
		if i == p.cursor {
			name = accent.Render(name)
		}
		name += strings.Repeat(" ", refWidth[e.section]-len(e.ref))
		lines = append(lines, cursorMark(i == p.cursor)+" "+name+"  "+blue.Render(e.label)+" "+dim.Render(e.detail))
	}
	if len(entries) == 0 && p.filter != "" {
		lines = append(lines, dim.Render("enter to compare against "+p.filter))
	}

	body := func(height int) []string { return p.window(lines, selected, height) }
	return layout(width, height, header, body, help("type", "to filter", "↑↓", "move", "enter", "compare", "esc", "quit"))
}
