package auth

import "testing"

func TestPasswordRoundTrip(t *testing.T) {
	phc, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !VerifyPassword("correct horse battery staple", phc) {
		t.Fatal("correct password rejected")
	}
	if VerifyPassword("wrong password", phc) {
		t.Fatal("wrong password accepted")
	}
	if VerifyPassword("correct horse battery staple", "$argon2id$garbage") {
		t.Fatal("malformed hash accepted")
	}
}

func TestTokenHashing(t *testing.T) {
	a, err := NewToken()
	if err != nil {
		t.Fatalf("token: %v", err)
	}
	b, _ := NewToken()
	if a == b {
		t.Fatal("tokens not unique")
	}
	if len(a) < 40 {
		t.Fatalf("token too short: %d", len(a))
	}
	if HashToken(a) == HashToken(b) || HashToken(a) == a {
		t.Fatal("hashing broken")
	}
}
