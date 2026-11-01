import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DropZone } from "./DropZone";

function makeFile(name: string, type = "text/csv") {
  return new File(["col1,col2\nval1,val2"], name, { type });
}

describe("DropZone", () => {
  it("calls onFiles with only CSV files when mixed files are dropped", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const csvFile = makeFile("bank.csv");
    const txtFile = makeFile("notes.txt", "text/plain");

    await userEvent.upload(input, [csvFile, txtFile]);

    expect(onFiles).toHaveBeenCalledOnce();
    const received: File[] = onFiles.mock.calls[0][0];
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe("bank.csv");
  });

  it("passes multiple CSV files to onFiles", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, [makeFile("a.csv"), makeFile("b.csv")]);

    const received: File[] = onFiles.mock.calls[0][0];
    expect(received).toHaveLength(2);
  });

  it("passes .xlsx files to onFiles", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(
      input,
      makeFile("statement.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    );

    expect(onFiles).toHaveBeenCalledOnce();
    const received: File[] = onFiles.mock.calls[0][0];
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe("statement.xlsx");
  });

  it("passes .xls files to onFiles", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, makeFile("statement.xls", "application/vnd.ms-excel"));

    expect(onFiles).toHaveBeenCalledOnce();
    const received: File[] = onFiles.mock.calls[0][0];
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe("statement.xls");
  });

  it("filters out files that are not csv/xlsx/xls", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const xlsx = makeFile("bank.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const pdf = makeFile("notes.pdf", "application/pdf");

    await userEvent.upload(input, [xlsx, pdf]);

    const received: File[] = onFiles.mock.calls[0][0];
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe("bank.xlsx");
  });

  it("shows instructional text mentioning supported formats", () => {
    render(<DropZone onFiles={vi.fn()} />);
    expect(screen.getByText(/csv|xlsx/i)).toBeInTheDocument();
  });
  // A popup elsewhere on the page (e.g. the Account select) lays a full-screen
  // backdrop over the drop zone, so the drop lands on that instead (LAG-42).
  it("accepts files dropped outside the zone, such as on a popup backdrop", () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);

    const backdrop = document.createElement("div");
    document.body.appendChild(backdrop);
    const dataTransfer = { types: ["Files"], files: [makeFile("bank.csv")] };
    fireEvent.dragOver(backdrop, { dataTransfer });
    const notCancelled = fireEvent.drop(backdrop, { dataTransfer });

    expect(notCancelled).toBe(false);
    expect(onFiles).toHaveBeenCalledOnce();
    expect(onFiles.mock.calls[0][0][0].name).toBe("bank.csv");
    backdrop.remove();
  });

  it("handles a drop on the zone itself only once", () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} />);

    const dataTransfer = { types: ["Files"], files: [makeFile("bank.csv")] };
    fireEvent.drop(screen.getByLabelText("Drop zone"), { dataTransfer });

    expect(onFiles).toHaveBeenCalledOnce();
  });

  it("ignores drops outside the zone while disabled", () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} disabled />);

    fireEvent.drop(document.body, { dataTransfer: { types: ["Files"], files: [makeFile("bank.csv")] } });

    expect(onFiles).not.toHaveBeenCalled();
  });
});
