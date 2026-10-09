const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process");
const root = path.resolve(__dirname, "..");
process.chdir(root);
const chunks = [
  "QuickMD third-party dependency licenses\nGenerated from package-lock.json and Windows Cargo metadata.\nOwn source: MIT; dependency notices below retain upstream terms.\n",
];
const collect = (directory, label) => {
  if (!fs.existsSync(directory)) return;
  for (const name of fs
    .readdirSync(directory)
    .filter((n) =>
      /^licen[sc]e(?:[.\-_]|$)|^copying(?:[.\-_]|$)|^notice(?:[.\-_]|$)/i.test(
        n,
      ),
    )) {
    const file = path.join(directory, name);
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 150000)
      continue;
    chunks.push(
      `\n${label} / ${name}\n${"-".repeat(60)}\n${fs.readFileSync(file, "utf8")}\n`,
    );
  }
};
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
let npmCount = 0;
for (const [location, pkg] of Object.entries(lock.packages)) {
  if (!location || pkg.dev) continue;
  npmCount++;
  const name = location.split("node_modules/").pop();
  chunks.push(
    `\nnpm: ${name}@${pkg.version}\nSPDX: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license || "See package license")}\nSource: ${pkg.resolved || "npm registry"}\n`,
  );
  collect(path.join(root, location), name);
}
const metadata = JSON.parse(
  cp.execFileSync(
    "cargo",
    [
      "metadata",
      "--locked",
      "--format-version",
      "1",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--filter-platform",
      "x86_64-pc-windows-msvc",
    ],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
  ),
);
const nodes = new Set(metadata.resolve.nodes.map((n) => n.id));
let rustCount = 0;
for (const pkg of metadata.packages) {
  if (pkg.name === "quickmd" || !nodes.has(pkg.id)) continue;
  rustCount++;
  chunks.push(
    `\nRust: ${pkg.name}@${pkg.version}\nSPDX: ${pkg.license || "See crate license"}\nSource: ${pkg.repository || "crates.io"}\n`,
  );
  collect(path.dirname(pkg.manifest_path), pkg.name);
}
fs.mkdirSync("docs/licenses", { recursive: true });
fs.writeFileSync("docs/third-party-licenses.txt", chunks.join(""), "utf8");
console.log(
  JSON.stringify({
    npmPackages: npmCount,
    rustPackages: rustCount,
    file: "docs/third-party-licenses.txt",
  }),
);
(async () => {
  const response = await fetch("https://lucide.dev/license.md");
  if (!response.ok) throw Error("Unable to retrieve Lucide license");
  fs.writeFileSync(
    "docs/licenses/lucide-isc-and-feather-mit.txt",
    await response.text(),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
