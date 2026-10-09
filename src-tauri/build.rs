fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let source = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("resources/acrylic");
        let output = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
        let destination = output.ancestors().nth(3).unwrap().join("resources/acrylic");
        std::fs::create_dir_all(&destination).unwrap();
        for name in [
            "quickmd-acrylic.dll",
            "Microsoft.WindowsAppRuntime.Bootstrap.dll",
            "SDK-LICENSE.txt",
            "CPPWINRT-LICENSE.txt",
        ] {
            let path = source.join(name);
            println!("cargo:rerun-if-changed={}", path.display());
            std::fs::copy(&path, destination.join(name)).unwrap_or_else(|_| {
                panic!(
                    "Run npm run prepare:acrylic before native builds; missing {}",
                    path.display()
                )
            });
        }
    }
    println!("cargo:rerun-if-changed=../dist");
    println!("cargo:rerun-if-changed=../WELCOME_CONTENT.md");
    println!("cargo:rerun-if-changed=../MD_GUIDE_CONTENT.md");
    tauri_build::build()
}
