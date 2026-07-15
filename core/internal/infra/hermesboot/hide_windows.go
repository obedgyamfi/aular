//go:build windows

package hermesboot

import (
	"os/exec"
	"syscall"
)

// HideConsole keeps a console-subsystem child (python, uv, hermes) from
// popping a visible console window when its parent is a GUI app's sidecar.
func HideConsole(cmd *exec.Cmd) {
	const createNoWindow = 0x08000000
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
}
