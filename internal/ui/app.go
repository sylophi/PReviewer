package ui

import (
	tea "charm.land/bubbletea/v2"

	"github.com/sylophi/PReviewer/internal/git"
)

type screen interface {
	Update(tea.Msg) (screen, tea.Cmd)
	View(width, height int) string
}

type openReviewMsg struct{ base string }
type pickBaseMsg struct{}

type App struct {
	repo          git.Repo
	picker        *picker
	screen        screen
	init          tea.Cmd
	width, height int
}

// New starts on the base picker, or straight into a review when base is set.
func New(repo git.Repo, base string) App {
	a := App{repo: repo, picker: newPicker(repo)}
	a.screen, a.init = a.picker, a.picker.Init()
	if base != "" {
		r := newReview(repo, base)
		a.screen, a.init = r, tea.Batch(a.init, r.Init())
	}
	return a
}

func (a App) Init() tea.Cmd { return a.init }

func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		a.width, a.height = msg.Width, msg.Height
		return a, nil
	case tea.KeyPressMsg:
		if msg.String() == "ctrl+c" {
			return a, tea.Quit
		}
	case refsMsg, prBaseMsg:
		// The picker loads in the background even while a review is open.
		_, cmd := a.picker.Update(msg)
		return a, cmd
	case openReviewMsg:
		r := newReview(a.repo, msg.base)
		a.screen = r
		return a, r.Init()
	case pickBaseMsg:
		a.screen = a.picker
		return a, nil
	}
	var cmd tea.Cmd
	a.screen, cmd = a.screen.Update(msg)
	return a, cmd
}

func (a App) View() tea.View {
	v := tea.NewView(a.screen.View(a.width, a.height))
	v.AltScreen = true
	v.WindowTitle = "prv"
	return v
}
