package httpapi

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const maxUploadBytes = 25 << 20 // 25 MiB

// GET /media/{name} serves unguessable media files delivered by the Hermes
// AULAR plugin. Filenames are UUID-based and path traversal is rejected by
// reducing the route param to its basename.
func (s *Server) handleMedia(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(strings.TrimSpace(chi.URLParam(r, "name")))
	if name == "" || name == "." || name == string(filepath.Separator) {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.cfg.MediaDir, name))
}

// POST /api/v1/media — accepts a multipart "file" the user is attaching to a
// message, stores it under an unguessable UUID name in MediaDir, and returns
// the descriptor the client then sends with the message.
func (s *Server) handleUploadMedia(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "parse upload: "+err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	if err := os.MkdirAll(s.cfg.MediaDir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "create media dir: "+err.Error())
		return
	}

	name := filepath.Base(header.Filename)
	if name == "" || name == "." {
		name = "attachment"
	}
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	filename := uuid.NewString() + safeMediaExt(name, mimeType)
	dst, err := os.Create(filepath.Join(s.cfg.MediaDir, filename))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "store upload: "+err.Error())
		return
	}
	defer dst.Close()

	written, err := io.Copy(dst, io.LimitReader(file, maxUploadBytes+1))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "write upload: "+err.Error())
		return
	}
	if written > maxUploadBytes {
		os.Remove(filepath.Join(s.cfg.MediaDir, filename))
		writeError(w, http.StatusRequestEntityTooLarge, "file too large (max 25 MiB)")
		return
	}

	writeJSON(w, http.StatusCreated, mediaPayload{
		URL:      "/media/" + filename,
		Name:     name,
		Kind:     mediaKind(mimeType),
		MimeType: mimeType,
		Size:     strconv.FormatInt(written, 10),
	})
}
