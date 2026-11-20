import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import FoundationPage from "./FoundationPage";

test("renders brand header and token swatches", () => {
  globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: "ok", db: true, demo_mode: true }))));
  render(<QueryClientProvider client={new QueryClient()}><FoundationPage /></QueryClientProvider>);
  expect(screen.getByRole("heading", { name: "PRIME" })).toBeInTheDocument();
  expect(screen.getByText("brand-600")).toBeInTheDocument();
});
