import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UncategorizedBanner } from "./UncategorizedBanner";

describe("UncategorizedBanner", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(<UncategorizedBanner count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a warning message when count is positive", () => {
    render(<UncategorizedBanner count={5} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it("includes a link to the categorize page", () => {
    render(<UncategorizedBanner count={3} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/categorize");
  });

  it("uses singular 'transaction' for count of 1", () => {
    render(<UncategorizedBanner count={1} />);
    expect(screen.getByText(/1 uncategorized transaction/i)).toBeInTheDocument();
  });

  it("uses plural 'transactions' for count > 1", () => {
    render(<UncategorizedBanner count={7} />);
    expect(screen.getByText(/7 uncategorized transactions/i)).toBeInTheDocument();
  });
});
