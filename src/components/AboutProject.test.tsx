import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import AboutProject, { type ProjectInformation } from "./AboutProject";
import { checkVersionUpdate, openProjectLink } from "../commands";
import i18n from "../i18n";
import metadata from "../../package.json";

vi.mock("../commands", () => ({
  checkVersionUpdate: vi.fn(),
  openProjectLink: vi.fn().mockResolvedValue(undefined),
}));
beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("zh-CN");
});
it("shows actual version and pending author details without checking the network", async () => {
  const close = vi.fn();
  const empty: ProjectInformation = {
    repository: "https://github.com/druidjay325-tech/QuickMD",
    license: "MIT",
    author: { name: "Jay", contacts: [] },
    support: { message: { en: "", "zh-CN": "" }, links: [], qrCodes: [] },
  };
  render(<AboutProject onClose={close} info={empty} />);
  expect(screen.getByText(metadata.version)).toBeTruthy();
  expect(screen.getByText("To be added by the author")).toBeTruthy();
  expect(checkVersionUpdate).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Support the author" }),
  ).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
it("checks only on request, prevents duplicates and opens the returned release", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof checkVersionUpdate>>) => void;
  vi.mocked(checkVersionUpdate).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<AboutProject onClose={() => {}} />);
  const button = screen.getByRole("button", { name: "Check for updates" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(checkVersionUpdate).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("button", { name: "Checking…" }).hasAttribute("disabled"),
  ).toBe(true);
  await act(async () =>
    resolve({
      status: "update-available",
      currentVersion: metadata.version,
      latestVersion: "9.0.0",
      releaseUrl:
        "https://github.com/druidjay325-tech/QuickMD/releases/tag/v9.0.0",
    }),
  );
  expect(screen.getByText("Version 9.0.0 is available.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open releases" }));
  await waitFor(() =>
    expect(openProjectLink).toHaveBeenCalledWith(
      "https://github.com/druidjay325-tech/QuickMD/releases/tag/v9.0.0",
    ),
  );
});
it("reports missing releases and failures honestly and allows retry", async () => {
  vi.mocked(checkVersionUpdate)
    .mockResolvedValueOnce({
      status: "no-release",
      currentVersion: metadata.version,
      latestVersion: null,
      releaseUrl: "https://github.com/druidjay325-tech/QuickMD/releases",
    })
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      status: "up-to-date",
      currentVersion: metadata.version,
      latestVersion: metadata.version,
      releaseUrl: null,
    });
  render(<AboutProject onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  await screen.findByText(
    "No stable release was found. Check GitHub Releases.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  await screen.findByText("Could not check for updates. Try again later.");
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  await screen.findByText("You have the latest stable release.");
});
it("shows selectable email text without launching mail, while support links still work", async () => {
  await i18n.changeLanguage("zh-CN");
  const info: ProjectInformation = {
    repository: "https://github.com/druidjay325-tech/QuickMD",
    license: "MIT",
    author: {
      name: "Jay",
      contacts: [{ label: "Email", url: "mailto:author@example.com" }],
    },
    support: {
      message: { en: "Thank you", "zh-CN": "谢谢" },
      links: [{ label: "Support page", url: "https://example.com/support" }],
      qrCodes: [{ label: "Scan to support", image: "/support/author.png" }],
    },
  };
  render(<AboutProject info={info} onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Email" })).toBeNull();
  const email = screen.getByText("author@example.com");
  expect(email.tagName).toBe("DD");
  fireEvent.click(email);
  expect(openProjectLink).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "支持作者" }));
  expect(screen.getByText("谢谢")).toBeTruthy();
  expect(screen.getByAltText("Scan to support").getAttribute("src")).toBe(
    "/support/author.png",
  );
  fireEvent.click(screen.getByRole("button", { name: "Support page" }));
  expect(openProjectLink).toHaveBeenCalledWith("https://example.com/support");
});
it("shows the exact Chinese support copy and removes the support route when switching language", async () => {
  await i18n.changeLanguage("zh-CN");
  const close = vi.fn();
  render(<AboutProject onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: "支持作者" }));
  expect(
    screen.getByText(
      "如果 QuickMD 为你留住了好点子，欢迎打赏作者一点token钱，助力作者早日灵活就业。支持完全自愿。",
    ),
  ).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog", { name: "关于本项目" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "支持作者" }));
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByRole("dialog", { name: "About QuickMD" })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Support the author" }),
  ).toBeNull();
  expect(screen.queryByText(/token钱/)).toBeNull();
  expect(close).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Check for updates" }),
  ).toBeTruthy();
});
