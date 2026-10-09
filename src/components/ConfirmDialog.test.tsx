import { it, expect } from "vitest";
import { act, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openConfirmDialog } from "./ConfirmDialog";
it("Esc 取消明确返回 null", async () => {
  let result!: Promise<string | null>;
  act(() => {
    result = openConfirmDialog({
      title: "Unsaved",
      buttons: [
        { text: "Save", value: "save", primary: true },
        { text: "Cancel", value: "cancel" },
      ],
    });
  });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(await result).toBeNull();
});
it("Enter 执行当前焦点按钮而不是强制 primary", async () => {
  const user = userEvent.setup();
  let result!: Promise<string | null>;
  act(() => {
    result = openConfirmDialog({
      title: "Unsaved",
      buttons: [
        { text: "Save", value: "save", primary: true },
        { text: "Cancel", value: "cancel" },
      ],
    });
  });
  screen.getByRole("button", { name: "Cancel" }).focus();
  await user.keyboard("{Enter}");
  expect(await result).toBe("cancel");
});
