import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VelocitySparkline } from "@/app/dashboard/skus/VelocitySparkline";

describe("VelocitySparkline", () => {
  it("<2 точки → —", () => {
    const { container } = render(<VelocitySparkline points={[]} />);
    expect(container.textContent).toBe("—");
  });

  it("1 точка → —", () => {
    const { container } = render(<VelocitySparkline points={[5]} />);
    expect(container.textContent).toBe("—");
  });

  it("возрастающий — green", () => {
    const { container } = render(<VelocitySparkline points={[1, 2, 3, 4, 5]} />);
    expect(container.querySelector("div[style*='width: 80px']")).toBeInTheDocument();
  });

  it("убывающий — red", () => {
    const { container } = render(<VelocitySparkline points={[5, 4, 3, 2, 1]} />);
    expect(container.querySelector("div[style*='height: 24px']")).toBeInTheDocument();
  });

  it("плоский — gray", () => {
    const { container } = render(<VelocitySparkline points={[3, 3, 3]} />);
    expect(container.firstChild).toBeTruthy();
  });
});
