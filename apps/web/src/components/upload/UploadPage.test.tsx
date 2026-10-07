import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={String(to)} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate
}));

const mockMutateAsync = vi.fn();
const mockInvalidate = vi.fn();
const mockGetMappingFetch = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    transactions: {
      upload: {
        useMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false })
      }
    },
    accounts: {
      list: {
        useQuery: () => ({ data: ACCOUNTS })
      }
    },
    useUtils: () => ({
      transactions: {
        getMapping: { fetch: mockGetMappingFetch },
        invalidate: mockInvalidate
      }
    })
  }
}));

import { UploadPage } from "./UploadPage";

import type { AccountWithBenefits } from "@pnl/types";

const ACCOUNTS: AccountWithBenefits[] = [
  {
    id: "acc-1",
    name: "Checking",
    institution: "Bank",
    type: "CHECKING",
    currency: "MXN",
    last4: "1234",
    color: "#3b82f6",
    createdAt: "2024-01-01T00:00:00.000Z",
    benefits: []
  }
];

const CSV = "Date,Desc,Amt\n2024-01-01,Coffee,-4.50\n";

function makeCsvFile(name = "bank.csv", content = CSV) {
  return new File([content], name, { type: "text/csv" });
}

/** Drops a CSV, maps its columns, and picks an account — leaving the file "Ready". */
async function dropAndMap(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, [file]);

  await screen.findByRole("combobox", { name: /^date$/i });
  await user.selectOptions(screen.getByRole("combobox", { name: /^date$/i }), "Date");
  await user.selectOptions(screen.getByRole("combobox", { name: /^description$/i }), "Desc");
  await user.selectOptions(screen.getByRole("combobox", { name: /^amount$/i }), "Amt");
  await user.click(screen.getByRole("combobox", { name: /account/i }));
  await user.click(await screen.findByRole("option", { name: /checking/i }));
  await user.click(screen.getByRole("button", { name: /confirm mapping/i }));
}

describe("UploadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMappingFetch.mockResolvedValue(null);
    mockMutateAsync.mockResolvedValue({ inserted: 1, duplicates: 0 });
  });

  it("redirects to categorize once every file uploads", async () => {
    const user = userEvent.setup();
    render(<UploadPage />);

    await dropAndMap(user, makeCsvFile());
    await user.click(await screen.findByRole("button", { name: /upload all/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: "/categorize" }));
  });

  it("invalidates the cached transaction list before redirecting", async () => {
    const user = userEvent.setup();
    render(<UploadPage />);

    await dropAndMap(user, makeCsvFile());
    await user.click(await screen.findByRole("button", { name: /upload all/i }));

    await waitFor(() => expect(mockInvalidate).toHaveBeenCalled());
    expect(mockInvalidate.mock.invocationCallOrder[0]!).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]!);
  });

  it("stays on the page when the upload fails", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Worker unreachable"));
    const user = userEvent.setup();
    render(<UploadPage />);

    await dropAndMap(user, makeCsvFile());
    await user.click(await screen.findByRole("button", { name: /upload all/i }));

    expect(await screen.findByText("Worker unreachable")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not redirect before the user uploads anything", async () => {
    const user = userEvent.setup();
    render(<UploadPage />);

    await dropAndMap(user, makeCsvFile());

    expect(screen.getByRole("button", { name: /upload all/i })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("uploads identical rows in one file as separate transactions", async () => {
    const user = userEvent.setup();
    render(<UploadPage />);

    const csv = "Date,Desc,Amt\n2026-01-30,PASE SANTA FE,11.00\n2026-01-30,PASE SANTA FE,11.00\n";
    await dropAndMap(user, makeCsvFile("tolls.csv", csv));
    await user.click(await screen.findByRole("button", { name: /upload all/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const { transactions } = mockMutateAsync.mock.calls[0]![0];
    expect(transactions).toHaveLength(2);
    expect(transactions[0].id).not.toBe(transactions[1].id);
  });
});
