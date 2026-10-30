package ui

import (
	"fmt"
	"path"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sylophi/PReviewer/internal/git"
	"github.com/sylophi/PReviewer/internal/review"
)

// The working tree is re-read on this interval so changes an agent is still
// making show up without a manual refresh.
const pollInterval = 2 * time.Second

var nextReviewID int

type reviewScreen struct {
	id     int
	repo   git.Repo
	target review.Target
	files  []review.File
	rev    *review.Review
	loaded bool
	err    error
	note   string
	list
}

type filesMsg struct {
	id    int
	files []review.File
	err   error
}

type tickMsg struct{ id int }

type noteMsg struct{ note string }

func newReview(repo git.Repo, base string) *reviewScreen {
	nextReviewID++
	r := &reviewScreen{id: nextReviewID, repo: repo, target: review.New(repo, base)}
	r.rev, r.err = review.Open(repo, r.target.Key, base)
	return r
}

func (r *reviewScreen) Init() tea.Cmd {
	if r.err != nil {
		return nil
	}
	return r.compute()
}

func (r *reviewScreen) compute() tea.Cmd {
	id, t := r.id, r.target
	return func() tea.Msg {
		files, err := review.Compute(t)
		return filesMsg{id, files, err}
	}
}

func (r *reviewScreen) tick() tea.Cmd {
	id := r.id
	return tea.Tick(pollInterval, func(time.Time) tea.Msg { return tickMsg{id} })
}

func (r *reviewScreen) current() (review.File, bool) {
	if r.cursor < len(r.files) {
		return r.files[r.cursor], true
	}
	return review.File{}, false
}

func (r *reviewScreen) Update(msg tea.Msg) (screen, tea.Cmd) {
	switch msg := msg.(type) {
	case filesMsg:
		if msg.id != r.id {
			return r, nil
		}
		r.err = msg.err
		if msg.err == nil {
			r.applyFiles(msg.files)
		}
		return r, r.tick()

	case tickMsg:
		if msg.id == r.id {
			return r, r.compute()
		}

	case noteMsg:
		r.note = msg.note

	case tea.KeyPressMsg:
		return r, r.key(msg.String())

	case tea.MouseWheelMsg:
		r.wheel(msg.Button, len(r.files))

	case tea.MouseClickMsg:
		return r, r.click(msg)
	}
	return r, nil
}

// markColumns spans the cursor and review mark that start each fileLine.
const markColumns = 4

// click opens the file under the pointer, or toggles it reviewed when the
// click lands on its mark.
func (r *reviewScreen) click(msg tea.MouseClickMsg) tea.Cmd {
	r.note = ""
	i, ok := r.clicked(msg)
	if !ok || i >= len(r.files) {
		return nil
	}
	if msg.X < markColumns {
		r.toggle(r.files[i])
		return nil
	}
	r.cursor = i
	return r.open([]review.File{r.files[i]})
}

// applyFiles swaps in fresh changes, keeping the cursor on the same file.
func (r *reviewScreen) applyFiles(files []review.File) {
	selected, hadSelection := r.current()
	r.files = files
	r.loaded = true
	if hadSelection {
		for i, f := range files {
			if f.Path == selected.Path {
				r.cursor = i
			}
		}
	}
	r.move(0, len(files))
}

func (r *reviewScreen) save() {
	if err := review.Save(r.repo, r.target.Key, r.rev); err != nil {
		r.err = err
	}
}

func (r *reviewScreen) key(k string) tea.Cmd {
	r.note = ""
	n := len(r.files)
	switch k {
	case "q":
		return tea.Quit
	case "esc", "backspace", "h", "left":
		return func() tea.Msg { return pickBaseMsg{} }
	case "up", "k":
		r.move(-1, n)
	case "down", "j":
		r.move(1, n)
	case "g", "home":
		r.cursor = 0
	case "G", "end":
		r.move(n, n)
	}
	if !r.loaded {
		return nil
	}
	switch k {
	case "space", "x":
		if f, ok := r.current(); ok {
			r.toggle(f)
		}
	case "enter", "o", "l", "right":
		if f, ok := r.current(); ok {
			return r.open([]review.File{f})
		}
	case "a":
		var files []review.File
		for _, f := range r.files {
			if r.rev.StateOf(f) != review.Reviewed {
				files = append(files, f)
			}
		}
		if len(files) == 0 {
			r.note = "everything is reviewed"
			return nil
		}
		return r.open(files)
	}
	return nil
}

