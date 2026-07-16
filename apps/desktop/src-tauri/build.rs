fn main() {
    // The build's identity, for the fresh-data check at startup (pre-1.0,
    // every new build starts from clean app data). The git hash is the only
    // honest id — versions don't move between test builds.
    let build_id = std::process::Command::new("git")
        .args(["rev-parse", "--short=12", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".into());
    println!("cargo:rustc-env=AULAR_BUILD_ID={build_id}");
    println!("cargo:rerun-if-changed=../../../.git/HEAD");

    tauri_build::build()
}
