//go:build unix

package hermesproc

import "syscall"

// detachAttrs puts the gateway in its own process group so a core-api restart
// (or a Ctrl-C in a dev shell) doesn't take the user's agents down with it.
func detachAttrs() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}
