const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { execFileSync } = require("node:child_process");
if (process.platform !== "win32") process.exit(0);
const root = path.resolve(__dirname, ".."),
  cache = path.join(root, ".scratch/desktop-acrylic-sdk");
fs.mkdirSync(cache, { recursive: true });
const packages = [
  [
    "microsoft.windowsappsdk.foundation",
    "2.3.12",
    "ce04d01d68cb16b5dc85a5c9efb8162dba876bc2e5b766b5968979899d4efa9e",
  ],
  [
    "microsoft.windowsappsdk.interactiveexperiences",
    "2.1.9",
    "f9159d73e3e46717f159606e43b4acf8336aaff5bdd4d395fe3a93fdb41437ac",
  ],
  [
    "microsoft.windows.cppwinrt",
    "2.0.240405.15",
    "e889007b5d9235931e7340ddf737d2c346eebdd23c619f1f4f2426a2aae47180",
  ],
];
function psLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}
(async () => {
  for (const [id, version, hash] of packages) {
    const archive = path.join(cache, `${id}.${version}.nupkg`),
      destination = path.join(cache, `${id}.${version}`);
    if (!fs.existsSync(archive)) {
      const response = await fetch(
        `https://api.nuget.org/v3-flatcontainer/${id}/${version}/${id}.${version}.nupkg`,
      );
      if (!response.ok) throw Error(`SDK download failed: ${id}`);
      fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    }
    if (
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(archive))
        .digest("hex") !== hash
    )
      throw Error(`SDK package hash mismatch: ${id}`);
    if (!fs.existsSync(destination)) {
      const code = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${psLiteral(archive)},${psLiteral(destination)})`;
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-EncodedCommand",
          Buffer.from(code, "utf16le").toString("base64"),
        ],
        { stdio: "pipe", windowsHide: true },
      );
    }
  }
  const generated = path.join(cache, "generated");
  if (
    !fs.existsSync(
      path.join(
        generated,
        "winrt",
        "Microsoft.UI.Composition.SystemBackdrops.h",
      ),
    )
  ) {
    execFileSync(
      path.join(
        cache,
        "microsoft.windows.cppwinrt.2.0.240405.15",
        "bin",
        "cppwinrt.exe",
      ),
      [
        "-in",
        "local",
        "-in",
        path.join(
          cache,
          "microsoft.windowsappsdk.interactiveexperiences.2.1.9",
          "metadata",
          "10.0.18362.0",
        ),
        "-out",
        generated,
      ],
      { stdio: "inherit", windowsHide: true },
    );
  }
  execFileSync(
    "cmd.exe",
    ["/d", "/c", path.join(root, "scripts", "build-acrylic.cmd")],
    { stdio: "inherit", windowsHide: true, cwd: root },
  );
  fs.copyFileSync(
    path.join(cache, "microsoft.windows.cppwinrt.2.0.240405.15", "LICENSE"),
    path.join(root, "src-tauri/resources/acrylic/CPPWINRT-LICENSE.txt"),
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
