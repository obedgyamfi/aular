package users

import "time"

type User struct {
	ID                   string    `db:"id" json:"id"`
	Email                string    `db:"email" json:"email"`
	DisplayName          string    `db:"display_name" json:"display_name"`
	Timezone             string    `db:"timezone" json:"timezone"`
	Locale               string    `db:"locale" json:"locale"`
	Preferences          []byte    `db:"preferences" json:"preferences"`
	NotificationSettings []byte    `db:"notification_settings" json:"notification_settings"`
	CreatedAt            time.Time `db:"created_at" json:"created_at"`
	UpdatedAt            time.Time `db:"updated_at" json:"updated_at"`
}
