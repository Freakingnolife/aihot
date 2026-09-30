import { redirect } from "react-router";
import type { Route } from "./+types/home";

/** The private reader opens drafts, including when an old home link carries filters. */
export function loader({ request }: Route.LoaderArgs) {
  throw redirect(`/all${new URL(request.url).search}`, { headers: { "Cache-Control": "private, no-store" } });
}

export default function Home() { return null; }
