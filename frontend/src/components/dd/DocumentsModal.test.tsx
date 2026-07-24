import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DocumentsModal from "./DocumentsModal";

const baseProps = {
  dealId: "brightwater_iv",
  documents: [],
  theme: "light" as const,
  onClose: vi.fn(),
  onDocumentDeleted: vi.fn(),
};

describe("DocumentsModal uploads", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lets an admin select multiple supported documents", () => {
    const onUploadDocuments = vi.fn(async () => true);
    render(
      <DocumentsModal
        {...baseProps}
        onUploadDocuments={onUploadDocuments}
      />,
    );

    expect(screen.getByRole("button", { name: "Add documents" })).toBeTruthy();

    const input = screen.getByLabelText(
      "Choose documents to upload",
    ) as HTMLInputElement;
    expect(input.accept).toBe(".pdf,.xlsx,.xls");
    expect(input.multiple).toBe(true);

    const files = [
      new File(["ppm"], "fund-ppm.pdf", { type: "application/pdf" }),
      new File(["track record"], "track-record.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ];
    fireEvent.change(input, { target: { files } });

    expect(onUploadDocuments).toHaveBeenCalledTimes(1);
    expect(onUploadDocuments).toHaveBeenCalledWith(files);
  });

  it("hides upload actions when no admin upload handler is supplied", () => {
    render(<DocumentsModal {...baseProps} />);

    expect(
      screen.queryByRole("button", { name: "Add documents" }),
    ).toBeNull();
    expect(screen.queryByText("Choose documents")).toBeNull();
  });

  it("shows ingestion progress while uploaded documents are processing", () => {
    render(
      <DocumentsModal
        {...baseProps}
        onUploadDocuments={vi.fn(async () => true)}
        uploading
        uploadProgress={{
          upload_id: "upload-1",
          status: "processing",
          stage: "Parsing document",
          percent: 42,
          filename: "fund-ppm.pdf",
        }}
      />,
    );

    const progress = screen.getByRole("progressbar", {
      name: "Document upload progress",
    });
    expect(progress.getAttribute("aria-valuenow")).toBe("42");
    expect(screen.getByText(/Parsing document/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Uploading" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
