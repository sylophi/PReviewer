package review

import (
	"bytes"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/sylophi/PReviewer/internal/git"
)

type File struct {
	Path    string
	OldPath string // differs from Path for renames
	Status  byte   // A, M, D or R
	Added   int
	Deleted int
	Binary  bool
	OldBlob string // empty when added
	NewBlob string // empty when deleted
}

// Compute lists every change in the target's working tree since its merge
// base: committed, uncommitted and untracked alike.
func Compute(t Target) ([]File, error) {
	mb, err := git.Run(t.Dir, "merge-base", t.Base, "HEAD")
	if err != nil {
		return nil, err
	}
	mb = strings.TrimSpace(mb)

	raw, err := git.Run(t.Dir, "diff", "--raw", "-z", "-M", "--no-abbrev", mb)
	if err != nil {
		return nil, err
	}
	files := parseRaw(raw)
	byPath := map[string]*File{}
	for i := range files {
		byPath[files[i].Path] = &files[i]
	}

	numstat, err := git.Run(t.Dir, "diff", "--numstat", "-z", "-M", mb)
	if err != nil {
		return nil, err
	}
	applyNumstat(numstat, byPath)

	untracked, err := git.Run(t.Dir, "ls-files", "-z", "--others", "--exclude-standard")
	if err != nil {
		return nil, err
	}
	for _, path := range splitZ(untracked) {
		f := File{Path: path, OldPath: path, Status: 'A'}
		if data, err := os.ReadFile(filepath.Join(t.Dir, path)); err == nil {
			f.Binary = bytes.IndexByte(data, 0) >= 0
			if !f.Binary {
				f.Added = bytes.Count(data, []byte("\n"))
				if len(data) > 0 && data[len(data)-1] != '\n' {
					f.Added++
				}
			}
		}
		files = append(files, f)
	}

	if err := hashWorktree(t.Dir, files); err != nil {
		return nil, err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files, nil
}

// parseRaw reads `git diff --raw -z` records:
// ":<mode> <mode> <old> <new> <status>\0<path>\0[<path>\0]".
func parseRaw(out string) []File {
	parts := splitZ(out)
	var files []File
	for i := 0; i < len(parts); i++ {
		meta := strings.Fields(strings.TrimPrefix(parts[i], ":"))
		if len(meta) < 5 || i+1 >= len(parts) {
			break
		}
		f := File{Status: meta[4][0], OldBlob: meta[2], NewBlob: meta[3]}
		f.OldPath = parts[i+1]
		f.Path = f.OldPath
		i++
		if f.Status == 'R' || f.Status == 'C' {
			i++
			f.Path = parts[i]
			f.Status = 'R'
		}
		if f.Status == 'A' {
			f.OldBlob = ""
		}
		if f.Status == 'D' {
			f.NewBlob = ""
		}
		if f.Status == 'T' {
			f.Status = 'M'
		}
		files = append(files, f)
	}
	return files
}

// applyNumstat reads `git diff --numstat -z` records:
// "<added>\t<deleted>\t<path>\0" or "<added>\t<deleted>\t\0<old>\0<new>\0".
func applyNumstat(out string, byPath map[string]*File) {
	parts := splitZ(out)
	for i := 0; i < len(parts); i++ {
		fields := strings.SplitN(parts[i], "\t", 3)
		if len(fields) < 3 {
			continue
		}
		path := fields[2]
		if path == "" && i+2 < len(parts) {
			path = parts[i+2]
			i += 2
		}
		f := byPath[path]
		if f == nil {
			continue
		}
		if fields[0] == "-" {
			f.Binary = true
			continue
		}
		f.Added, _ = strconv.Atoi(fields[0])
		f.Deleted, _ = strconv.Atoi(fields[1])
	}
}

// hashWorktree fills in the blob ids the raw diff leaves zeroed: files
// changed in the working tree, and untracked ones. Symlinks are identified by
// their target, since hash-object would follow them, and anything else that
// isn't a regular file, like a submodule, keeps what the diff reported.
func hashWorktree(dir string, files []File) error {
	var paths []string
	var idx []int
	for i, f := range files {
		if f.Status == 'D' {
			continue
		}
		path := filepath.Join(dir, f.Path)
		info, err := os.Lstat(path)
		if err != nil {
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 {
			target, _ := os.Readlink(path)
			files[i].NewBlob = "symlink:" + target
		} else if info.Mode().IsRegular() && strings.Trim(f.NewBlob, "0") == "" {
			paths = append(paths, f.Path)
			idx = append(idx, i)
		}
	}
	if len(paths) == 0 {
		return nil
	}
	out, err := git.RunBytes(dir, []byte(strings.Join(paths, "\n")+"\n"), "hash-object", "--stdin-paths")
	if err != nil {
		return err
	}
	for i, sha := range strings.Fields(string(out)) {
		files[idx[i]].NewBlob = sha
	}
	return nil
}

func splitZ(s string) []string {
	s = strings.TrimSuffix(s, "\x00")
	if s == "" {
		return nil
	}
	return strings.Split(s, "\x00")
}
