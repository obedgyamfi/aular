//go:build !windows

package hermesboot

import "os/exec"

// HideConsole is a Windows concern; elsewhere there is nothing to hide.
func HideConsole(*exec.Cmd) {}
