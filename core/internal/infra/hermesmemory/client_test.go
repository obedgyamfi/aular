package hermesmemory

import "testing"

func TestExpandMemory(t *testing.T) {
	full := []string{
		"User's office is at 42 Ring Road. User starts work at 9am.",
		"User wants UI work to closely match reference images; consult design skills for visual refinements.",
	}

	cases := []struct {
		name  string
		label string
		want  string
	}{
		{
			name:  "truncated label expands to full entry",
			label: "User wants UI work to closely match reference images; consult design skills for …",
			want:  "User wants UI work to closely match reference images; consult design skills for visual refinements.",
		},
		{
			name:  "non-truncated label passes through",
			label: "User's office is at 42 Ring Road. User starts work at 9am.",
			want:  "User's office is at 42 Ring Road. User starts work at 9am.",
		},
		{
			name:  "no match keeps the truncated label",
			label: "Something the store never wrote down …",
			want:  "Something the store never wrote down …",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := expandMemory(c.label, full); got != c.want {
				t.Fatalf("expandMemory = %q, want %q", got, c.want)
			}
		})
	}
}
