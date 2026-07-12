// Command aular-core is the open shell's backend, run as a Tauri sidecar.
//
// This is the FREE build: it links engine.Noop, so agents chat and use tools
// but do not form an organization. The commercial build lives in the private
// aular-engine repository and links the real engine through the same
// interface — this file is the only thing that differs between them.
package main

import (
	"log"

	"github.com/obedgyamfi/aular/core/engine"
	"github.com/obedgyamfi/aular/core/server"
)

func main() {
	if err := server.Run(engine.Noop{}); err != nil {
		log.Fatalf("aular-core: %v", err)
	}
}
