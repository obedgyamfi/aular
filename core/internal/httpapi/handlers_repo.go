package httpapi

import (
	"context"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// The repository log — the org's git work, served raw for the desktop's
// commit graph. Local-first: the agents commit on this machine (as
// themselves, per the git-identity doctrine), and this endpoint lets the
// user watch that history without leaving the app.

type repoCommit struct {
	Hash    string   `json:"hash"`
	Parents []string `json:"parents"`
	Author  string   `json:"author"`
	Date    string   `json:"date"`
	Refs    []string `json:"refs,omitempty"`
	Subject string   `json:"subject"`
}

// GET /api/v1/repo/log?path=/abs/repo&limit=80
// All refs, date-ordered — what a graph needs to draw lanes.
func (s *Server) handleRepoLog(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}
	path = filepath.Clean(path)
	if !filepath.IsAbs(path) {
		if home, err := os.UserHomeDir(); err == nil {
			path = filepath.Join(home, path)
		}
	}
	if st, err := os.Stat(filepath.Join(path, ".git")); err != nil || !st.IsDir() {
		writeError(w, http.StatusNotFound, "not a git repository: "+path)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 300 {
		limit = 80
	}

	// %x1f (unit separator) can't appear in subjects; %D carries the refs.
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "-C", path, "log", "--all",
		"--date-order", "--date=iso-strict", "-n", strconv.Itoa(limit),
		"--pretty=format:%H\x1f%P\x1f%an\x1f%ad\x1f%D\x1f%s")
	out, err := cmd.Output()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "git log: "+err.Error())
		return
	}

	commits := []repoCommit{}
	for _, line := range strings.Split(string(out), "\n") {
		f := strings.Split(line, "\x1f")
		if len(f) < 6 {
			continue
		}
		c := repoCommit{
			Hash:    f[0],
			Author:  f[2],
			Date:    f[3],
			Subject: f[5],
		}
		if f[1] != "" {
			c.Parents = strings.Fields(f[1])
		}
		if f[4] != "" {
			for _, ref := range strings.Split(f[4], ", ") {
				ref = strings.TrimPrefix(ref, "HEAD -> ")
				if ref != "" && ref != "HEAD" {
					c.Refs = append(c.Refs, ref)
				}
			}
		}
		commits = append(commits, c)
	}
	writeJSON(w, http.StatusOK, commits)
}
