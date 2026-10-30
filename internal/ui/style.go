package ui

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

var (
	dim     = lipgloss.NewStyle().Faint(true)
	bold    = lipgloss.NewStyle().Bold(true)
	accent  = lipgloss.NewStyle().Foreground(lipgloss.Color("5")).Bold(true)
	green   = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	yellow  = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	red     = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))
	blue    = lipgloss.NewStyle().Foreground(lipgloss.Color("4"))
	errText = red
)

var statusColor = map[byte]lipgloss.Style{'A': green, 'M': yellow, 'D': red, 'R': blue}

func header(parts ...string) string {
	return accent.Render("prv") + "  " + strings.Join(parts, " ")
}

// help renders key, action pairs for the footer.
func help(pairs ...string) string {
	var out []string
	for i := 0; i+1 < len(pairs); i += 2 {
		out = append(out, pairs[i]+" "+dim.Render(pairs[i+1]))
	}
	return strings.Join(out, "   ")
}

func cursorMark(selected bool) string {
	if selected {
		return accent.Render("▌")
	}
	return " "
}

// list keeps a scroll offset so the selected line stays in view, unless the
// wheel scrolled it away, and remembers where its lines were drawn so clicks
// can find them.
type list struct {
	cursor, offset int
	free           bool // scrolled by the wheel, so the view doesn't follow the cursor
	top, shown     int
}

func (l *list) move(delta, n int) {
	l.cursor = max(0, min(n-1, l.cursor+delta))
}

// wheel scrolls the view a line per wheel step, leaving the cursor be.
func (l *list) wheel(b tea.MouseButton) {
	switch b {
	case tea.MouseWheelUp:
		l.offset = max(0, l.offset-1)
	case tea.MouseWheelDown:
		l.offset++ // window clamps it to the end
	default:
		return
	}
	l.free = true
}

// window returns the lines visible in height rows, scrolled to keep line, the
// index of the selected line within lines, in view unless the wheel moved it.
func (l *list) window(lines []string, line, height int) []string {
	if height <= 0 || len(lines) <= height {
		l.offset = 0
		return lines
	}
	if !l.free {
		if line < l.offset {
			l.offset = line
		}
		if line >= l.offset+height {
			l.offset = line - height + 1
		}
	}
	l.offset = min(l.offset, len(lines)-height)
	return lines[l.offset : l.offset+height]
}

// clicked returns the index of the line left-clicked.
func (l *list) clicked(msg tea.MouseClickMsg) (int, bool) {
	i := msg.Y - l.top
	return i + l.offset, msg.Button == tea.MouseLeft && i >= 0 && i < l.shown
}

// layout stacks header, body and footer, fitting the body to the space left.
func (l *list) layout(width, height int, header string, body func(height int) []string, footer string) string {
	headerLines := strings.Split(header, "\n")
	l.top = len(headerLines) + 1
	bodyLines := body(height - len(headerLines) - 3)
	l.shown = len(bodyLines)
	lines := append(headerLines, "")
	lines = append(lines, bodyLines...)
	for len(lines) < height-1 {
		lines = append(lines, "")
	}
	lines = append(lines, footer)
	if width > 0 {
		for i, l := range lines {
			lines[i] = ansi.Truncate(l, width, "…")
		}
	}
	return strings.Join(lines, "\n")
}
