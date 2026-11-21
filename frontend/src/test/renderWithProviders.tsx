import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";

export function renderWithProviders(ui: ReactElement, url = "/") {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}