// toggle marks a file reviewed, or unmarks it.
func (r *reviewScreen) toggle(f review.File) {
	if r.rev.StateOf(f) == review.Reviewed {
		r.rev.Unmark(f)
	} else {
		r.rev.Mark(f)
	}
	r.save()
}

func (r *reviewScreen) open(files []review.File) tea.Cmd {
	repo, t := r.repo, r.target
	return func() tea.Msg {
		if err := review.OpenInZed(repo, t, files); err != nil {
			return noteMsg{errText.Render("zed: " + err.Error())}
		}
		if len(files) == 1 {
			return noteMsg{"opened " + files[0].Path}
		}
		return noteMsg{fmt.Sprintf("opened %d files", len(files))}
	}
}

func (r *reviewScreen) View(width, height int) string {
	footer := help("enter", "open", "space", "reviewed", "a", "open unreviewed", "esc", "change base", "q", "quit")
	t := r.target
	header := header(bold.Render(t.Title), dim.Render("vs"), t.Base)
	if r.loaded && len(r.files) > 0 {
		done, changed := r.rev.Progress(r.files)
		header += "  " + progress(done, changed, len(r.files))
	}
	if r.err != nil {
		header += "\n" + errText.Render(r.err.Error())
	} else if r.note != "" {
		header += "\n" + r.note
	}

	body := func(height int) []string {
		if !r.loaded {
			return []string{dim.Render("loading…")}
		}
		if len(r.files) == 0 {
			return []string{dim.Render("no changes")}
		}
		nameWidth, statWidth := 0, 0
		for _, f := range r.files {
			nameWidth = max(nameWidth, ansi.StringWidth(r.fileName(f, false)))
			statWidth = max(statWidth, ansi.StringWidth(stats(f)))
		}
		lines := make([]string, len(r.files))
		for i, f := range r.files {
			lines[i] = r.fileLine(f, i == r.cursor, nameWidth, statWidth)
		}
		return r.window(lines, r.cursor, height)
	}
	return r.layout(width, height, header, body, footer)
}

// fileLine renders one file, with the stats right-aligned in a column after
// the longest name.
func (r *reviewScreen) fileLine(f review.File, selected bool, nameWidth, statWidth int) string {
	var mark string
	switch r.rev.StateOf(f) {
	case review.Reviewed:
		mark = green.Render("✓")
	case review.Changed:
		mark = yellow.Render("●")
	default:
		mark = dim.Render("○")
	}
	status := statusColor[f.Status].Render(string(f.Status))
	name, st := r.fileName(f, selected), stats(f)
	gap := nameWidth - ansi.StringWidth(name) + 2 + statWidth - ansi.StringWidth(st)
	return fmt.Sprintf("%s %s %s %s%s%s", cursorMark(selected), mark, status, name, strings.Repeat(" ", gap), st)
}

// fileName dims the directory, or the whole path once reviewed, and shows
// where a renamed file came from.
func (r *reviewScreen) fileName(f review.File, selected bool) string {
	dir, base := path.Split(f.Path)
	name := dim.Render(dir) + base
	if r.rev.StateOf(f) == review.Reviewed {
		name = dim.Render(f.Path)
	} else if selected {
		name = dim.Render(dir) + accent.Render(base)
	}
	if f.Status == 'R' {
		name += dim.Render(" ← " + f.OldPath)
	}
	return name
}

// stats renders "+added -deleted".
func stats(f review.File) string {
	if f.Binary {
		return dim.Render("binary")
	}
	var parts []string
	if f.Added > 0 {
		parts = append(parts, green.Render(fmt.Sprintf("+%d", f.Added)))
	}
	if f.Deleted > 0 {
		parts = append(parts, red.Render(fmt.Sprintf("-%d", f.Deleted)))
	}
	return strings.Join(parts, " ")
}

const barWidth = 20

// progress draws a bar of reviewed files in green and changed ones in
// yellow, so the ● mark explains itself.
func progress(done, changed, total int) string {
	d := done * barWidth / total
	c := (done+changed)*barWidth/total - d
	bar := green.Render(strings.Repeat("━", d)) + yellow.Render(strings.Repeat("━", c)) + dim.Render(strings.Repeat("━", barWidth-d-c))
	text := fmt.Sprintf("%d/%d reviewed", done, total)
	switch {
	case changed > 0:
		text += yellow.Render(fmt.Sprintf("  ● %d changed since", changed))
	case done == total:
		text = green.Render(text + " ✓")
	}
	return bar + " " + text
}
