//go:build windows

package hermesproc

import "syscall"

// detachAttrs puts the gateway in its own process group so a core-api restart
// doesn't take the user's agents down with it. CREATE_NEW_PROCESS_GROUP is
// the Windows spelling of Setsid; DETACHED_PROCESS keeps it off our console.
func detachAttrs() *syscall.SysProcAttr {
	const createNewProcessGroup = 0x00000200
	const detachedProcess = 0x00000008
	return &syscall.SysProcAttr{
		CreationFlags: createNewProcessGroup | detachedProcess,
	}
}
