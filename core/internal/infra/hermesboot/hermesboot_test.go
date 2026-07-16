package hermesboot

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestDetectPrefersRealInstallsOverManaged(t *testing.T) {
	data := t.TempDir()
	root := t.TempDir()
	t.Setenv("HERMES_ROOT", root)

	// A managed venv exists…
	name := "hermes"
	if runtime.GOOS == "windows" {
		name = "hermes.exe"
	}
	sub := "bin"
	if runtime.GOOS == "windows" {
		sub = "Scripts"
	}
	managed := filepath.Join(managedVenv(data), sub)
	mustWrite(t, filepath.Join(managed, name))

	// …but so does a HERMES_ROOT install, which must win.
	rooted := filepath.Join(root, "hermes-agent", "venv", sub)
	mustWrite(t, filepath.Join(rooted, name))

	rt := Detect(data)
	if rt == nil || rt.Source != "hermes_root" {
		t.Fatalf("Detect = %+v, want source hermes_root", rt)
	}
}

// isolateHome keeps a developer's real ~/.hermes from shadowing the fixture.
func isolateHome(t *testing.T) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
}

func TestDetectFindsManaged(t *testing.T) {
	data := t.TempDir()
	isolateHome(t)
	t.Setenv("HERMES_ROOT", t.TempDir()) // empty — no real install
	t.Setenv("PATH", t.TempDir())        // nothing on PATH either

	sub, name := "bin", "hermes"
	if runtime.GOOS == "windows" {
		sub, name = "Scripts", "hermes.exe"
	}
	mustWrite(t, filepath.Join(managedVenv(data), sub, name))

	rt := Detect(data)
	if rt == nil || rt.Source != "managed" {
		t.Fatalf("Detect = %+v, want source managed", rt)
	}
}

func TestUVTargetNamesARealAsset(t *testing.T) {
	asset, err := uvTarget()
	if err != nil {
		t.Fatal(err)
	}
	if asset == "" {
		t.Fatal("empty asset name")
	}
}

// TestInstallSmoke is the real thing: uv download, managed Python, pinned
// hermes-agent from PyPI, `hermes --version`. It moves hundreds of megabytes,
// so it only runs when asked (AULAR_SMOKE=1) — CI asks, on every OS we ship.
func TestInstallSmoke(t *testing.T) {
	if os.Getenv("AULAR_SMOKE") != "1" {
		t.Skip("set AULAR_SMOKE=1 to run the full install")
	}
	data := t.TempDir()
	isolateHome(t)
	t.Setenv("HERMES_ROOT", t.TempDir()) // force the managed path

	inst := &Installer{}
	inst.Start(data)
	deadline := time.Now().Add(20 * time.Minute)
	for {
		p := inst.Progress()
		switch p.Stage {
		case "done":
			// Assert on the artifact, not Detect — a dev box may also have
			// hermes on PATH, which Detect rightly prefers.
			bin := venvBin(managedVenv(data), "hermes")
			if !exists(bin) {
				t.Fatalf("done, but %s missing", bin)
			}
			t.Logf("installed: %s", bin)
			return
		case "error":
			t.Fatalf("install failed at %s: %s", p.Detail, p.Error)
		}
		if time.Now().After(deadline) {
			t.Fatalf("install timed out at stage %s (%s)", p.Stage, p.Detail)
		}
		time.Sleep(5 * time.Second)
	}
}

func mustWrite(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
}
