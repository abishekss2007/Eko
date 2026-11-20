import Dashboard from "./Dashboard";
import { AuthPage } from "./pages/AuthPage";
import { LandingPage } from "./pages/LandingPage";
import { useRoute } from "./lib/router";

/** Landing → sign up / log in → the app. Guests can go straight to /app. */
export default function App() {
  const { route, search } = useRoute();
  switch (route) {
    case "/login":
      return <AuthPage key="login" mode="login" />;
    case "/signup":
      return <AuthPage key="signup" mode="signup" />;
    case "/app":
      return <Dashboard startDemo={search.get("demo") === "1"} />;
    default:
      return <LandingPage />;
  }
}
