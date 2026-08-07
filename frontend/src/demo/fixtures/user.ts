import type { User } from "@/lib/api";
import { registerDemoRoutes } from "@/demo/transport";
import { disableDemoMode } from "@/demo/mode";

export const DEMO_USER: User = {
  id: 1,
  email: "analyst@glenmoor.example",
  full_name: "Glenmoor Endowment (Demo)",
  is_admin: true,
};

export function registerUserFixtures(): void {
  registerDemoRoutes([
    { method: "GET", pattern: /^\/api\/auth\/me$/, handler: () => DEMO_USER },
    {
      method: "POST",
      pattern: /^\/api\/auth\/logout$/,
      // Logging out of the demo ends the demo; AuthContext then sends the
      // visitor to /login, which is a legitimate logged-out state.
      handler: () => {
        disableDemoMode();
        return undefined;
      },
    },
  ]);
}
